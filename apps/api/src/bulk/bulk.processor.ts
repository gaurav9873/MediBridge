import { Injectable, Logger } from '@nestjs/common'
import { BULK_LIMITS, BulkJobStatus, type RowIssue } from '@medibridge/types'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'
import type { AnyBulkHandler, BulkScope, ParsedRow } from './handlers/bulk-handler'
import { BulkHandlerRegistry } from './handlers/registry'
import { batched, openRowReader } from './parsing/row-reader'
import { ReportWriter } from './parsing/report-writer'
import { FileStorage } from './storage/file-storage'

/**
 * The two-pass engine.
 *
 *   validate() — streams the file, checks everything, writes the counts and
 *                the error file. Touches no business tables.
 *   apply()    — streams it again and writes, in batches of 500.
 *
 * Reading twice is deliberate: keeping 50,000 parsed rows between the passes
 * costs more than re-reading, and the second pass has to re-check anyway
 * because the database can change between preview and confirm.
 */
@Injectable()
export class BulkProcessor {
  private readonly logger = new Logger(BulkProcessor.name)

  /*
   * The worker runs outside any request, so there is no ambient tenant. Every
   * database call therefore goes through runAs(job.companyId) — the tenant is
   * taken from the job record, which was stamped from the uploader's session.
   */
  constructor(
    private readonly db: TenantPrismaService,
    private readonly registry: BulkHandlerRegistry,
    private readonly storage: FileStorage,
    private readonly reports: ReportWriter,
  ) {}

  // -------------------------------------------------------------------------
  // Pass 1 — validate
  // -------------------------------------------------------------------------

  async validate(jobId: string): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return

    const handler = this.registry.get(job.type)
    const scope = await this.buildScope(job)

    await this.setStatus(jobId, BulkJobStatus.VALIDATING, { processedRows: 0 })
    await this.db.raw.bulkJobError.deleteMany({ where: { jobId } })

    const counts = { create: 0, update: 0, skip: 0, error: 0 }
    const seenKeys = new Set<string>()
    const failedRows: Array<{ raw: Record<string, string>; message: string }> = []
    let recordedErrors = 0
    let truncated = false
    let totalRows = 0

    try {
      const reader = await openRowReader(
        this.storage.createReadStream(job.fileKey),
        job.fileName,
        handler.columns,
      )

      // A file with the wrong columns has no salvageable rows, so it is
      // rejected whole rather than producing one identical error per row.
      if (reader.headers.missing.length > 0) {
        await this.fail(
          jobId,
          `The file is missing these columns: ${reader.headers.missing.join(', ')}. Download the template and try again.`,
        )
        return
      }

      for await (const batch of batched(reader.rows, BULK_LIMITS.batchSize)) {
        if (await this.shouldStop(jobId)) return

        totalRows += batch.length
        if (totalRows > BULK_LIMITS.maxRows) {
          await this.fail(
            jobId,
            `This file has more than ${BULK_LIMITS.maxRows.toLocaleString('en-IN')} rows. Please split it into smaller files.`,
          )
          return
        }

        const parsed: ParsedRow<unknown>[] = []

        // --- shape validation, row by row ---
        for (const row of batch) {
          const result = handler.rowSchema.safeParse(row.values)

          if (!result.success) {
            const issue = result.error.issues[0]
            const message = issue?.message ?? 'This row could not be read.'
            counts.error += 1
            failedRows.push({ raw: row.values, message })
            if (recordedErrors < BULK_LIMITS.maxRecordedErrors) {
              await this.recordError(jobId, {
                rowNumber: row.rowNumber,
                column: issue?.path?.[0] ? String(issue.path[0]) : undefined,
                message,
                rawRow: row.values,
              })
              recordedErrors += 1
            } else {
              truncated = true
            }
            continue
          }

          // --- duplicates inside the file itself ---
          const key = handler.naturalKey(result.data, scope)
          if (seenKeys.has(key)) {
            const message = 'This row repeats an earlier row in the same file.'
            counts.error += 1
            failedRows.push({ raw: row.values, message })
            if (recordedErrors < BULK_LIMITS.maxRecordedErrors) {
              await this.recordError(jobId, {
                rowNumber: row.rowNumber,
                message,
                rawRow: row.values,
              })
              recordedErrors += 1
            } else {
              truncated = true
            }
            continue
          }
          seenKeys.add(key)

          parsed.push({ rowNumber: row.rowNumber, data: result.data, raw: row.values })
        }

        if (parsed.length === 0) {
          await this.bumpProgress(jobId, batch.length)
          continue
        }

        // --- business validation, batched ---
        const issues = await this.db.runAs(job.companyId, (tx) =>
          handler.validateBatch(parsed, scope, tx),
        )
        const failedRowNumbers = new Set(issues.map((issue) => issue.rowNumber))

        for (const issue of issues) {
          counts.error += 1
          const source = parsed.find((row) => row.rowNumber === issue.rowNumber)
          failedRows.push({ raw: source?.raw ?? {}, message: issue.message })
          if (recordedErrors < BULK_LIMITS.maxRecordedErrors) {
            await this.recordError(jobId, { ...issue, rawRow: source?.raw })
            recordedErrors += 1
          } else {
            truncated = true
          }
        }

        // --- classify what survived ---
        const survivors = parsed.filter((row) => !failedRowNumbers.has(row.rowNumber))
        if (survivors.length > 0) {
          const plans = await this.db.runAs(job.companyId, (tx) =>
            handler.classifyBatch(survivors, scope, tx),
          )
          for (const plan of plans) {
            if (plan.action === 'CREATE') counts.create += 1
            else if (plan.action === 'UPDATE') counts.update += 1
            else if (plan.action === 'SKIP') counts.skip += 1
            else counts.error += 1
          }
        }

        await this.bumpProgress(jobId, batch.length)
      }

      // --- error file, in template format so it re-imports unchanged ---
      let errorFileKey: string | null = null
      if (failedRows.length > 0) {
        errorFileKey = this.storage.buildKey({ scope: 'bulk', id: jobId, name: 'errors.csv' })
        await this.reports.writeErrorFile(errorFileKey, handler.columns, arrayToAsync(failedRows))
      }

      await this.db.raw.bulkJob.update({
        where: { id: jobId },
        data: {
          status: BulkJobStatus.AWAITING_CONFIRMATION,
          totalRows,
          processedRows: totalRows,
          createCount: counts.create,
          updateCount: counts.update,
          skipCount: counts.skip,
          errorCount: counts.error,
          errorsTruncated: truncated,
          errorFileKey,
          validatedAt: new Date(),
        },
      })

      this.logger.log(
        `Validated ${jobId}: ${totalRows} rows, ${counts.create} new, ${counts.update} updates, ${counts.error} problems`,
      )
    } catch (error) {
      this.logger.error(`Validation failed for ${jobId}`, error as Error)
      await this.fail(
        jobId,
        'We could not read this file. Please check it opens correctly and try again.',
      )
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2 — apply
  // -------------------------------------------------------------------------

  async apply(jobId: string): Promise<void> {
    const job = await this.loadJob(jobId)
    if (!job) return

    const handler = this.registry.get(job.type)
    const scope = await this.buildScope(job)

    // Resume support: skip everything already applied. processedRows is the
    // checkpoint, written after every batch.
    const resumeFrom = job.status === BulkJobStatus.PAUSED ? job.processedRows : 0
    if (resumeFrom > 0) this.logger.log(`Resuming ${jobId} from row ${resumeFrom}`)

    await this.setStatus(
      jobId,
      BulkJobStatus.IMPORTING,
      resumeFrom === 0 ? { processedRows: 0 } : {},
    )

    const counts = { create: 0, update: 0, skip: 0, error: 0 }
    const outcomes: Array<{ rowNumber: number; key: string; action: string; detail?: string }> = []
    let processed = resumeFrom

    try {
      const reader = await openRowReader(
        this.storage.createReadStream(job.fileKey),
        job.fileName,
        handler.columns,
      )

      let seen = 0

      for await (const batch of batched(reader.rows, BULK_LIMITS.batchSize)) {
        if (await this.shouldStop(jobId)) return

        // Fast-forward past rows applied before the pause.
        seen += batch.length
        if (seen <= resumeFrom) continue

        const parsed: ParsedRow<unknown>[] = []
        for (const row of batch) {
          const result = handler.rowSchema.safeParse(row.values)
          // Shape failures were already reported in pass 1; skip quietly here.
          if (!result.success) continue
          parsed.push({ rowNumber: row.rowNumber, data: result.data, raw: row.values })
        }

        /*
         * Business validation MUST run again here, not just in pass 1.
         *
         * Shape validation alone would let a row the preview rejected — a
         * Schedule X medicine, a price above MRP, stock below what is reserved
         * — get written anyway. Re-running also re-checks against the database
         * as it is NOW, which is the whole reason the file is read twice: the
         * data can change between preview and confirm.
         */
        const blocked = new Set<number>()
        if (parsed.length > 0) {
          const issues = await this.db.runAs(job.companyId, (tx) =>
            handler.validateBatch(parsed, scope, tx),
          )
          for (const issue of issues) {
            blocked.add(issue.rowNumber)
            counts.error += 1
            const source = parsed.find((row) => row.rowNumber === issue.rowNumber)
            await this.recordError(jobId, { ...issue, rawRow: source?.raw })
            outcomes.push({
              rowNumber: issue.rowNumber,
              key: source ? handler.naturalKey(source.data, scope) : String(issue.rowNumber),
              action: 'FAILED',
              detail: issue.message,
            })
          }
        }

        const applicable = parsed.filter((row) => !blocked.has(row.rowNumber))

        if (applicable.length > 0) {
          const applied = await this.applyBatchSafely(
            handler,
            applicable,
            scope,
            job.companyId,
            jobId,
            outcomes,
          )
          counts.create += applied.created
          counts.update += applied.updated
          counts.skip += applied.skipped
          counts.error += applied.issues.length
        }

        processed += batch.length
        await this.db.raw.bulkJob.update({
          where: { id: jobId },
          data: {
            processedRows: processed,
            createCount: { increment: 0 },
          },
        })
      }

      let resultFileKey: string | null = null
      if (outcomes.length > 0) {
        resultFileKey = this.storage.buildKey({ scope: 'bulk', id: jobId, name: 'result.csv' })
        await this.reports.writeResultFile(resultFileKey, arrayToAsync(outcomes))
      }

      const finalStatus =
        counts.error > 0 ? BulkJobStatus.COMPLETED_WITH_ERRORS : BulkJobStatus.COMPLETED

      await this.db.raw.bulkJob.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          processedRows: processed,
          createCount: counts.create,
          updateCount: counts.update,
          skipCount: counts.skip,
          errorCount: { increment: counts.error },
          resultFileKey,
          finishedAt: new Date(),
        },
      })

      await this.db.raw.auditLog.create({
        data: {
          actorId: job.createdById,
          action: `BULK_${job.type}`,
          entityType: 'BulkJob',
          entityId: jobId,
          after: {
            created: counts.create,
            updated: counts.update,
            skipped: counts.skip,
            failed: counts.error,
          },
        },
      })

      await this.notifyFinished(job.createdById, job.type, counts)

      this.logger.log(
        `Applied ${jobId}: ${counts.create} created, ${counts.update} updated, ${counts.error} failed`,
      )
    } catch (error) {
      this.logger.error(`Apply failed for ${jobId}`, error as Error)
      await this.fail(
        jobId,
        'The import stopped unexpectedly. Anything already imported has been kept.',
      )
    }
  }

  /**
   * Applies one batch inside a transaction, falling back to row-by-row if the
   * batch fails.
   *
   * This is what makes "one bad row never loses good data" true. Without the
   * fallback, a single constraint violation would roll back the other 499
   * perfectly good rows in the same transaction.
   */
  private async applyBatchSafely(
    handler: AnyBulkHandler,
    rows: ParsedRow<unknown>[],
    scope: BulkScope,
    companyId: string,
    jobId: string,
    outcomes: Array<{ rowNumber: number; key: string; action: string; detail?: string }>,
  ): Promise<{ created: number; updated: number; skipped: number; issues: RowIssue[] }> {
    try {
      const result = await this.db.runAs(companyId, (tx) => handler.applyBatch(rows, scope, tx))

      for (const issue of result.issues) {
        await this.recordError(jobId, issue)
      }
      for (const row of rows) {
        outcomes.push({
          rowNumber: row.rowNumber,
          key: handler.naturalKey(row.data, scope),
          action: 'OK',
        })
      }
      return result
    } catch (error) {
      this.logger.warn(
        `Batch failed for ${jobId}, retrying row by row: ${(error as Error).message}`,
      )

      // Slow path — only for batches that actually broke.
      let created = 0
      let updated = 0
      let skipped = 0
      const issues: RowIssue[] = []

      for (const row of rows) {
        try {
          const single = await this.db.runAs(companyId, (tx) =>
            handler.applyBatch([row], scope, tx),
          )
          created += single.created
          updated += single.updated
          skipped += single.skipped
          outcomes.push({
            rowNumber: row.rowNumber,
            key: handler.naturalKey(row.data, scope),
            action: 'OK',
          })
        } catch (rowError) {
          const message = friendlyWriteError(rowError)
          issues.push({ rowNumber: row.rowNumber, message })
          await this.recordError(jobId, { rowNumber: row.rowNumber, message, rawRow: row.raw })
          outcomes.push({
            rowNumber: row.rowNumber,
            key: handler.naturalKey(row.data, scope),
            action: 'FAILED',
            detail: message,
          })
        }
      }

      return { created, updated, skipped, issues }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async loadJob(jobId: string) {
    return this.db.raw.bulkJob.findUnique({ where: { id: jobId } })
  }

  /** The scope is rebuilt from the job's owner, never from the file. */
  private async buildScope(job: {
    createdById: string
    scopeId: string | null
  }): Promise<BulkScope> {
    const user = await this.db.raw.user.findUniqueOrThrow({
      where: { id: job.createdById },
      select: { id: true, role: true },
    })
    return {
      userId: user.id,
      role: user.role,
      warehouseId: job.scopeId ?? undefined,
    }
  }

  /** Checked every batch so pause and cancel take effect promptly. */
  private async shouldStop(jobId: string): Promise<boolean> {
    const current = await this.db.raw.bulkJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    })
    return current?.status === BulkJobStatus.PAUSED || current?.status === BulkJobStatus.CANCELLED
  }

  private async setStatus(
    jobId: string,
    status: BulkJobStatus,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.raw.bulkJob.update({ where: { id: jobId }, data: { status, ...extra } })
  }

  private async bumpProgress(jobId: string, rows: number): Promise<void> {
    await this.db.raw.bulkJob.update({
      where: { id: jobId },
      data: { processedRows: { increment: rows } },
    })
  }

  private async fail(jobId: string, reason: string): Promise<void> {
    await this.db.raw.bulkJob.update({
      where: { id: jobId },
      data: { status: BulkJobStatus.FAILED, failureReason: reason, finishedAt: new Date() },
    })
  }

  private async recordError(
    jobId: string,
    issue: RowIssue & { rawRow?: Record<string, string> },
  ): Promise<void> {
    // Inherited from the parent job so an error row can never end up in a
    // different tenant from the import that produced it.
    const job = await this.db.raw.bulkJob.findUnique({
      where: { id: jobId },
      select: { companyId: true },
    })
    if (!job) return

    await this.db.raw.bulkJobError.create({
      data: {
        jobId,
        companyId: job.companyId,
        rowNumber: issue.rowNumber,
        column: issue.column?.slice(0, 80) ?? null,
        value: issue.value?.slice(0, 500) ?? null,
        message: issue.message,
        rawRow: issue.rawRow ?? undefined,
      },
    })
  }

  /**
   * In-app notification when a long import finishes.
   *
   * Email and WhatsApp arrive with the notification module in Phase 7; this
   * writes the same Notification row those channels will read from.
   */
  private async notifyFinished(
    userId: string,
    type: string,
    counts: { create: number; update: number; error: number },
  ): Promise<void> {
    const changed = counts.create + counts.update
    await this.db.raw.notification.create({
      data: {
        userId,
        event: 'ORDER_PLACED', // placeholder until BULK_IMPORT_FINISHED is added in Phase 7
        channel: 'IN_APP',
        title: counts.error > 0 ? 'Import finished with some problems' : 'Import finished',
        body:
          counts.error > 0
            ? `${changed} records imported. ${counts.error} rows could not be imported — download the error file to see why.`
            : `${changed} records imported successfully.`,
        payload: { type, ...counts },
        sentAt: new Date(),
      },
    })
  }
}

/** Turns a database write failure into something a pharmacist can act on. */
function friendlyWriteError(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === 'P2002') return 'A record with these details already exists.'
  if (code === 'P2003') return 'This row refers to something that does not exist.'
  if (code === '23514') return 'This row breaks one of the platform rules.'
  return 'This row could not be saved.'
}

async function* arrayToAsync<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}
