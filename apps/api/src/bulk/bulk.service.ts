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

  /**
   * Removes an import from the history.
   *
   * Deletes the RECORD, not the WORK. Medicines added or stock updated by this
   * job stay exactly as they are — an import is not a transaction you can roll
   * back, and pretending otherwise would be the most dangerous button in the
   * product. The confirmation says so in as many words.
   *
   * Only a finished job can go. A running one would leave the worker writing
   * progress to a row that no longer exists, so those must be cancelled first.
   *
   * The three stored files go with it — source, failed rows and full report.
   * Leaving them behind would mean a bucket that only ever grows, holding
   * files nothing references.
   */
  async remove(jobId: string, user: SessionUser): Promise<{ removed: true }> {
    const job = await this.requireJob(jobId, user)

    /*
     * Anything the worker is not actively processing can go — including a job
     * parked at AWAITING_CONFIRMATION or PAUSED. Those are stale records
     * cluttering somebody's list, and making them cancel first before they can
     * remove is two steps to achieve one thing.
     *
     * PENDING, VALIDATING and IMPORTING are the real exclusions: deleting one
     * of those leaves the worker writing progress to a row that has gone.
     */
    if (ACTIVE_BULK_STATUSES.includes(job.status as never)) {
      throw new AppException(ApiErrorCode.INVALID_STATUS_TRANSITION, {
        fields: [
          {
            field: 'id',
            message: 'This import is still running. Cancel it first, then remove it.',
          },
        ],
      })
    }

    for (const key of [job.fileKey, job.errorFileKey, job.resultFileKey]) {
      // A missing file must not block the delete: the row is the thing being
      // removed, and a storage gap is not the user's problem to solve.
      if (key && key !== 'pending') await this.storage.remove(key).catch(() => undefined)
    }

    await this.db.run(async (tx) => {
      // bulk_job_errors cascade on the foreign key, so the rows go with it.
      await tx.bulkJob.delete({ where: { id: jobId } })
      await tx.auditLog.create({
        data: {
          companyId: job.companyId,
          actorId: user.id,
          action: 'DELETE_BULK_JOB',
          entityType: 'BulkJob',
          entityId: jobId,
          before: {
            type: job.type,
            fileName: job.fileName,
            status: job.status,
            createCount: job.createCount,
          } as never,
        },
      })
    })

    this.logger.log(`Bulk job removed from history: ${jobId}`)
    return { removed: true }
  }

  /**
   * What an import actually did, row by row.
   *
   * Read back from the result file rather than a table. The outcomes are not
   * persisted as rows on purpose — storing 50,000 of them to show 50 is waste
   * — but the CSV is already written and is the same thing, so parsing it back
   * gives an in-app review without a new table to keep in step.
   *
   * Capped, because this exists to let somebody check what happened, not to
   * page through a 50,000-row file in a browser. The full list is the download.
   */
  async getRows(
    jobId: string,
    user: SessionUser,
    filter?: string,
  ): Promise<{ rows: Array<{ rowNumber: number; record: string; result: string; detail: string }>; truncated: boolean }> {
    const job = await this.requireJob(jobId, user)
    if (!job.resultFileKey || !(await this.storage.exists(job.resultFileKey))) {
      return { rows: [], truncated: false }
    }

    const chunks: Buffer[] = []
    for await (const chunk of this.storage.createReadStream(job.resultFileKey)) {
      chunks.push(chunk as Buffer)
    }
    const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/).filter(Boolean)

    const rows: Array<{ rowNumber: number; record: string; result: string; detail: string }> = []
    let truncated = false

    // Skip the header. The writer emits a fixed four-column shape.
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line)
      const result = (cells[2] ?? '').trim()
      if (filter && result !== filter) continue

      if (rows.length >= BULK_LIMITS.previewSampleSize * 8) {
        truncated = true
        break
      }
      rows.push({
        rowNumber: Number(cells[0] ?? 0),
        record: cells[1] ?? '',
        result,
        detail: cells[3] ?? '',
      })
    }

    return { rows, truncated }
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
    canRemove: !ACTIVE_BULK_STATUSES.includes(status),
  }
}

/**
 * Minimal CSV line split that respects quoted cells.
 *
 * The reports are written by our own formatter, so the only quoting to handle
 * is the one it produces: double quotes around a cell, doubled inside it.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else inQuotes = false
      } else current += char
    } else if (char === '"') inQuotes = true
    else if (char === ',') {
      cells.push(current)
      current = ''
    } else current += char
  }
  cells.push(current)
  return cells
}
