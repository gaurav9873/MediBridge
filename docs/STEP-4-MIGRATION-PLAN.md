# Step 4 — retire the duplicate domain models

> **DONE** — commit `19ca1a9`, one sitting, one commit, as planned.
>
> Kept as the record of what was planned versus what the code actually
> required. Three things the plan did not account for, each found by measuring
> rather than assuming:
>
> 1. `companies.gstNumber` is null, so the planned `gstNumber` join would have
>    matched nothing. A temp mapping table correlates old ids to new instead.
> 2. RLS is `FORCE`d, so the migration has to set `app.bypass_rls` — without it
>    every statement below silently updates zero rows and reports success.
> 3. Three CHECK constraints (radius range, cutoff format, non-negative
>    delivery charge) lived on `distributor_profiles` and would have been
>    dropped with the table. They moved to `warehouses`.
>
> One decision the plan left open was settled first: in MARKETPLACE mode a
> distributor becomes **its own tenant Company** linked by `CompanyLink`, not a
> warehouse of the marketplace. Everything it owns moved with it, because RLS
> would otherwise have hidden a seller's own stock from it.

This is a complete, executable plan: everything below was measured against the
code and database at commit `3ebd23e`.

**Do it in one sitting, one commit.** A partial migration leaves _three_ models
rather than two, which is worse than the current state.

---

## What changes

| Old                           | New                     | Why                                              |
| ----------------------------- | ----------------------- | ------------------------------------------------ |
| `DistributorProfile`          | `Company` + `Warehouse` | A distributor is a tenant that ships from places |
| `RetailerProfile`             | `Customer`              | A retailer is a buyer belonging to a company     |
| `InventoryItem.distributorId` | `warehouseId`           | Stock sits in a warehouse, not in a company      |
| `Order.distributorId`         | `warehouseId`           | An order is fulfilled from a warehouse           |
| `MedicineOffer.distributorId` | `warehouseId`           | The read model follows inventory                 |
| `Settlement.distributorId`    | `companyId`             | Money settles to a company                       |

`companyId` already exists on all four tables, so the tenant link is not the
work — the warehouse link is.

---

## Blast radius, measured

**Database:** 4 columns named `distributorId` —
`inventory_items`, `medicine_offers`, `orders`, `settlements`.

**Functions to rewrite:** `refresh_medicine_offer`, `rebuild_medicine_offers`,
`medicine_offer_sync`. All three reference `distributorId` and the
`medicine_offers` primary key `(medicineId, distributorId)`.

**Source files (9):**

```
apps/api/src/auth/auth.service.ts               toSessionUser reads both profiles
apps/api/src/admin/admin-lists.controller.ts    users list joins both profiles
apps/api/src/admin/approvals.service.ts         approval writes licence to profile
apps/api/src/bulk/bulk.service.ts               resolveDistributorScope
apps/api/src/bulk/bulk.processor.ts             BulkScope.distributorId
apps/api/src/bulk/handlers/bulk-handler.ts      BulkScope type
apps/api/src/bulk/handlers/inventory-stock-update.handler.ts   scope + matching
apps/api/src/search/search.service.ts           nearby distributors query
packages/types/src/schemas/order.ts             DeliveryAvailability.distributorId
```

Plus `apps/api/prisma/seed.ts` (18 schema references) and
`apps/api/prisma/schema.prisma`.

---

## Order of work

### 1. Schema

Remove `DistributorProfile` and `RetailerProfile`. Repoint:

```prisma
model InventoryItem {
  warehouseId String    @db.Uuid
  warehouse   Warehouse @relation(fields: [warehouseId], references: [id])
  @@unique([warehouseId, medicineId, batchNumber])   // was distributorId
}

model Order {
  warehouseId String    @db.Uuid
  warehouse   Warehouse @relation(fields: [warehouseId], references: [id])
}

model MedicineOffer {
  warehouseId String @db.Uuid
  @@id([medicineId, warehouseId])                    // was distributorId
}

model Settlement {
  // drop distributorId; companyId already exists
  @@unique([companyId, periodStart, periodEnd])
}
```

Delete the `distributorOf` back-relation on `Address`, and
`DistributorProfile` / `RetailerProfile` from `User` and `Company`.

### 2. Data migration

Written by hand — Prisma will generate a destructive drop-and-recreate
otherwise. Run the drift guard afterwards.

```sql
-- One Company + Warehouse per distributor. The company already exists for
-- tenant #1, so match on gstNumber first and only create what is missing.
INSERT INTO companies (id, name, slug, status, "businessMode", "paymentTermType",
                       "tokenPercent", "creditDays", "gstNumber", "drugLicenseNumber",
                       "createdAt", "updatedAt")
SELECT gen_random_uuid(), dp."businessName",
       lower(regexp_replace(dp."businessName", '[^a-zA-Z0-9]+', '-', 'g')),
       'ACTIVE', 'MARKETPLACE', 'TOKEN_PLUS_COD', 20, 30,
       dp."gstNumber", dp."drugLicenseNumber", now(), now()
FROM distributor_profiles dp
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c."gstNumber" = dp."gstNumber");

-- The warehouse carries the geography and the Same-Day settings.
INSERT INTO warehouses (id, "companyId", name, "addressId", "sameDayRadiusKm",
                        "sameDayCutoffTime", "deliveryChargePaise",
                        "freeDeliveryAbovePaise", "isAcceptingOrders", "isDefault",
                        "createdAt", "updatedAt")
SELECT dp.id,                                   -- REUSE the id: every FK still points here
       c.id, dp."businessName" || ' Warehouse', dp."hubAddressId",
       dp."sameDayRadiusKm", dp."sameDayCutoffTime", dp."deliveryChargePaise",
       dp."freeDeliveryAbovePaise", dp."isAcceptingOrders", true, now(), now()
FROM distributor_profiles dp
JOIN companies c ON c."gstNumber" = dp."gstNumber"
WHERE dp."hubAddressId" IS NOT NULL;

-- Customers from retailers.
INSERT INTO customers (id, "companyId", "userId", "businessName", "gstNumber",
                       "drugLicenseNumber", "licenseExpiresOn", "createdAt", "updatedAt")
SELECT rp.id, u."companyId", rp."userId", rp."businessName", rp."gstNumber",
       rp."drugLicenseNumber", rp."licenseExpiresOn", now(), now()
FROM retailer_profiles rp
JOIN users u ON u.id = rp."userId";

-- Rename the columns. Reusing the DistributorProfile ids as Warehouse ids above
-- means the existing values are already correct — no UPDATE needed.
ALTER TABLE inventory_items RENAME COLUMN "distributorId" TO "warehouseId";
ALTER TABLE orders          RENAME COLUMN "distributorId" TO "warehouseId";
ALTER TABLE medicine_offers RENAME COLUMN "distributorId" TO "warehouseId";
ALTER TABLE settlements     DROP COLUMN "distributorId";

-- Repoint the foreign keys at warehouses.
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS "inventory_items_distributorId_fkey";
ALTER TABLE inventory_items ADD CONSTRAINT "inventory_items_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES warehouses(id);
-- …same for orders and medicine_offers

DROP TABLE distributor_profiles CASCADE;
DROP TABLE retailer_profiles CASCADE;
```

**The trick that makes this cheap:** the new `Warehouse` reuses the
`DistributorProfile` id. Every foreign key already holds the right value, so
the migration is a rename plus a constraint swap, not a data rewrite.

### 3. Rewrite the three functions

`refresh_medicine_offer(p_medicine, p_warehouse)`,
`rebuild_medicine_offers()` and `medicine_offer_sync` all switch
`distributorId` → `warehouseId`, and the `medicine_offers` primary key becomes
`(medicineId, warehouseId)`. Copy them from
`20260806160000_offer_trigger_tenant` and rename.

Also rename the indexes: `medicine_offers_distributor_price_idx` →
`medicine_offers_warehouse_price_idx`, and update
`scripts/check-migration-drift.mjs` to protect the new names.

### 4. Source sweep

Mechanical for most of the nine files:

```
distributorId          → warehouseId
distributorProfile     → (removed; use company + warehouse)
retailerProfile        → customerProfile
DistributorProfile     → Warehouse
RetailerProfile        → Customer
```

Three need real thought, not a rename:

- **`auth.service.ts` → `toSessionUser`** currently reads `retailerProfile ??
distributorProfile` for `businessName` and `licenseExpiresOn`. It becomes
  `customerProfile` for buyers and the `Company` for staff — they are no longer
  the same shape.
- **`search.service.ts` → `findNearbyDistributors`** joins
  `distributor_profiles → addresses`. It becomes `warehouses → addresses`, and
  should be renamed `findNearbyWarehouses`. `SearchResultOffer.distributorId`
  and `distributorName` become `warehouseId` / `warehouseName` — a breaking
  change to the search response, so update the web app's types too.
- **`inventory-stock-update.handler.ts`** scopes matching by
  `scope.distributorId`. `BulkScope` gains `warehouseId`, resolved from the
  user's company rather than their distributor profile.

### 5. Seed

`createUserWithAddress` currently creates a profile per role. It becomes:
distributors → a `Company` + `Warehouse`; retailers → a `Customer` on the
tenant. Keep the same two Pune/Mumbai hubs and the same coordinates so the
radius assertions in the seed keep passing.

---

## Verification before committing

Every one of these must pass:

```bash
npm run build && npm run typecheck && npx eslint packages apps   # 0 errors
npm run db:seed                                                   # radius + search checks pass
```

```sql
-- No trace of the old models
SELECT count(*) FROM information_schema.tables
 WHERE table_name IN ('distributor_profiles','retailer_profiles');   -- expect 0
SELECT count(*) FROM information_schema.columns
 WHERE column_name = 'distributorId';                                -- expect 0

-- RLS still complete
SELECT * FROM unprotected_tenant_tables();                           -- expect empty

-- The read model still populates
SELECT rebuild_medicine_offers();                                    -- expect 38
```

Plus, through the API: sign in, run a search (radius must still produce
SAME_DAY for Pune→Pune), and run a bulk import end to end.

---

## Then

Re-run `FOUNDATION-CHECKLIST.md`. The sixth quality gate — _no duplicate domain
models_ — should flip to **Pass**, and `Warehouse` and `Customer` should become
**Complete** under Product Architecture.

At that point the final review can cover architecture, database, security,
multi-tenancy, permissions, product architecture, extensibility, performance,
developer experience and documentation, and **Foundation v1.0** can be frozen.
