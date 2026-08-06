-- company_auth_methods carries a companyId and shipped without a policy.
-- The boot check caught it and refused to start the API, which is exactly what
-- it exists for — a tenant table with no policy is a leak, not a warning.
--
-- Reuses the same loop as the completeness migration so any future table with
-- a companyId is picked up automatically rather than needing to be remembered.
DO $$
DECLARE t text;
BEGIN
    FOR t IN SELECT table_name FROM unprotected_tenant_tables()
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
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
    END LOOP;
END $$;
