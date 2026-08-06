-- The search read model became tenant-scoped, but the trigger that maintains
-- it still wrote rows without a companyId — so every inventory insert failed on
-- the NOT NULL. The tenant is inherited from the inventory row, never guessed.

CREATE OR REPLACE FUNCTION refresh_medicine_offer(p_medicine UUID, p_distributor UUID)
RETURNS void AS $$
BEGIN
    DELETE FROM medicine_offers
    WHERE "medicineId" = p_medicine AND "distributorId" = p_distributor;

    INSERT INTO medicine_offers (
        "medicineId", "distributorId", "companyId", "bestPricePaise", "mrpPaise",
        "totalAvailable", "latestExpiry", "minOrderQuantity", "name", "brand",
        "composition", "form", "schedule", "searchVector", "updatedAt"
    )
    SELECT p_medicine, p_distributor, i."companyId",
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
        "medicineId", "distributorId", "companyId", "bestPricePaise", "mrpPaise",
        "totalAvailable", "latestExpiry", "minOrderQuantity", "name", "brand",
        "composition", "form", "schedule", "searchVector", "updatedAt"
    )
    SELECT i."medicineId", i."distributorId", i."companyId",
           MIN(i."sellingPricePaise"), MIN(i."mrpPaise"),
           SUM(i.quantity - i."reservedQuantity"), MAX(i."expiryDate"),
           MIN(i."minOrderQuantity"),
           m.name, m.brand, m.composition, m.form, m.schedule, m."searchVector", now()
    FROM inventory_items i
    JOIN medicines m ON m.id = i."medicineId"
    WHERE i."isActive" = true AND i."deletedAt" IS NULL
      AND i.quantity > i."reservedQuantity" AND i."expiryDate" > CURRENT_DATE
      AND m."isActive" = true AND m.schedule <> 'X'
    GROUP BY i."medicineId", i."distributorId", i."companyId", m.name, m.brand,
             m.composition, m.form, m.schedule, m."searchVector"
    HAVING SUM(i.quantity - i."reservedQuantity") > 0;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END;
$$ LANGUAGE plpgsql;
