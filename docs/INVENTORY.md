# Inventory

Phase 3.2. A distributor's own stock, batch by batch, and the four screens that
manage it.

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

| # | Screen | Route |
| - | ------ | ----- |
| 1 | Stock list | `/inventory` |
| 2 | Add batch | `/inventory/new` |
| 3 | Edit batch | `/inventory/[id]` |
| 4 | Expiring soon | `/inventory/expiring` |

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

Surgical supplies would bring their own expiry rules and reuse the counting
unchanged. That is the point of the split.

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

## Known limitations

- **No bulk edit.** Repricing a hundred batches is one at a time, or through
  the existing spreadsheet upload (`Bulk Imports`), which already has an
  inventory stock-update handler.
- **The bulk upload wizard is not linked from these screens yet.** It exists
  and works; wiring it in is Phase 3.4.
- **No stock movement history.** Every change writes an `AuditLog` row, but
  there is no screen showing a batch's history over time.
- **No reorder suggestions.** "Running low" is a threshold you set yourself,
  not a forecast.
- **Expiry alerts are a screen, not a notification.** Nothing is dispatched by
  SMS or email — notifications are Phase 3.10.
- **`lowStockThreshold` is per batch, not per medicine.** Two batches of the
  same medicine each carry their own threshold, which is right for stock
  counting and slightly odd for reordering.
- **Warehouse transfers are not built.** Moving stock between your own
  locations is Phase 3.3.

---

## See also

- [MODULE-STANDARD.md](MODULE-STANDARD.md) — the definition of done this was built against
- [MEDICINE-MASTER.md](MEDICINE-MASTER.md) — the shared catalogue this stocks against
- [LOCAL-TESTING.md](LOCAL-TESTING.md) — how to exercise these screens by hand
- [MULTI-TENANCY.md](MULTI-TENANCY.md) — why none of these routes takes a company id
