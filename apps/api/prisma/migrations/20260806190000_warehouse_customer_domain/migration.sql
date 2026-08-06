-- ---------------------------------------------------------------------------
-- Step 4 — retire DistributorProfile and RetailerProfile
--
--   DistributorProfile  ->  Company + Warehouse
--   RetailerProfile     ->  Customer
--   distributorId       ->  warehouseId   (inventory, offers, orders)
--   Settlement          ->  settles to a Company
--
-- A seller is a tenant in its own right, not a row inside the marketplace's
-- tenant. Each distributor therefore becomes its own Company, linked to the
-- marketplace it sells on by a CompanyLink, and everything it owns — staff,
-- addresses, stock, the read model — moves with it.
--
-- The trick that keeps this cheap: the new Warehouse REUSES the
-- DistributorProfile id, so every foreign key already holds the right value.
-- The column work is a rename plus a constraint swap, not a data rewrite.
-- ---------------------------------------------------------------------------

-- Row-Level Security is FORCED, which applies to the table owner too. Without
-- this the statements below would match zero rows and report success.
SET app.bypass_rls = 'on';

-- ---------------------------------------------------------------------------
-- 1. One Company per distributor
-- ---------------------------------------------------------------------------

-- The payout destination moves off the distributor profile. Money settles to a
-- company, not to a warehouse — a seller with three warehouses is paid once.
ALTER TABLE companies
  ADD COLUMN "bankAccountHolder" VARCHAR(160),
  ADD COLUMN "bankAccountNumber" VARCHAR(34),
  ADD COLUMN "bankIfsc"          VARCHAR(11),
  -- A seller's licence expiry moves here with the seller. The ordering guard
  -- reads it on every checkout, so it stays denormalised rather than joined.
  ADD COLUMN "licenseExpiresOn"  DATE;

-- Correlates each old profile with the ids it becomes, so every later statement
-- joins against one stable mapping rather than re-deriving it.
CREATE TEMP TABLE dp_map AS
SELECT dp.id             AS dp_id,
       gen_random_uuid() AS company_id,
       u.id              AS user_id,
       u."companyId"     AS marketplace_id
FROM distributor_profiles dp
JOIN users u ON u.id = dp."userId";

INSERT INTO companies (id, name, slug, status, "businessMode", "paymentTermType",
                       "tokenPercent", "creditDays", "gstNumber", "drugLicenseNumber",
                       "licenseExpiresOn", "bankAccountHolder", "bankAccountNumber",
                       "bankIfsc", "createdAt", "updatedAt")
SELECT m.company_id,
       dp."businessName",
       trim(BOTH '-' FROM lower(regexp_replace(dp."businessName", '[^a-zA-Z0-9]+', '-', 'g'))),
       'ACTIVE',
       -- A seller on a marketplace sells alongside others; its own mode says so.
       'MARKETPLACE',
       'TOKEN_PLUS_COD', 20, 30,
       dp."gstNumber", dp."drugLicenseNumber", dp."licenseExpiresOn",
       dp."bankAccountHolder", dp."bankAccountNumber", dp."bankIfsc",
       now(), now()
FROM dp_map m
JOIN distributor_profiles dp ON dp.id = m.dp_id;

-- ---------------------------------------------------------------------------
-- 2. One Warehouse per distributor, reusing the id
-- ---------------------------------------------------------------------------

INSERT INTO warehouses (id, "companyId", name, "addressId", "sameDayRadiusKm",
                        "sameDayCutoffTime", "deliveryChargePaise",
                        "freeDeliveryAbovePaise", "isAcceptingOrders", "isDefault",
                        "createdAt", "updatedAt")
SELECT dp.id, m.company_id, dp."businessName" || ' Warehouse', dp."hubAddressId",
       dp."sameDayRadiusKm", dp."sameDayCutoffTime", dp."deliveryChargePaise",
       dp."freeDeliveryAbovePaise", dp."isAcceptingOrders", true, now(), now()
FROM dp_map m
JOIN distributor_profiles dp ON dp.id = m.dp_id
WHERE dp."hubAddressId" IS NOT NULL;

-- The radius rules lived on distributor_profiles and would have been dropped
-- with it. They are business rules, so they move to where the settings now are.
ALTER TABLE warehouses
  ADD CONSTRAINT warehouse_radius_range
    CHECK ("sameDayRadiusKm" >= 1 AND "sameDayRadiusKm" <= 200),
  ADD CONSTRAINT warehouse_cutoff_format
    CHECK ("sameDayCutoffTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT warehouse_delivery_charge_non_negative
    CHECK ("deliveryChargePaise" >= 0);

-- ---------------------------------------------------------------------------
-- 3. Link each seller to the marketplace it was selling on
-- ---------------------------------------------------------------------------

INSERT INTO company_links (id, "marketplaceId", "sellerId", "isActive",
                           "commissionBps", "createdAt")
SELECT gen_random_uuid(), m.marketplace_id, m.company_id, true, 0, now()
FROM dp_map m
WHERE m.marketplace_id IS NOT NULL
  AND m.marketplace_id <> m.company_id;

-- ---------------------------------------------------------------------------
-- 4. Move everything the seller owns into the seller's tenant
--
-- RLS scopes by companyId. If the stock stayed on the marketplace's tenant the
-- seller would be unable to read its own inventory.
-- ---------------------------------------------------------------------------

UPDATE users u SET "companyId" = m.company_id
FROM dp_map m WHERE u.id = m.user_id;

UPDATE addresses a SET "companyId" = m.company_id
FROM dp_map m WHERE a."userId" = m.user_id;

UPDATE documents d SET "companyId" = m.company_id
FROM dp_map m WHERE d."userId" = m.user_id;

UPDATE notifications n SET "companyId" = m.company_id
FROM dp_map m WHERE n."userId" = m.user_id;

UPDATE notification_preferences p SET "companyId" = m.company_id
FROM dp_map m WHERE p."userId" = m.user_id;

UPDATE inventory_items i SET "companyId" = m.company_id
FROM dp_map m WHERE i."distributorId" = m.dp_id;

UPDATE medicine_offers o SET "companyId" = m.company_id
FROM dp_map m WHERE o."distributorId" = m.dp_id;

UPDATE orders o SET "companyId" = m.company_id
FROM dp_map m WHERE o."distributorId" = m.dp_id;

UPDATE settlements s SET "companyId" = m.company_id
FROM dp_map m WHERE s."distributorId" = m.dp_id;

-- ---------------------------------------------------------------------------
-- 5. One Customer per retailer
--
-- A retailer buys FROM the marketplace, so it stays on the marketplace tenant —
-- the company its user already belongs to.
-- ---------------------------------------------------------------------------

INSERT INTO customers (id, "companyId", "userId", "businessName", "gstNumber",
                       "drugLicenseNumber", "licenseExpiresOn", "createdAt", "updatedAt")
SELECT rp.id, u."companyId", rp."userId", rp."businessName", rp."gstNumber",
       rp."drugLicenseNumber", rp."licenseExpiresOn", now(), now()
FROM retailer_profiles rp
JOIN users u ON u.id = rp."userId"
WHERE u."companyId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Rename the columns and repoint the foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE inventory_items RENAME COLUMN "distributorId" TO "warehouseId";
ALTER TABLE medicine_offers RENAME COLUMN "distributorId" TO "warehouseId";
ALTER TABLE orders          RENAME COLUMN "distributorId" TO "warehouseId";
ALTER TABLE settlements     DROP COLUMN "distributorId";

ALTER TABLE inventory_items DROP CONSTRAINT "inventory_items_distributorId_fkey";
ALTER TABLE inventory_items ADD CONSTRAINT "inventory_items_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES warehouses(id) ON DELETE CASCADE;

ALTER TABLE medicine_offers DROP CONSTRAINT "medicine_offers_distributorId_fkey";
ALTER TABLE medicine_offers ADD CONSTRAINT "medicine_offers_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES warehouses(id) ON DELETE CASCADE;

ALTER TABLE orders DROP CONSTRAINT "orders_distributorId_fkey";
ALTER TABLE orders ADD CONSTRAINT "orders_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES warehouses(id);

-- Index names follow their columns, so a later drift check compares like with like.
ALTER INDEX "inventory_items_distributorId_isActive_idx"
  RENAME TO "inventory_items_warehouseId_isActive_idx";
ALTER INDEX "inventory_items_distributorId_medicineId_batchNumber_key"
  RENAME TO "inventory_items_warehouseId_medicineId_batchNumber_key";
ALTER INDEX "orders_distributorId_status_createdAt_idx"
  RENAME TO "orders_warehouseId_status_createdAt_idx";
ALTER INDEX "medicine_offers_distributor_price_idx"
  RENAME TO "medicine_offers_warehouse_price_idx";
ALTER INDEX "medicine_offers_distributor_expiry_idx"
  RENAME TO "medicine_offers_warehouse_expiry_idx";

-- Settlements now key on the company that gets paid.
ALTER TABLE settlements
  ADD CONSTRAINT "settlements_companyId_periodStart_periodEnd_key"
  UNIQUE ("companyId", "periodStart", "periodEnd");

-- ---------------------------------------------------------------------------
-- 7. The read-model functions follow the column
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE cannot rename an input parameter, and p_distributor becomes
-- p_warehouse. plpgsql resolves callees at runtime, so dropping and recreating
-- is safe for the trigger function that calls this.
DROP FUNCTION IF EXISTS refresh_medicine_offer(UUID, UUID);

CREATE FUNCTION refresh_medicine_offer(p_medicine UUID, p_warehouse UUID)
RETURNS void AS $$
BEGIN
    DELETE FROM medicine_offers
    WHERE "medicineId" = p_medicine AND "warehouseId" = p_warehouse;

    INSERT INTO medicine_offers (
        "medicineId", "warehouseId", "companyId", "bestPricePaise", "mrpPaise",
        "totalAvailable", "latestExpiry", "minOrderQuantity", "name", "brand",
        "composition", "form", "schedule", "searchVector", "updatedAt"
    )
    SELECT p_medicine, p_warehouse, i."companyId",
           MIN(i."sellingPricePaise"), MIN(i."mrpPaise"),
           SUM(i.quantity - i."reservedQuantity"), MAX(i."expiryDate"),
           MIN(i."minOrderQuantity"),
           m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector", now()
    FROM inventory_items i
    JOIN medicines m ON m.id = i."medicineId"
    WHERE i."medicineId" = p_medicine
      AND i."warehouseId" = p_warehouse
      AND i."isActive" = true
      AND i."deletedAt" IS NULL
      AND i.quantity > i."reservedQuantity"
      AND i."expiryDate" > CURRENT_DATE
      AND m."isActive" = true
      AND m.schedule <> 'X'
    GROUP BY i."companyId", m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector"
    HAVING SUM(i.quantity - i."reservedQuantity") > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rebuild_medicine_offers() RETURNS bigint AS $$
DECLARE inserted bigint;
BEGIN
    TRUNCATE medicine_offers;
    INSERT INTO medicine_offers (
        "medicineId", "warehouseId", "companyId", "bestPricePaise", "mrpPaise",
        "totalAvailable", "latestExpiry", "minOrderQuantity", "name", "brand",
        "composition", "form", "schedule", "searchVector", "updatedAt"
    )
    SELECT i."medicineId", i."warehouseId", i."companyId",
           MIN(i."sellingPricePaise"), MIN(i."mrpPaise"),
           SUM(i.quantity - i."reservedQuantity"), MAX(i."expiryDate"),
           MIN(i."minOrderQuantity"),
           m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector", now()
    FROM inventory_items i
    JOIN medicines m ON m.id = i."medicineId"
    WHERE i."isActive" = true AND i."deletedAt" IS NULL
      AND i.quantity > i."reservedQuantity" AND i."expiryDate" > CURRENT_DATE
      AND m."isActive" = true AND m.schedule <> 'X'
    GROUP BY i."medicineId", i."warehouseId", i."companyId", m.name, m.brand,
             m.composition, m.form, m.schedule, m."searchVector"
    HAVING SUM(i.quantity - i."reservedQuantity") > 0;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inventory_offer_sync() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM refresh_medicine_offer(OLD."medicineId", OLD."warehouseId");
        RETURN OLD;
    END IF;

    PERFORM refresh_medicine_offer(NEW."medicineId", NEW."warehouseId");
    -- A row moved between medicines or warehouses leaves the old pair stale.
    IF (TG_OP = 'UPDATE' AND (OLD."medicineId" <> NEW."medicineId"
                              OR OLD."warehouseId" <> NEW."warehouseId")) THEN
        PERFORM refresh_medicine_offer(OLD."medicineId", OLD."warehouseId");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 8. Drop the retired models
-- ---------------------------------------------------------------------------

DROP TABLE retailer_profiles;
DROP TABLE distributor_profiles;

DROP TABLE dp_map;

RESET app.bypass_rls;
