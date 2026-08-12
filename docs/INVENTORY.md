# Inventory

Phases 3.2, 3.3 and 3.4. A distributor's own stock, batch by batch, and the six
screens that manage it.

---

## Why per batch, not per medicine

Every unit of medicine sold carries a batch number and an expiry date by law.
Two batches of the same medicine are genuinely two things: different expiry,
often different price, always different stock. So the row in this module is a
**batch**, and the same medicine appearing several times in a distributor's
list is correct rather than a duplicate.

Unlike the medicine catalogue, this is **tenant data**. Every query runs
through `TenantPrismaService.run()`, so Row-Level Security scopes it to the
signed-in company. No route in this module takes a company id — a tenant id
that arrives from a caller is one that can be wrong, and the only place it is
allowed to come from is the session.

---

## The screens

| # | Screen | Route | Phase |
| - | ------ | ----- | ----- |
| 1 | Stock list | `/inventory` | 3.2 |
| 2 | Add batch | `/inventory/new` | 3.2 |
| 3 | Edit batch | `/inventory/[id]` | 3.2 |
| 4 | Expiring soon | `/inventory/expiring` | 3.2 |
| 5 | Stock by warehouse, and transfers | `/warehouses` | 3.3 |
| 6 | Bulk uploads | `/imports` | 3.4 |

They live in a `(distributor)` route group whose layout reuses the same
`AppShell` the admin panel uses — sidebar on desktop, thumb-reachable bottom
bar on mobile — rather than inventing a second navigation pattern. A
distributor behind a counter is the likeliest person in this product to be on a
phone.

### 1. Stock list

Sorted **soonest expiry first** by default. The question this screen exists to
answer is "what needs me today?", and that is nearly always what dies next or
what has run out, not what was added last.

Four filters: warehouse, stock level, expiry window and sort. Search covers
medicine name, brand, salt **and batch number** — looking up a batch number off
a physical carton is the single most common thing a warehouse person does.

The tiles are counted in the database, not derived from the visible page, so
"1 running low" means one in the business rather than one on this screen. Low
and out-of-stock are computed from a narrow projection because they compare two
columns against a third, which no simple `WHERE` expresses.

### 3. Edit batch

Only what changes day to day is editable: price, quantity, minimum order, low
stock threshold, and whether retailers can order it.

**The medicine, batch number and expiry are deliberately not editable.** They
identify the physical goods, and a batch number that can be edited is a batch
number a recall notice cannot be trusted to find. Getting one wrong means
removing the batch and listing it again — the screen says so rather than
leaving people hunting for a field that is not there.

### 4. Expiring soon

Two lists, because they need different actions: batches inside the 90-day
window, which can still be discounted or moved, and batches already expired,
which can only be removed. Cards at every width — this is a short worklist
acted on item by item, not a dataset to scan.

---

## API

All under `/api/v1`, all tenant-scoped by RLS.

| Method | Path | Permission |
| ------ | ---- | ---------- |
| `GET` | `/inventory` | `INVENTORY_VIEW` |
| `GET` | `/inventory/summary` | `INVENTORY_VIEW` |
| `GET` | `/inventory/warehouses` | `INVENTORY_VIEW` |
| `GET` | `/inventory/transfers` | `INVENTORY_VIEW` |
| `POST` | `/inventory/transfers` | `INVENTORY_MANAGE` |
| `GET` | `/inventory/:id` | `INVENTORY_VIEW` |
| `POST` | `/inventory` | `INVENTORY_MANAGE` |
| `PATCH` | `/inventory/:id` | `INVENTORY_MANAGE` |
| `DELETE` | `/inventory/:id` | `INVENTORY_MANAGE` |

Query parameters on `GET /inventory`: `search`, `warehouseId`, `stock`
(`all` | `low` | `out`), `expiry` (`all` | `expiring` | `expired`), `status`
(`active` | `inactive` | `all`), `sortBy` (`expiry` | `name` | `stock` |
`updated`), `page`, `pageSize`.

The read/write split is deliberate: a sales executive can quote stock without
being able to reprice it. There is no role check anywhere in this module —
which company's stock you see is a tenancy question already answered by RLS,
and what you may do to it is a permission question.

---

## Rules, and whose they are

MODULE-STANDARD draws a line between platform rules and medicine rules. This
module sits on both sides of it, so the rules are split accordingly:

**Pharmaceutical** — `packages/types/src/medicine-rules.ts`

| Rule | What it decides |
| ---- | --------------- |
| `MINIMUM_SHELF_LIFE_DAYS` (30) | How much life a batch needs to be listed at all |
| `EXPIRY_WARNING_DAYS` (90) | How far ahead a distributor is warned |
| `daysUntilExpiry` | Whole calendar days, not elapsed hours |
| `expiryStatus` | `expired` / `expiringSoon` / `fresh` |
| `hasMinimumShelfLife` | Whether a new batch may be listed |

**Platform** — `packages/types/src/inventory-rules.ts`

| Rule | What it decides |
| ---- | --------------- |
| `availableQuantity` | Physical stock minus what is in carts |
| `stockLevel` | `outOfStock` / `lowStock` / `inStock` |
| `canSetQuantityTo` | Whether a correction would oversell reserved stock |
| `sellableQuantity` / `sellableStockLevel` | What may be sold once expiry is applied |
| `transferableQuantity` / `canTransfer` | How much of a batch may move to another warehouse |

Surgical supplies would bring their own expiry rules and reuse the counting
unchanged. That is the point of the split.

### Expiry status, and what it changes

| State | When | Shown as | Sellable? |
| ----- | ---- | -------- | --------- |
| Normal | more than 90 days left | no badge — a row of green "Good" badges is noise that hides the two that matter | yes |
| Expiring soon | 90 days or fewer, not yet past | amber badge with the days remaining | **yes**, right up to the day it expires |
| Expired | expiry date has passed | red badge with how long ago | **no** |

**Expired stock is not stock.** A batch past its date keeps its physical
`quantity` — the units are on the shelf and still have to be disposed of — but
everything that means "can this be sold" reads zero:

- `availableQuantity` is 0, and `stockLevel` is `outOfStock`
- it is excluded from a warehouse's "units free to sell" and from stock value
- the search projection has always excluded it (`expiryDate > CURRENT_DATE`), so
  a retailer never sees it
- it is counted in the **expired** tile and nowhere else. Counting it as
  out-of-stock as well would report one batch twice under two headings that
  call for opposite actions — reorder it, versus get it off the shelf

`sellableQuantity` and `sellableStockLevel` take expiry as a **boolean**, not a
date. This module counts things; what makes a batch unsellable is the medicine
domain's rule. A product category without expiry dates passes `false` and gets
the same arithmetic unchanged.

### Three details worth knowing

**Calendar days, not instants.** A batch expiring today, checked at 09:30, has
0 days left — not −1. Comparing timestamps rounds the current day away and
reports a day of sellable stock as already expired.

**Available, not physical.** Stock level is judged on `quantity − reserved`. A
distributor whose entire shelf is spoken for has nothing to sell, and telling
them they are well stocked is how it stays that way.

**Status keys match the design system.** `stockLevel()` returns `inStock` /
`lowStock` / `outOfStock` and `expiryStatus()` returns `expiringSoon` /
`expired` because those are the exact keys in `stockPresentation`. The status
crosses from the domain rules to the screen's icon and colour without a
translation step that could disagree.

---

## Warehouse transfers — Phase 3.3

Moving stock between two of **your own** warehouses. Selling to another
business is an order, not a transfer, and the destination lookup runs under RLS
so another company's warehouse is simply invisible.

The whole move is one transaction, because a transfer that half-happens either
invents stock or destroys it.

**What travels, and what does not.** The batch number, expiry and MRP are the
physical goods and cross unchanged. The selling price, minimum order and
low-stock threshold are copied as a starting point and can be edited at the
destination — the same batch can reasonably be priced differently in two
cities.

**Merge, do not duplicate.** If the destination already holds that exact batch,
the quantities merge into the existing row. Otherwise the batch is recreated
there. Either way one batch number never becomes two rows in one warehouse.

**Only free stock moves.** Reserved units belong to carts mid-checkout at the
*source* warehouse; moving them would leave those orders to be picked from a
shelf that no longer has the stock.

**No status, deliberately.** `StockTransfer` records a move that has already
happened on the shelf. Tracking a lorry between two of your own warehouses is a
different feature with its own lifecycle, and inventing that state machine here
would be guessing at it.

`stock_transfers` is a tenant table with its own RLS policy, and
`verify:isolation` gained an explicit behavioural check for it in the same
commit — the generic check proves the table *has* a policy, the new one proves
the policy does what it claims.

---

## What the service enforces beyond the schema

The shared Zod schema covers price ≤ MRP and the 30-day shelf life, in the
browser and on the server. Four more checks need the database:

1. **The warehouse is yours.** RLS already makes another company's warehouse
   invisible, so a missing row means "not yours" as much as "not real". Both
   answer the same way — saying which would reveal that a warehouse exists
   somewhere else.
2. **The medicine may be stocked.** Schedule X can never reach a shelf, and a
   medicine archived in the shared catalogue stops accepting new stock.
3. **The batch is not already listed.** The unique constraint would catch it,
   but as a database error nobody can read.
4. **Reserved stock is not oversold.** A quantity cannot be corrected below
   what is in retailers' carts, and a batch holding reservations cannot be
   removed. Both refuse with the number of units involved, which is the only
   thing that makes them actionable.

Removal is a **soft delete**. Order lines reference the batch they were picked
from, and an invoice that cannot resolve its own line items is worse than a
tidy stock list.

---

## The search read model

`medicine_offers` is maintained by a database **trigger** on `inventory_items`,
so nothing in this module writes it. That is deliberate: a projection kept up
to date in application code is a projection that drifts the first time somebody
writes a row from a script or a bulk import.

---

## Bulk uploads — Phase 3.4

The bulk engine (streaming, dry run, preview, pause/resume, error reports) was
built in Phase 2 and is entirely type-agnostic. This phase added the handler a
distributor actually needs and made the wizard show the right options.

**`INVENTORY_IMPORT` — create only.** A spreadsheet of everything on the
shelves, which is how a distributor gets started. It never updates: a batch
already listed at that warehouse is **skipped**, so re-uploading a corrected
file cannot silently reset prices or counts that have moved on. Changing
existing stock is `INVENTORY_STOCK_UPDATE`, which matches and updates on
purpose.

Every rule the single-batch form enforces is enforced here too, from the same
shared functions — `isSellable` for Schedule X, `hasMinimumShelfLife` for
expiry, price ≤ MRP. A bulk path that is more permissive than the form is a
bulk path people use to get around the form.

**The wizard asks the server what to offer.** `GET /bulk/types` now returns the
operations *this user* may run, decided by each handler's own `authorize` —
so a seller sees stock imports and a platform admin sees the catalogue, and
adding a handler never means editing the wizard. The warehouse a seller's rows
land in comes from their session, never from a column in the file.

### Two pre-existing bugs this phase had to fix

The bulk pipeline could not complete a single job under enforced Row-Level
Security, and had not been able to since RLS was forced:

1. `BulkService` read jobs through `db.raw`, the restricted client with **no
   tenant context set**. Every read returned nothing, so `POST /bulk/:type/upload`
   created the job and then answered `404` — the wizard never received an id.
   Those reads now go through `db.run`, which is what a request-scoped service
   should have used all along.
2. `BulkProcessor` did the same for its own bookkeeping. The worker logged
   "Starting validate" and then silently stopped, because the job it had just
   been handed was invisible to it. Its fourteen bookkeeping calls now use
   `runAsPlatform` with a stated reason — a background worker has no request
   tenant, and that is the deliberate, logged escape hatch for exactly this.

The handler work itself was already correct: it ran through
`runAs(job.companyId)`, which is why the tenant boundary was never at risk.

---

## Known limitations

- **Only two bulk operations exist for a seller**: import new stock, and update
  existing stock. Dedicated price, expiry and availability updates are declared
  in `BulkJobType` but have no handler, so they are not offered.
- **A bulk import always lands in the default warehouse.** Move it afterwards
  from Stock by Warehouse; the file cannot name a destination.
- **Confirming a job re-records its row errors**, so a job that failed
  validation on two rows can report four afterwards. Cosmetic, in the engine.
- **No stock movement history.** Every change writes an `AuditLog` row, but
  there is no screen showing a batch's history over time.
- **No reorder suggestions.** "Running low" is a threshold you set yourself,
  not a forecast.
- **Expiry alerts are a screen, not a notification.** Nothing is dispatched by
  SMS or email — notifications are Phase 3.10.
- **`lowStockThreshold` is per batch, not per medicine.** Two batches of the
  same medicine each carry their own threshold, which is right for stock
  counting and slightly odd for reordering.
- **Transfers are immediate, with no in-transit state.** You record a move
  after the stock has physically moved. A batch cannot be shown as "on the van".
- **Transfers cannot be reversed in one action.** Moving it back is a second
  transfer, which is honest but means two rows in the history.
- **A transfer moves one batch at a time.** Shifting a whole warehouse is one
  batch per move.

---

## See also

- [MODULE-STANDARD.md](MODULE-STANDARD.md) — the definition of done this was built against
- [MEDICINE-MASTER.md](MEDICINE-MASTER.md) — the shared catalogue this stocks against
- [LOCAL-TESTING.md](LOCAL-TESTING.md) — how to exercise these screens by hand
- [MULTI-TENANCY.md](MULTI-TENANCY.md) — why none of these routes takes a company id
