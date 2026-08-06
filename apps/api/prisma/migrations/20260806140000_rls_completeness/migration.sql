-- ---------------------------------------------------------------------------
-- Complete the Row-Level Security coverage, and make gaps impossible.
--
-- The previous migration derived its table list by pattern-matching the SQL
-- Prisma generated. That missed `medicines` and `addresses`, because Prisma
-- emits a multi-clause ALTER TABLE where the companyId line ends in a comma
-- rather than a semicolon. The result was two tables carrying tenant data with
-- no policy protecting them — a silent cross-tenant leak.
--
-- The fix is to stop deriving the list from text. Anything with a companyId
-- column IS tenant data, by definition, so that is what drives it now.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
          AND EXISTS (
              SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema = 'public'
                AND col.table_name = c.relname
                AND col.column_name = 'companyId'
          )
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
            USING (
                current_setting('app.bypass_rls', true) = 'on'
                OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
            )
            WITH CHECK (
                current_setting('app.bypass_rls', true) = 'on'
                OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
            )
        $f$, t);
    END LOOP;
END $$;

-- `companies` itself is not companyId-scoped, so it needs its own policy:
-- a tenant may see only its own row.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "companies";
CREATE POLICY tenant_isolation ON "companies"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR id IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------------
-- A standing check so this class of mistake cannot come back.
--
-- Called by the API at boot and by the test suite. Returns any table holding a
-- companyId without a policy over it. Empty result = every tenant table is
-- protected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unprotected_tenant_tables()
RETURNS TABLE(table_name text) AS $$
    SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'companyId'
      )
      AND (c.relrowsecurity = false
           OR NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.schemaname = 'public' AND p.tablename = c.relname))
    ORDER BY 1;
$$ LANGUAGE sql STABLE;
