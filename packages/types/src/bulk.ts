import { z } from 'zod'

/**
 * The bulk import/export platform contract.
 *
 * Everything here is module-agnostic on purpose. A new bulk operation —
 * medicines, inventory, pricing, users — registers a handler against these
 * types and inherits the whole pipeline: templates, validation, preview,
 * background processing, progress, pause/resume, reports and history.
 *
 * See docs/BULK-OPERATIONS.md for the reasoning.
 */

export const BulkJobType = {
  MEDICINE_IMPORT: 'MEDICINE_IMPORT',
  INVENTORY_IMPORT: 'INVENTORY_IMPORT',
  INVENTORY_STOCK_UPDATE: 'INVENTORY_STOCK_UPDATE',
  INVENTORY_PRICE_UPDATE: 'INVENTORY_PRICE_UPDATE',
  INVENTORY_EXPIRY_UPDATE: 'INVENTORY_EXPIRY_UPDATE',
  INVENTORY_STATUS_UPDATE: 'INVENTORY_STATUS_UPDATE',
  USER_IMPORT: 'USER_IMPORT',
} as const
export type BulkJobType = (typeof BulkJobType)[keyof typeof BulkJobType]

/**
 * Job lifecycle.
 *
 *   PENDING ─► VALIDATING ─► AWAITING_CONFIRMATION ─► IMPORTING ─► COMPLETED
 *                                                                └► COMPLETED_WITH_ERRORS
 *   any active state ─► PAUSED ─► (resume) ─► back where it was
 *   any active state ─► CANCELLED / FAILED
 */
export const BulkJobStatus = {
  PENDING: 'PENDING',
  VALIDATING: 'VALIDATING',
  /** Dry run finished. The preview is ready and nothing has been written. */
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  IMPORTING: 'IMPORTING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  /** Finished, but some rows were skipped. The error file explains which. */
  COMPLETED_WITH_ERRORS: 'COMPLETED_WITH_ERRORS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const
export type BulkJobStatus = (typeof BulkJobStatus)[keyof typeof BulkJobStatus]

/** Statuses where the worker is or could be running. */
export const ACTIVE_BULK_STATUSES: readonly BulkJobStatus[] = [
  BulkJobStatus.PENDING,
  BulkJobStatus.VALIDATING,
  BulkJobStatus.IMPORTING,
]

/** Statuses that will never change again. */
export const TERMINAL_BULK_STATUSES: readonly BulkJobStatus[] = [
  BulkJobStatus.COMPLETED,
  BulkJobStatus.COMPLETED_WITH_ERRORS,
  BulkJobStatus.FAILED,
  BulkJobStatus.CANCELLED,
]

/** What a single row would do, or did. */
export const BulkRowAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  /** Valid, but nothing to change — an update whose values already match. */
  SKIP: 'SKIP',
  ERROR: 'ERROR',
} as const
export type BulkRowAction = (typeof BulkRowAction)[keyof typeof BulkRowAction]

// ---------------------------------------------------------------------------
// Column specification — drives templates, header checks and error files
// ---------------------------------------------------------------------------

export type ColumnKind = 'text' | 'number' | 'integer' | 'money' | 'date' | 'boolean' | 'enum'

export interface ColumnSpec {
  /** Key on the parsed row object. */
  key: string
  /** Header as it appears in the spreadsheet. Matched case-insensitively. */
  header: string
  kind: ColumnKind
  required: boolean
  /** Shown in the template's second row so the user knows what to type. */
  example: string
  /** One short sentence, same voice as field helper text. */
  help: string
  /** For `enum` columns — the accepted values, listed in the template. */
  options?: readonly string[]
  /** Excel column width. */
  width?: number
}

// ---------------------------------------------------------------------------
// Row-level results
// ---------------------------------------------------------------------------

export interface RowIssue {
  rowNumber: number
  column?: string
  value?: string
  message: string
}

export interface RowPlan {
  rowNumber: number
  action: BulkRowAction
  /** Natural key, so the preview and reports can name the record. */
  key: string
  /** Human-readable summary of the change, shown in the preview table. */
  describe?: string
}

export interface BatchResult {
  created: number
  updated: number
  skipped: number
  issues: RowIssue[]
}

// ---------------------------------------------------------------------------
// Job DTOs
// ---------------------------------------------------------------------------

export interface BulkJobSummary {
  id: string
  type: BulkJobType
  status: BulkJobStatus
  fileName: string
  sizeBytes: number

  totalRows: number | null
  processedRows: number
  createCount: number
  updateCount: number
  skipCount: number
  errorCount: number
  /** True once the error cap is hit — the file is probably the wrong template. */
  errorsTruncated: boolean

  /** 0–100, or null while the total is still unknown. */
  progressPercent: number | null

  hasErrorFile: boolean
  hasResultFile: boolean

  /**
   * Whether this job can be removed from the history.
   *
   * True for anything the worker is not actively processing — finished,
   * cancelled, paused, or parked waiting for a decision. Only PENDING,
   * VALIDATING and IMPORTING are off limits, because deleting one of those
   * leaves the worker writing progress to a row that no longer exists.
   */
  canRemove: boolean

  createdByName: string
  queuedAt: string
  validatedAt: string | null
  confirmedAt: string | null
  finishedAt: string | null
  failureReason: string | null

  /** Whether the caller may act on this job right now. */
  canConfirm: boolean
  canPause: boolean
  canResume: boolean
  canCancel: boolean
}

/** A slice of the dry run, shown before the user commits. */
export interface BulkJobPreview {
  job: BulkJobSummary
  /** First N planned rows, so the user can eyeball the shape of the change. */
  sample: RowPlan[]
  /** First N problems. The full list is in the error file. */
  issues: RowIssue[]
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const bulkUploadOptionsSchema = z.object({
  /**
   * Validate only. The job stops at AWAITING_CONFIRMATION and the caller never
   * confirms — a true dry run, useful for checking a file before committing to
   * anything at all.
   */
  dryRun: z.coerce.boolean().default(false),
})
export type BulkUploadOptions = z.infer<typeof bulkUploadOptionsSchema>

export const bulkJobListQuerySchema = z.object({
  type: z.enum(BulkJobType).optional(),
  status: z.enum(BulkJobStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
export type BulkJobListQuery = z.infer<typeof bulkJobListQuerySchema>

// ---------------------------------------------------------------------------
// Platform limits
// ---------------------------------------------------------------------------

export const BULK_LIMITS = {
  maxRows: 50_000,
  maxFileBytes: 25 * 1024 * 1024,
  /** Rows applied per transaction. */
  batchSize: 500,
  /**
   * Stop recording individual row errors past this point. A file using the
   * wrong template would otherwise write one error row per data row.
   */
  maxRecordedErrors: 5_000,
  /** Rows shown in the preview before the user confirms. */
  previewSampleSize: 25,
  /** Concurrent active jobs per user. */
  maxConcurrentPerUser: 1,
} as const

export const ALLOWED_BULK_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

/** The extra column appended to error files so they re-import cleanly. */
export const ERROR_COLUMN_HEADER = 'Error'
