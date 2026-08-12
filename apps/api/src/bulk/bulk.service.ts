import { Injectable, Logger } from '@nestjs/common'
import {
  ACTIVE_BULK_STATUSES,
  ALLOWED_BULK_MIME_TYPES,
  ApiErrorCode,
  BULK_LIMITS,
  type BulkJobListQuery,
  type BulkJobPreview,
  BulkJobStatus,
  type BulkJobSummary,
  type BulkJobType,
  type BulkUploadOptions,
  type Paginated,
  type SessionUser,
  TERMINAL_BULK_STATUSES,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'
import { BulkQueue } from './bulk.queue'
import { BulkHandlerRegistry } from './handlers/registry'
import { ReportWriter } from './parsing/report-writer'
import { FileStorage } from '../common/storage/file-storage'

@Injectable()
export class BulkService {
  private readonly logger = new Logger(BulkService.name)

  constructor(
    private readonly db: TenantPrismaService,
    private readonly registry: BulkHandlerRegistry,
    private readonly storage: FileStorage,
    private readonly reports: ReportWriter,
    private readonly queue: BulkQueue,
  ) {}

  async buildTemplate(type: BulkJobType, user: SessionUser): Promise<Buffer> {
    const handler = this.registry.get(type)
    handler.authorize(user)
    return this.reports.buildTemplate(handler.columns, handler.templateSheetName)
  }

  /**
   * Accepts an upload and queues validation.
   *
   * Returns immediately — the caller polls the job. A 50,000-row file must
   * never be parsed inside the request.
   */
  async createJob(
    type: BulkJobType,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    options: BulkUploadOptions,
    user: SessionUser,
  ): Promise<BulkJobSummary> {
    const handler = this.registry.get(type)
    const scope = handler.authorize(user)

    if (file.size > BULK_LIMITS.maxFileBytes) {
      throw new AppException(ApiErrorCode.FILE_TOO_LARGE)
    }

    const looksAllowed =
      (ALLOWED_BULK_MIME_TYPES as readonly string[]).includes(file.mimetype) ||
      /\.(csv|xlsx|xls)$/i.test(file.originalname)
    if (!looksAllowed) {
      throw new AppException(ApiErrorCode.FILE_TYPE_NOT_ALLOWED)
    }

    // One active import per user: two runs of the same sheet would race.
    const active = await this.db.run((tx) =>
      tx.bulkJob.count({
        where: { createdById: user.id, status: { in: [...ACTIVE_BULK_STATUSES] } },
      }),
    )
    if (active >= BULK_LIMITS.maxConcurrentPerUser) {
      throw new AppException(ApiErrorCode.CONFLICT, {
        fields: [
          {
            field: 'file',
            message: 'You already have an import running. Please wait for it to finish.',
          },
        ],
      })
    }

    const warehouseId = await this.resolveWarehouseScope(user, scope.role)

    const job = await this.db.run((tx) =>
      tx.bulkJob.create({
        data: {
          type,
          status: BulkJobStatus.PENDING,
          createdById: user.id,
          // Taken from the signed-in user's company, never from the request.
          // Non-null because an import always belongs to exactly one tenant;
          // the platform owner imports into the global catalogue explicitly.
          companyId: requireCompany(user),
          scopeId: warehouseId ?? null,
          fileKey: 'pending',
          fileName: file.originalname.slice(0, 255),
          sizeBytes: file.size,
          options: { dryRun: options.dryRun },
        },
      }),
    )

    // The key is derived from the job id, never from the uploaded file name.
    const fileKey = this.storage.buildKey({
      scope: 'bulk',
      id: job.id,
      name: `source${extensionOf(file.originalname)}`,
    })
    await this.storage.write(fileKey, file.buffer)
    await this.db.run((tx) => tx.bulkJob.update({ where: { id: job.id }, data: { fileKey } }))

    await this.queue.enqueue({ jobId: job.id, pass: 'validate' })

    return this.getJob(job.id, user)
  }

  async getJob(jobId: string, user: SessionUser): Promise<BulkJobSummary> {
    const job = await this.db.run((tx) =>
      tx.bulkJob.findUnique({
        where: { id: jobId },
        include: { createdBy: { select: { fullName: true } } },
      }),
    )
    if (!job) throw new AppException(ApiErrorCode.NOT_FOUND)
    this.assertOwnership(job, user)
    return toSummary(job)
  }

  /** The dry-run result: counts, a sample of planned changes, and problems. */
  async getPreview(jobId: string, user: SessionUser): Promise<BulkJobPreview> {
    const summary = await this.getJob(jobId, user)

    const issues = await this.db.run((tx) =>
      tx.bulkJobError.findMany({
        where: { jobId },
        orderBy: { rowNumber: 'asc' },
        take: BULK_LIMITS.previewSampleSize,
        select: { rowNumber: true, column: true, value: true, message: true },
      }),
    )

    return {
      job: summary,
      // The planned rows are not persisted — the counts and the issue list are
      // what the user decides on. Storing 50,000 plans to show 25 is waste.
      sample: [],
      issues: issues.map((issue) => ({
        rowNumber: issue.rowNumber,
        column: issue.column ?? undefined,
        value: issue.value ?? undefined,
        message: issue.message,
      })),
    }
  }

  async confirm(jobId: string, user: SessionUser): Promise<BulkJobSummary> {
    const job = await this.requireJob(jobId, user)

    if (job.status !== BulkJobStatus.AWAITING_CONFIRMATION) {
      throw new AppException(ApiErrorCode.INVALID_STATUS_TRANSITION)
    }
    if ((job.options as { dryRun?: boolean })?.dryRun) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [
          {
            field: 'confirm',
            message: 'This was a check-only run. Upload the file again to import it.',
          },
        ],
      })
    }

    await this.db.run((tx) =>
      tx.bulkJob.update({
        where: { id: jobId },
        data: { confirmedAt: new Date(), processedRows: 0 },
      }),
    )
    await this.queue.enqueue({ jobId, pass: 'apply' })

    return this.getJob(jobId, user)
  }

  /**
   * Pause is cooperative: the worker checks the status between batches and
   * stops cleanly, leaving processedRows as the resume checkpoint.
   */
  async pause(jobId: string, user: SessionUser): Promise<BulkJobSummary> {
    const job = await this.requireJob(jobId, user)
    if (!ACTIVE_BULK_STATUSES.includes(job.status as never)) {
      throw new AppException(ApiErrorCode.INVALID_STATUS_TRANSITION)
    }
    await this.db.run((tx) =>
      tx.bulkJob.update({ where: { id: jobId }, data: { status: BulkJobStatus.PAUSED } }),
    )
    return this.getJob(jobId, user)
  }

  /**
   * Picks a job back up from its checkpoint.
   *
   * Allowed from FAILED as well as PAUSED. A job that died partway has already
   * written everything before `processedRows`, so re-uploading the whole file
   * would duplicate that work — resuming imports only what is left, which is
   * what somebody staring at a half-finished import actually wants.
   */
  async resume(jobId: string, user: SessionUser): Promise<BulkJobSummary> {
    const job = await this.requireJob(jobId, user)
    if (job.status !== BulkJobStatus.PAUSED && job.status !== BulkJobStatus.FAILED) {
      throw new AppException(ApiErrorCode.INVALID_STATUS_TRANSITION)
    }
    // The processor reads PAUSED to know it is resuming and where from.
    await this.queue.enqueue({ jobId, pass: job.confirmedAt ? 'apply' : 'validate' })
    return this.getJob(jobId, user)
  }

  async cancel(jobId: string, user: SessionUser): Promise<BulkJobSummary> {
    const job = await this.requireJob(jobId, user)
    if (TERMINAL_BULK_STATUSES.includes(job.status as never)) {
      throw new AppException(ApiErrorCode.INVALID_STATUS_TRANSITION)
    }
    await this.db.run((tx) =>
      tx.bulkJob.update({
        where: { id: jobId },
        data: { status: BulkJobStatus.CANCELLED, finishedAt: new Date() },
      }),
    )
    return this.getJob(jobId, user)
  }

  async list(query: BulkJobListQuery, user: SessionUser): Promise<Paginated<BulkJobSummary>> {
    const where = {
      // Admins see everything; everyone else sees only their own imports.
      ...(user.role === 'ADMIN' ? {} : { createdById: user.id }),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    }

    const [items, total] = await this.db.run((tx) =>
      Promise.all([
        tx.bulkJob.findMany({
          where,
          include: { createdBy: { select: { fullName: true } } },
          orderBy: { queuedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.bulkJob.count({ where }),
      ]),
    )

    return {
      items: items.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async openReport(
    jobId: string,
    kind: 'errors' | 'result',
    user: SessionUser,
  ): Promise<{ stream: NodeJS.ReadableStream; fileName: string }> {
    const job = await this.requireJob(jobId, user)
    const key = kind === 'errors' ? job.errorFileKey : job.resultFileKey
    if (!key || !(await this.storage.exists(key))) throw new AppException(ApiErrorCode.NOT_FOUND)

    return {
      stream: this.storage.createReadStream(key),
      fileName: kind === 'errors' ? 'import-errors.csv' : 'import-result.csv',
    }
  }

  // -------------------------------------------------------------------------

  private async requireJob(jobId: string, user: SessionUser) {
    const job = await this.db.run((tx) => tx.bulkJob.findUnique({ where: { id: jobId } }))
    if (!job) throw new AppException(ApiErrorCode.NOT_FOUND)
    this.assertOwnership(job, user)
    return job
  }

  /** Admins may act on any job; everyone else only on their own. */
  private assertOwnership(job: { createdById: string }, user: SessionUser): void {
    if (user.role !== 'ADMIN' && job.createdById !== user.id) {
      throw new AppException(ApiErrorCode.FORBIDDEN)
    }
  }

  /**
   * Which warehouse a seller's import writes into.
   *
   * Taken from the signed-in user's company, never from the file — that is what
   * stops a crafted spreadsheet from writing into someone else's stock. A
   * company with several warehouses imports into its default one until the
   * wizard offers a choice.
   */
  private async resolveWarehouseScope(
    user: SessionUser,
    role: string,
  ): Promise<string | undefined> {
    if (role !== 'DISTRIBUTOR') return undefined

    const warehouse = await this.db.run((tx) =>
      tx.warehouse.findFirst({
        where: { companyId: requireCompany(user), deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { id: true },
      }),
    )
    if (!warehouse) throw new AppException(ApiErrorCode.FORBIDDEN)
    return warehouse.id
  }
}

/** An import must have a tenant. The platform owner picks one explicitly. */
function requireCompany(user: SessionUser): string {
  if (!user.companyId) {
    throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
      fields: [{ field: 'company', message: 'Choose which company to import into.' }],
    })
  }
  return user.companyId
}

function extensionOf(fileName: string): string {
  const match = /\.(csv|xlsx|xls)$/i.exec(fileName)
  return match ? match[0].toLowerCase() : '.csv'
}

function toSummary(job: {
  id: string
  type: string
  status: string
  fileName: string
  sizeBytes: number
  totalRows: number | null
  processedRows: number
  createCount: number
  updateCount: number
  skipCount: number
  errorCount: number
  errorsTruncated: boolean
  errorFileKey: string | null
  resultFileKey: string | null
  queuedAt: Date
  validatedAt: Date | null
  confirmedAt: Date | null
  finishedAt: Date | null
  failureReason: string | null
  createdBy?: { fullName: string }
}): BulkJobSummary {
  const status = job.status as BulkJobStatus

  return {
    id: job.id,
    type: job.type as BulkJobType,
    status,
    fileName: job.fileName,
    sizeBytes: job.sizeBytes,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    createCount: job.createCount,
    updateCount: job.updateCount,
    skipCount: job.skipCount,
    errorCount: job.errorCount,
    errorsTruncated: job.errorsTruncated,
    progressPercent:
      job.totalRows && job.totalRows > 0
        ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))
        : null,
    hasErrorFile: Boolean(job.errorFileKey),
    hasResultFile: Boolean(job.resultFileKey),
    createdByName: job.createdBy?.fullName ?? '',
    queuedAt: job.queuedAt.toISOString(),
    validatedAt: job.validatedAt?.toISOString() ?? null,
    confirmedAt: job.confirmedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    failureReason: job.failureReason,
    canConfirm: status === BulkJobStatus.AWAITING_CONFIRMATION,
    canPause: ACTIVE_BULK_STATUSES.includes(status),
    canResume: status === BulkJobStatus.PAUSED || status === BulkJobStatus.FAILED,
    canCancel: !TERMINAL_BULK_STATUSES.includes(status),
  }
}
