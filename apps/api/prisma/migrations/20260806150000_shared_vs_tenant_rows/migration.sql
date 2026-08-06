-- ---------------------------------------------------------------------------
-- Two policy shapes, because a NULL companyId means two different things.
--
-- The first RLS pass used one rule everywhere:
--     companyId IS NOT DISTINCT FROM <current company>
-- which hid every row with a NULL companyId from every tenant. That is right
-- for platform audit logs, and exactly wrong for the GLOBAL MEDICINE MASTER,
-- which every tenant is supposed to read. Tenant #1 could see zero medicines.
--
-- So NULL is now interpreted per table:
--
--   SHARED  (medicines, settings)  NULL = "belongs to the platform, readable
--                                   by everyone"; a set value = private to
--                                   that company
--   STRICT  (everything else)      NULL = "platform-only, invisible to tenants"
--
-- Writes stay strict in both shapes: a tenant can only ever create rows
-- carrying its own companyId, so nobody can write into the global catalogue by
-- leaving the column empty.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
    shared_tables text[] := ARRAY['medicines', 'settings'];
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
          AND EXISTS (
              SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='public' AND col.table_name=c.relname
                AND col.column_name='companyId'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);

        IF t = ANY(shared_tables) THEN
            EXECUTE format($f$
                CREATE POLICY tenant_isolation ON %I
                USING (
                    current_setting('app.bypass_rls', true) = 'on'
                    OR "companyId" IS NULL
                    OR "companyId" = nullif(current_setting('app.company_id', true), '')::uuid
                )
                WITH CHECK (
                    current_setting('app.bypass_rls', true) = 'on'
                    OR "companyId" = nullif(current_setting('app.company_id', true), '')::uuid
                )
            $f$, t);
        ELSE
            EXECUTE format($f$
                CREATE POLICY tenant_isolation ON %I
                USING (
                    current_setting('app.bypass_rls', true) = 'on'
                    OR "companyId" = nullif(current_setting('app.company_id', true), '')::uuid
                )
                WITH CHECK (
                    current_setting('app.bypass_rls', true) = 'on'
                    OR "companyId" = nullif(current_setting('app.company_id', true), '')::uuid
                )
            $f$, t);
        END IF;
    END LOOP;
END $$;
