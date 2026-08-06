-- ---------------------------------------------------------------------------
-- Make Row-Level Security actually apply, and let a marketplace read its
-- sellers.
--
-- Two problems, found together because the first hid the second.
--
-- 1. The application connected as `medibridge`, which is a SUPERUSER with
--    BYPASSRLS. Postgres exempts such roles from every policy, so none of the
--    policies written so far had any effect on the running application. A
--    tenant could read every other tenant's rows. The policies were correct;
--    nothing was ever subject to them.
--
-- 2. Once RLS genuinely applies, a marketplace can no longer see its sellers.
--    Sellers are separate tenants (Step 4), so strict isolation hides their
--    warehouses and offers from the buyers who are supposed to shop them.
--
-- Fixing only the first would have left search returning nothing.
-- ---------------------------------------------------------------------------

SET app.bypass_rls = 'on';

-- ---------------------------------------------------------------------------
-- 1. Readable policy helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('app.company_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

-- SECURITY DEFINER so the lookup cannot itself be filtered by the policies it
-- exists to evaluate, and so a policy can never recurse into another one.
CREATE OR REPLACE FUNCTION is_linked_seller(p_company uuid) RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM company_links l
        WHERE l."sellerId" = p_company
          AND l."marketplaceId" = current_tenant()
          AND l."isActive"
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- A buyer needs the address of the warehouse that will ship to them — and
-- nothing else the seller owns.
CREATE OR REPLACE FUNCTION is_seller_warehouse_address(p_address uuid) RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM warehouses w
        WHERE w."addressId" = p_address
          AND is_linked_seller(w."companyId")
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 2. Marketplace read paths
--
-- Permissive policies OR together, so adding a SELECT-only policy widens reads
-- without touching writes: tenant_isolation stays the only policy that governs
-- INSERT, UPDATE and DELETE. A marketplace can see its sellers' shop windows
-- and can still write nothing of theirs.
-- ---------------------------------------------------------------------------

CREATE POLICY marketplace_read ON companies
    FOR SELECT USING (is_linked_seller(id));

CREATE POLICY marketplace_read ON warehouses
    FOR SELECT USING (is_linked_seller("companyId"));

CREATE POLICY marketplace_read ON medicine_offers
    FOR SELECT USING (is_linked_seller("companyId"));

CREATE POLICY marketplace_read ON addresses
    FOR SELECT USING (is_seller_warehouse_address(id));

-- Inventory is deliberately absent. The offer projection is the seller's shop
-- window; batch-level stock, cost and expiry stay private to the seller.

-- ---------------------------------------------------------------------------
-- 3. Maintenance functions that legitimately span tenants
-- ---------------------------------------------------------------------------

-- TRUNCATE is an owner-level operation and the rebuild spans every tenant by
-- definition, so it runs as the owner rather than requiring the application
-- role to hold TRUNCATE on every table.
ALTER FUNCTION rebuild_medicine_offers() SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 4. An application role that RLS actually applies to
--
-- The dev password below matches .env.example. Production provisions this role
-- itself with its own secret; the block is skipped when the role exists.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medibridge_app') THEN
        CREATE ROLE medibridge_app LOGIN PASSWORD 'medibridge_app_dev'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

-- Data only. No DDL, no ownership: migrations keep running as the owner.
GRANT USAGE ON SCHEMA public TO medibridge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO medibridge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medibridge_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medibridge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO medibridge_app;

RESET app.bypass_rls;
