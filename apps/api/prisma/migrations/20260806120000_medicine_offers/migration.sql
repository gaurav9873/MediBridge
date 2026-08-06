-- ---------------------------------------------------------------------------
-- medicine_offers — the search read model.
--
-- Retailer search asks one question: "which medicines can someone near me
-- sell, and at what price?" Answering that from inventory_items means
-- aggregating every batch of every matching medicine before the results can be
-- sorted by price — ~100k rows touched to return 20, and it degrades linearly
-- as the catalogue grows.
--
-- This table collapses inventory to ONE ROW PER (medicine, distributor):
-- the best price, what is available, and the medicine's own text and search
-- vector denormalised in. That turns the hot query into an index-ordered scan
-- that stops after LIMIT rows, and removes the join to medicines entirely.
--
-- Kept current by triggers on inventory_items and medicines. Search volume is
-- orders of magnitude higher than stock-change volume, so paying on write is
-- the right trade.
-- ---------------------------------------------------------------------------

CREATE TABLE "medicine_offers" (
    "medicineId"      UUID NOT NULL,
    "distributorId"   UUID NOT NULL,

    -- Cheapest sellable batch this distributor holds.
    "bestPricePaise"  INTEGER NOT NULL,
    "mrpPaise"        INTEGER NOT NULL,
    -- Summed across sellable batches, so search can hide out-of-stock items.
    "totalAvailable"  INTEGER NOT NULL,
    -- Furthest expiry, for the "longest expiry first" sort.
    "latestExpiry"    DATE NOT NULL,
    "minOrderQuantity" INTEGER NOT NULL,

    -- Denormalised from medicines so a search needs no join at all.
    "name"        VARCHAR(200) NOT NULL,
    "brand"       VARCHAR(120) NOT NULL,
    "composition" VARCHAR(300) NOT NULL,
    "form"        "MedicineForm" NOT NULL,
    "schedule"    "DrugSchedule" NOT NULL,
    "searchVector" tsvector NOT NULL,

    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicine_offers_pkey" PRIMARY KEY ("medicineId", "distributorId")
);

-- The "browse cheapest near me" path: an ordered index scan that stops at
-- LIMIT instead of aggregating everything. This is what fixed the 807ms case.
CREATE INDEX "medicine_offers_distributor_price_idx"
    ON "medicine_offers" ("distributorId", "bestPricePaise");

-- Text search, already scoped by the distributor filter.
CREATE INDEX "medicine_offers_search_idx" ON "medicine_offers" USING GIN ("searchVector");

-- Typo tolerance on the denormalised name.
CREATE INDEX "medicine_offers_name_trgm_idx"
    ON "medicine_offers" USING GIN ("name" gin_trgm_ops);

-- "Who else sells this medicine?" on a product page.
CREATE INDEX "medicine_offers_medicine_price_idx"
    ON "medicine_offers" ("medicineId", "bestPricePaise");

-- Longest-expiry sort.
CREATE INDEX "medicine_offers_distributor_expiry_idx"
    ON "medicine_offers" ("distributorId", "latestExpiry" DESC);

ALTER TABLE "medicine_offers"
    ADD CONSTRAINT "medicine_offers_medicineId_fkey"
        FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE CASCADE,
    ADD CONSTRAINT "medicine_offers_distributorId_fkey"
        FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Recompute one (medicine, distributor) pair.
--
-- Deliberately narrow: a stock change touches exactly one pair, and that pair
-- has only a handful of batches, so this is a tiny aggregate. Deletes the row
-- when nothing sellable is left, which is what removes sold-out items from
-- search without any extra filtering at read time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_medicine_offer(p_medicine UUID, p_distributor UUID)
RETURNS void AS $$
BEGIN
    DELETE FROM medicine_offers
    WHERE "medicineId" = p_medicine AND "distributorId" = p_distributor;

    INSERT INTO medicine_offers (
        "medicineId", "distributorId", "bestPricePaise", "mrpPaise", "totalAvailable",
        "latestExpiry", "minOrderQuantity", "name", "brand", "composition", "form",
        "schedule", "searchVector", "updatedAt"
    )
    SELECT p_medicine, p_distributor,
           MIN(i."sellingPricePaise"), MIN(i."mrpPaise"),
           SUM(i.quantity - i."reservedQuantity"), MAX(i."expiryDate"),
           MIN(i."minOrderQuantity"),
           m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector", now()
    FROM inventory_items i
    JOIN medicines m ON m.id = i."medicineId"
    WHERE i."medicineId" = p_medicine
      AND i."distributorId" = p_distributor
      AND i."isActive" = true
      AND i."deletedAt" IS NULL
      AND i.quantity > i."reservedQuantity"
      AND i."expiryDate" > CURRENT_DATE
      -- Schedule X and delisted medicines never reach search at all.
      AND m."isActive" = true
      AND m.schedule <> 'X'
    GROUP BY m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector"
    HAVING SUM(i.quantity - i."reservedQuantity") > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inventory_offer_sync() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM refresh_medicine_offer(OLD."medicineId", OLD."distributorId");
        RETURN OLD;
    END IF;

    PERFORM refresh_medicine_offer(NEW."medicineId", NEW."distributorId");
    -- A row moved between medicines or distributors leaves the old pair stale.
    IF (TG_OP = 'UPDATE' AND (OLD."medicineId" <> NEW."medicineId"
                              OR OLD."distributorId" <> NEW."distributorId")) THEN
        PERFORM refresh_medicine_offer(OLD."medicineId", OLD."distributorId");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_items_offer_sync
AFTER INSERT OR UPDATE OR DELETE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION inventory_offer_sync();

-- Renaming or delisting a medicine must reach every offer for it.
CREATE OR REPLACE FUNCTION medicine_offer_sync() RETURNS trigger AS $$
BEGIN
    IF (NEW."isActive" = false OR NEW.schedule = 'X') THEN
        DELETE FROM medicine_offers WHERE "medicineId" = NEW.id;
        RETURN NEW;
    END IF;

    UPDATE medicine_offers
       SET name = NEW.name, brand = NEW.brand, composition = NEW.composition,
           form = NEW.form, schedule = NEW.schedule,
           "searchVector" = NEW."searchVector", "updatedAt" = now()
     WHERE "medicineId" = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medicines_offer_sync
AFTER UPDATE ON medicines
FOR EACH ROW EXECUTE FUNCTION medicine_offer_sync();

-- Full rebuild, for the initial fill and for repair after a bulk load that
-- disabled triggers.
CREATE OR REPLACE FUNCTION rebuild_medicine_offers() RETURNS bigint AS $$
DECLARE inserted bigint;
BEGIN
    TRUNCATE medicine_offers;
    INSERT INTO medicine_offers (
        "medicineId", "distributorId", "bestPricePaise", "mrpPaise", "totalAvailable",
        "latestExpiry", "minOrderQuantity", "name", "brand", "composition", "form",
        "schedule", "searchVector", "updatedAt"
    )
    SELECT i."medicineId", i."distributorId",
           MIN(i."sellingPricePaise"), MIN(i."mrpPaise"),
           SUM(i.quantity - i."reservedQuantity"), MAX(i."expiryDate"),
           MIN(i."minOrderQuantity"),
           m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector", now()
    FROM inventory_items i
    JOIN medicines m ON m.id = i."medicineId"
    WHERE i."isActive" = true AND i."deletedAt" IS NULL
      AND i.quantity > i."reservedQuantity" AND i."expiryDate" > CURRENT_DATE
      AND m."isActive" = true AND m.schedule <> 'X'
    GROUP BY i."medicineId", i."distributorId", m.name, m.brand, m.composition,
             m.form, m.schedule, m."searchVector"
    HAVING SUM(i.quantity - i."reservedQuantity") > 0;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END;
$$ LANGUAGE plpgsql;
