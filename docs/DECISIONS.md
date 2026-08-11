# Decisions

Choices made during Phases 0, 1 and 1.5, and the reasoning behind them — so they can be
revisited deliberately rather than rediscovered.

---

## Database

### PostgreSQL 17 + PostGIS, not MySQL

The original plan specified MySQL. Postgres was chosen instead for four reasons specific
to this product:

1. **Radius delivery.** PostGIS gives a real `geography` type, `ST_DWithin`, and a GiST
   index. The alternative is hand-rolled haversine arithmetic in application code with no
   usable index.
2. **Stock reservation.** `SELECT … FOR UPDATE SKIP LOCKED` handles two retailers racing
   for the last units of a batch cleanly.
3. **Search.** Weighted `tsvector` with `pg_trgm` typo tolerance is meaningfully better
   than MySQL FULLTEXT for medicine names.
4. **JSONB** for gateway webhook payloads and audit diffs.

Prisma's Postgres support is also its best-tested path, and every managed host is
Postgres-first.

### `imresamu/postgis` instead of `postgis/postgis`

The official PostGIS image publishes amd64 only and will not run on Apple Silicon. The
`imresamu` build is multi-arch and a drop-in replacement — same entrypoint, same
environment variables, same extensions.

### Redis on port 6380

A Homebrew Redis is already running on 6379 on the development machine. Mapping the
project's container to 6380 keeps the two from colliding, so existing local services
are untouched.

### Money as integer paise

Every amount is an `Int` of paise. Floating-point rupees drift, and this product splits
every total 20/80 — a drifting paisa becomes a balance the retailer cannot pay exactly.
`splitTokenAndBalance` floors the token and gives the remainder to the balance, so the
two always sum back to the total.

### Batch-level inventory

`InventoryItem` is one batch of one medicine held by one distributor. Not optional in
pharma: every unit sold must carry a batch number and expiry. It also enables
oldest-expiry-first picking, which stops stock ageing out on a shelf.

### Snapshotted order lines

`OrderItem` copies the medicine name, brand, composition, batch, expiry, HSN code, GST
rate and price at purchase time. Without this, an admin correcting a catalogue typo would
silently rewrite historical invoices.

### Generated columns for geography and search

`addresses.location` and `medicines.searchVector` are both `GENERATED ALWAYS … STORED`,
derived from ordinary columns. They cannot drift from their source, need no trigger, and
no application code can forget to update them. Prisma models them as `Unsupported()`,
which is fine — only raw queries touch them.

### CHECK constraints as well as validation

Selling price ≤ MRP, token + balance = total, reserved ≤ quantity, GST rate in the
allowed set, and "a payment has exactly one parent" are all database constraints, and
also enforced in Zod and the service layer. Deliberate duplication: application code can
be bypassed by a migration, a script, or a future bug, and money invariants deserve two
lines of defence.

---

## Application

### Prisma 7 with the pg driver adapter

Prisma 7 removed the bundled query engine, so a driver adapter is now required. It also
moved the datasource URL out of `schema.prisma` into `prisma.config.ts`, and the seed
command out of `package.json`.

### Shared packages compile to CommonJS

`@medibridge/copy` and `@medibridge/types` emit CJS and are consumed as built JS. NestJS
requires real JavaScript at runtime, and Next.js consumes CJS without special handling —
so one build output serves both, with no ESM/CJS boundary to negotiate.

`@medibridge/ui` is the exception: it ships TypeScript source and is compiled by Next via
`transpilePackages`, since only the web app consumes it. That keeps the design system
editable without a watch task in between.

### Zod everywhere, no class-validator

The global Nest `ValidationPipe` was removed. All validation goes through
`ZodValidationPipe` against the schemas in `@medibridge/types`, which also run in the
browser. Two validation stacks would mean two sets of error messages to keep in step,
and the messages are exactly what we are trying to keep identical.

### `incremental: false` for the API build

`nest build` wipes `dist` via `deleteOutDir`, but tsc's `.tsbuildinfo` still reports
everything as current — so an incremental rebuild emits nothing and leaves an empty
`dist` that fails at runtime with a confusing `MODULE_NOT_FOUND`. Turning incremental off
for this project avoids a bug that is very hard to diagnose the second time.

### `consistent-type-imports` disabled for `apps/api/src`

NestJS resolves constructor dependencies from decorator metadata, which only exists for
runtime imports. `import type { PrismaService }` erases the class and dependency
injection then fails at runtime.

### Error codes, not error messages

Application code throws `AppException` with a stable code. The message is looked up from
the copy layer at the boundary. This is what guarantees the message a user sees is the
same one the frontend would have shown, and that adding an error code without writing
copy for it fails to compile — `FRIENDLY_ERRORS` is an exhaustive `Record`.

---

## Design system

### Components take copy objects, not strings

`TextField` requires a `FieldHelp` object rather than a `label` string. This is the
single most load-bearing decision in the UI: it makes "every field has helper text" and
"no hardcoded copy" compile-time guarantees instead of review checklist items.

### Native `<select>`

Custom dropdowns look tidier but lose the OS picker on mobile, which is better for
one-handed use, and they routinely break keyboard and screen reader behaviour the native
element handles correctly for free.

### Radix primitives, hand-authored components

Radix supplies focus management, ARIA, keyboard handling and portalling. The components
themselves are written here rather than pulled from a library, so the required-helper-text
rule can be baked directly into their prop types.

### `leading` / `trailing`, not `prefix` / `suffix`

`prefix` is already an HTML attribute typed as `string`; reusing the name for a
`ReactNode` breaks the props interface.

### localStorage read via `useSyncExternalStore`

The onboarding tour reads "have you seen this?" from localStorage. Doing that in an
effect means calling `setState` inside an effect, which React 19 flags as a cascading
render. `useSyncExternalStore` with a server snapshot of "seen" keeps hydration
consistent and avoids the flash.

---

## Product

Taken as recommended MVP defaults, and confirmed. All four are worth revisiting later.

### Schedule X blocked platform-wide

Narcotics and psychotropics carry record-keeping duties — Form 2C register, duplicate
prescriptions — that are out of MVP scope. Schedule H and H1 are allowed, since every
buyer's drug licence is verified before they can order. A Schedule X medicine is seeded
deliberately so the block can be tested; the seed asserts zero active Schedule X rows.

### Distributors set their own price

Capped at MRP by a CHECK constraint. This is what makes cross-distributor price
comparison meaningful for retailers.

### Marketplace settlement

MediBridge collects the 20% token and settles distributors weekly, minus a platform fee.
The 80% cash is collected directly by the distributor on delivery and never passes
through the platform. This requires the `Settlement` and `SettlementItem` models but
avoids per-distributor gateway onboarding in the MVP.

### Distributors deliver

MediBridge tracks status and verifies handover with a 4-digit code the retailer reads
out. No first-party logistics, no rider app, no route optimisation in the MVP.

### A buyer trades with many distributors

`Customer` is the relationship between a User and a Company — one row per distributor a
shop buys from, carrying that distributor's own credit limit, payment terms and standing.
There is deliberately no `Customer.parentId` and no separate `CustomerCompany` table:
`Customer` already *is* the join, so it only needed its unique key widening from `userId`
to `(companyId, userId)`.

Standing lives on the relationship rather than on the user, because a shop suspended by
one distributor is not suspended by the others. Orders record `customerId` alongside
`companyId` so the relationship an order was placed under is stored, not inferred — with
several distributors in play, "which customer is this?" otherwise has more than one
answer, and credit limits and payment terms hang off it.

Done while `orders` was still empty, which is the only reason `customerId` could be added
as NOT NULL without a backfill. The MVP flow stays one active relationship per shop.

**Open:** in marketplace mode a buyer is currently a `Customer` of the marketplace, while
orders belong to the selling company — so `order.companyId` and `order.customer.companyId`
can differ. Phase 3.7 has to settle whether a marketplace buyer gets a `Customer` row per
seller, or whether that invariant simply does not hold in marketplace mode. The database
does not enforce it either way today.

---

## Open questions for later phases

- **Language.** The copy layer is i18n-ready but ships English only. Hindi and regional
  languages are likely to matter for real retailer adoption.
- **UPI on delivery.** The balance is cash-only today. Retailers will ask for UPI.
- **Prescription capture.** Schedule H/H1 currently rely on licence verification alone.
  If regulation tightens, per-order prescription records will be needed.
- **Returns.** `RETURNED` exists as an order status, but the returns and
  restocking workflow is not designed.
