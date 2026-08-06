import type {
  BatchResult,
  BulkJobType,
  ColumnSpec,
  RowIssue,
  RowPlan,
  SessionUser,
} from '@medibridge/types'
import type { ZodType } from 'zod'
import type { PrismaService } from '../../common/prisma/prisma.service'

/** A Prisma transaction client, as handed to applyBatch. */
export type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

/**
 * Who is running the import, and what they may touch.
 *
 * `distributorId` comes from the session — NEVER from the file. A distributor
 * cannot write into another distributor's inventory by adding a column.
 */
export interface BulkScope {
  userId: string
  role: string
  distributorId?: string
}

/** A row that survived shape validation, tagged with where it came from. */
export interface ParsedRow<TRow> {
  rowNumber: number
  data: TRow
  raw: Record<string, string>
}

/**
 * The contract every bulk operation implements.
 *
 * A new module plugs in by writing one of these and adding it to the registry.
 * Everything else — templates, streaming, preview, progress, pause/resume,
 * reports, history, notifications — comes from the engine.
 *
 * The batched hooks are the key design decision. A per-row hook would issue
 * 50,000 database round trips; batched, the same work is 100 queries.
 */
export interface BulkHandler<TRow> {
  readonly type: BulkJobType

  /** Drives template generation, header matching and the error file. */
  readonly columns: ColumnSpec[]

  /** Sheet name in the generated template. */
  readonly templateSheetName: string

  /** Per-row shape and coercion. Messages come from @medibridge/copy. */
  readonly rowSchema: ZodType<TRow>

  /**
   * Natural key, used to detect duplicates inside the file and to match
   * existing records. Must be stable and case-insensitive.
   */
  naturalKey(row: TRow, scope: BulkScope): string

  /** Throws if this user may not run this operation; returns their scope. */
  authorize(user: SessionUser): BulkScope

  /**
   * Business validation that needs the database. Called once per batch.
   * Return one issue per problem; a row with no issues is valid.
   */
  validateBatch(rows: ParsedRow<TRow>[], scope: BulkScope): Promise<RowIssue[]>

  /** What each row would do. Drives the preview and the counts. */
  classifyBatch(rows: ParsedRow<TRow>[], scope: BulkScope): Promise<RowPlan[]>

  /** Apply the batch. Runs inside a transaction the engine owns. */
  applyBatch(rows: ParsedRow<TRow>[], scope: BulkScope, tx: PrismaTx): Promise<BatchResult>
}

/**
 * A handler with its row type erased, as stored in the registry.
 *
 * TypeScript cannot express "a handler for SOME row type" — `TRow` appears in
 * both parameter and return positions, so `BulkHandler<Medicine>` is not
 * assignable to `BulkHandler<unknown>`. The erasure is nonetheless safe by
 * construction: the engine never creates rows itself. It parses them with
 * `handler.rowSchema` and passes those exact objects back to the same
 * handler's `validateBatch` / `classifyBatch` / `applyBatch`. A row can never
 * reach a handler that did not produce it.
 *
 * Registration therefore casts through `unknown`, deliberately and in one
 * place, rather than sprinkling `any` through the engine.
 */
export type AnyBulkHandler = BulkHandler<unknown>

/** Convenience for handlers that need the Prisma client at construction. */
export interface BulkHandlerDeps {
  prisma: PrismaService
}
