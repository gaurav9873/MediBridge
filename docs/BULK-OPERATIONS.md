# Bulk operations

One engine, many modules. Every import and export in the product — medicines,
inventory, prices, expiry, users — runs through the same pipeline, the same
seven-step wizard, and the same job records. A new bulk operation is a handler
registration, not a new subsystem.

This document is the design. It is settled before Phase 3 so that the medicine
master and distributor inventory are built on top of it rather than growing
their own one-off importers.

---

## The problem with the obvious approach

The tempting version is a `POST /inventory/bulk-upload` that parses a file,
loops over rows, and inserts. It breaks on all four requirements at once:

| Requirement                    | Why the obvious version fails                                           |
| ------------------------------ | ----------------------------------------------------------------------- |
| Reuse across modules           | Each module reimplements parsing, validation, error reporting           |
| 10k–50k rows                   | Parsing the whole file into memory, and one HTTP request that times out |
| Never lose data to one bad row | A single transaction rolls back 49,999 good rows because of one typo    |
| Preview before import          | Nowhere to hold "what would happen" between validating and applying     |

So the pipeline is split into two passes with a durable job in between.

---

## Shape of the pipeline

```
  upload ──► VALIDATING ──► AWAITING_CONFIRMATION ──► IMPORTING ──► COMPLETED
                 │                    │                    │
                 └── FAILED           └── CANCELLED        └── COMPLETED_WITH_ERRORS
```

**Pass 1 — validate (dry run).** Streams the file, checks every row, works out
whether each would create, update or be skipped, and writes the counts to the
job. Touches no business tables.

**Pass 2 — apply.** Runs only after the user confirms. Streams the file again
and writes, in batches.

Reading the file twice is deliberate. Holding 50,000 parsed rows in Redis or
memory between the two passes costs more than re-reading a file from S3, and
the second pass re-validates anyway — the database can change between preview
and confirm.

### The seven steps, mapped

| Step in the brief         | Where it happens                                                       |
| ------------------------- | ---------------------------------------------------------------------- |
| 1. Download template      | `GET /bulk/templates/:type` — generated from the handler's column spec |
| 2. Upload file            | `POST /bulk/:type/upload` → creates a `BulkJob`, queues validation     |
| 3. Validate               | Worker, pass 1                                                         |
| 4. Preview changes        | `GET /bulk/jobs/:id` while `AWAITING_CONFIRMATION`                     |
| 5. New / updated / failed | Counts on the job; failures in `BulkJobError`                          |
| 6. Confirm                | `POST /bulk/jobs/:id/confirm` → queues apply                           |
| 7. Report + error file    | `GET /bulk/jobs/:id/errors.csv`                                        |

---

## Never losing good rows

This is the requirement that dictates the transaction strategy.

**No import is wrapped in a single transaction.** Rows are applied in batches of
500, each batch in its own transaction, and a row that fails is recorded and
skipped rather than aborting anything. A file of 50,000 rows with 12 bad ones
imports 49,988 records and hands back a 12-row error file.

```
for each batch of 500:
    try transaction:
        apply all 500
    catch:
        # One bad row poisoned the batch — fall back to per-row so the
        # other 499 still land. Slower, but only for batches that failed.
        for each row: try to apply, record the failure, carry on
```

The fallback matters: without it, one bad row still takes 499 good ones with it.
The fast path stays fast because the per-row path only runs for batches that
actually broke.

### What counts as a failure

| Kind                                       | Detected in                  | Row outcome                              |
| ------------------------------------------ | ---------------------------- | ---------------------------------------- |
| Missing required column                    | Header check, before any row | Whole file rejected — nothing to salvage |
| Bad value (bad date, price above MRP)      | Pass 1, Zod                  | Row skipped, reported                    |
| Unknown reference (medicine not in master) | Pass 1, batched lookup       | Row skipped, reported                    |
| Duplicate within the file                  | Pass 1, in-memory key set    | Second occurrence skipped, reported      |
| Already exists in database                 | Pass 1, natural-key lookup   | Classified as UPDATE, not an error       |
| Constraint violation at write time         | Pass 2                       | Row skipped, reported                    |

A whole-file rejection only happens for a malformed header, because a file with
the wrong columns has no salvageable rows and reporting 50,000 identical errors
helps nobody.

---

## The reusable contract

A module joins the system by implementing one interface and registering it.

```ts
export interface BulkHandler<TRow> {
  type: BulkJobType

  /** Drives template generation, header validation and the error file. */
  columns: ColumnSpec[]

  /** Per-row shape and coercion. Messages come from @medibridge/copy. */
  rowSchema: ZodType<TRow>

  /** Natural key for duplicate detection, within the file and against the DB. */
  naturalKey(row: TRow): string

  /** Who may run this, and what they are scoped to. */
  authorize(user: SessionUser): BulkScope

  /**
   * Business validation needing the database — batched, never per row.
   * One query for 500 rows, not 500 queries.
   */
  validateBatch(rows: TRow[], scope: BulkScope): Promise<RowIssue[]>

  /** What each row would do: CREATE, UPDATE or SKIP. Powers the preview. */
  classifyBatch(rows: TRow[], scope: BulkScope): Promise<RowPlan[]>

  /** Apply. Called inside a per-batch transaction. */
  applyBatch(rows: TRow[], scope: BulkScope, tx: PrismaTx): Promise<BatchResult>
}
```

`validateBatch` and `classifyBatch` being **batched rather than per-row** is the
single most important performance decision here. A per-row hook on 50,000 rows
is 50,000 round trips; batched, it is 100.

### Registry

```ts
export const bulkHandlers = {
  MEDICINE_IMPORT: medicineImportHandler,
  INVENTORY_IMPORT: inventoryImportHandler,
  INVENTORY_STOCK_UPDATE: stockUpdateHandler,
  INVENTORY_PRICE_UPDATE: priceUpdateHandler,
  INVENTORY_EXPIRY_UPDATE: expiryUpdateHandler,
  INVENTORY_STATUS_UPDATE: statusUpdateHandler,
  USER_IMPORT: userImportHandler, // registered when Phase 8 needs it
} satisfies Record<BulkJobType, BulkHandler<never>>
```

The `satisfies` is load-bearing: adding a `BulkJobType` without a handler fails
to compile, the same trick used for `FRIENDLY_ERRORS`.

### One controller, one wizard

Because every operation shares the contract, there is exactly one set of
endpoints and exactly one React component:

```
GET  /bulk/templates/:type          download the .xlsx template
POST /bulk/:type/upload             start a job
GET  /bulk/jobs                     history, filtered by module and user
GET  /bulk/jobs/:id                 status, counts, preview
POST /bulk/jobs/:id/confirm         apply
POST /bulk/jobs/:id/cancel
GET  /bulk/jobs/:id/errors.csv      failed rows, original values plus reason
GET  /bulk/export/:type             streaming export
```

```tsx
<BulkImportWizard type="INVENTORY_IMPORT" />
```

Import history and the error-file download come free with the job record — they
are not separate features to build per module.

---

## Data model

Two new tables. Everything else is existing.

```prisma
model BulkJob {
  id     String        @id @default(uuid()) @db.Uuid
  type   BulkJobType
  status BulkJobStatus @default(PENDING)

  createdById String @db.Uuid
  /// Distributor jobs are scoped to their own inventory; admin jobs are not.
  scopeId     String? @db.Uuid

  fileKey   String @db.VarChar(500)
  fileName  String @db.VarChar(255)
  sizeBytes Int

  /// Null until the header is read and the file counted.
  totalRows     Int?
  processedRows Int @default(0)

  // Filled by pass 1, re-filled by pass 2.
  createCount Int @default(0)
  updateCount Int @default(0)
  skipCount   Int @default(0)
  errorCount  Int @default(0)

  /// Generated on completion when errorCount > 0.
  errorFileKey String? @db.VarChar(500)

  /// Handler-specific options, e.g. "deactivate rows missing from the file".
  options Json?

  failureReason String?   @db.Text
  queuedAt      DateTime  @default(now())
  validatedAt   DateTime?
  confirmedAt   DateTime?
  finishedAt    DateTime?

  createdBy User            @relation(fields: [createdById], references: [id])
  errors    BulkJobError[]

  @@index([createdById, queuedAt])
  @@index([type, status])
  @@map("bulk_jobs")
}

model BulkJobError {
  id        String @id @default(uuid()) @db.Uuid
  jobId     String @db.Uuid
  rowNumber Int
  column    String? @db.VarChar(80)
  value     String? @db.VarChar(500)
  message   String  @db.Text
  /// The original row, so the error file can be rebuilt without the upload.
  rawRow    Json?

  job BulkJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId, rowNumber])
  @@map("bulk_job_errors")
}
```

**Row errors are capped at 5,000 per job.** A file where everything fails would
otherwise write 50,000 rows to report a single mistake in the template. Past the
cap the job stops recording individual errors, sets a flag, and the UI says
"showing the first 5,000 problems — the file may be using the wrong template."

### Duplicate detection uses keys the schema already has

| Module                | Natural key                           | Already enforced by                                  |
| --------------------- | ------------------------------------- | ---------------------------------------------------- |
| Medicine master       | name + brand + strength + packSize    | `@@unique([name, brand, strength, packSize])`        |
| Distributor inventory | distributor + medicine + batch number | `@@unique([distributorId, medicineId, batchNumber])` |
| Users                 | phone, and separately GST             | `@unique` on both                                    |

The database constraint is the backstop; pass 1 catches duplicates earlier so
they appear in the preview rather than as write failures.

---

## Processing at 50,000 rows

**Streaming, never buffering.** `exceljs`'s streaming reader for `.xlsx` and
`fast-csv` for CSV. Peak memory stays flat regardless of file size — one batch
of 500 rows, not the whole sheet.

Deliberately **not** using `xlsx` (SheetJS): it carries past security advisories
and no longer publishes the community build to npm.

**A separate worker process from day one.** `apps/worker` runs the BullMQ
consumers and shares Prisma and the handler registry with the API. Parsing
50,000 rows is CPU work, and doing it inside the API process would stall every
other request on the event loop. Splitting it later means changing deployment
under load, which is the worst time.

**Queue**: BullMQ on the Redis already running. This also brings forward the
queue infrastructure Phase 7 needs for notifications.

**Progress**: the worker updates `processedRows` every batch; the browser polls
`GET /bulk/jobs/:id` every 2 seconds while a job is active. Polling rather than
SSE or WebSockets — for a job measured in minutes, a 2-second poll is
indistinguishable to the user and survives reconnects, proxies and mobile
network switches without any reconnection logic.

**Limits** (in `Setting`, so they change without a deploy):

| Limit                    | Value   | Why                                           |
| ------------------------ | ------- | --------------------------------------------- |
| Max rows per file        | 50,000  | Above this, ask them to split                 |
| Max file size            | 25 MB   | 50k rows of inventory is roughly 6 MB         |
| Batch size               | 500     | Balances round trips against lock duration    |
| Concurrent jobs per user | 1       | Two imports of the same sheet race each other |
| Job retention            | 90 days | Then the file and error file are purged       |

### Expected throughput

Inventory rows are dominated by upserts. At batch 500 with a warm connection
pool, roughly 3,000–6,000 rows/second, so a 50,000-row file lands in about
10–25 seconds of apply time plus a similar validation pass. Comfortably inside
"go and make tea", which is exactly why it must not be a blocking HTTP request.

---

## Exports

Same registry, opposite direction. `GET /bulk/export/:type` streams rows out of
a cursor-paginated query straight into an `.xlsx` or `.csv` writer, so exporting
50,000 inventory rows also holds constant memory.

Exports of more than 5,000 rows become background jobs with the same `BulkJob`
record and a download link when ready, rather than a long-held HTTP connection.

---

## Security

- **Scope is enforced server-side, per row.** A distributor importing inventory
  can only ever touch their own — `scopeId` is taken from the session, never
  from the file. A `distributorId` column in an uploaded sheet is ignored.
- **Medicine master import is admin-only.** Distributors request additions
  through `MedicineRequest`; they cannot introduce catalogue entries in bulk.
- **Schedule X is refused at import**, the same as through the UI. A blocked
  schedule arriving in a spreadsheet is a reported row error, not a way in.
- **Uploads are validated by content**, not by file extension, and stored under
  a key the user cannot choose.
- Error files inherit the job's ownership; one distributor cannot read another's.

---

## What this changes in the roadmap

A new phase, before the modules that depend on it:

> ### Phase 2.5 — Bulk Operations Engine
>
> `BulkJob` / `BulkJobError` tables · file storage abstraction (local in dev,
> S3 in production) · streaming parsers · BullMQ queue · `apps/worker` ·
> generic controller · `BulkImportWizard` component · template generation ·
> error-file generation · import history.
>
> Ships with **one** handler — medicine import — as the proof that the contract
> works end to end.

Subsequent phases then register handlers instead of building importers:

| Phase         | Was                            | Becomes                                        |
| ------------- | ------------------------------ | ---------------------------------------------- |
| 3 — Catalogue | "bulk CSV upload" as a feature | Register `MEDICINE_IMPORT`, `INVENTORY_IMPORT` |
| 3 — Inventory | —                              | Register the four update handlers              |
| 8 — Admin     | —                              | Register `USER_IMPORT`, wire exports           |

---

## Open questions

1. **Do distributors update by batch number or replace their whole sheet?**
   "Bulk update stock" can mean _match on batch and set quantity_ or _this file
   is now my entire inventory, deactivate anything missing_. The second is far
   more dangerous and needs an explicit opt-in checkbox. Recommendation: build
   match-and-update first, add full-replace behind a confirmation later.

2. **Should a partially-failed import be re-runnable from the error file?**
   Fix the 12 bad rows, re-upload just those. Cheap to add later since the error
   file has the same columns as the template; noting it so the error file keeps
   that shape from the start.

3. **Notification on completion.** Until Phase 7 lands, completion shows as an
   in-app toast and a badge on the jobs list. Email or WhatsApp on completion
   arrives with the notification module.
