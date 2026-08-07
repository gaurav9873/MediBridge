-- ---------------------------------------------------------------------------
-- Short-lived codes sent out of band.
--
-- One table for OTP sign-in, phone confirmation and password reset, because
-- all three are the same rule: prove you control an identifier, once, within a
-- few minutes. Three tables would have triplicated the expiry, attempt-limit
-- and single-use logic, and those are the parts worth having in one place.
--
-- Deliberately no companyId and therefore no RLS policy: a challenge is issued
-- before anyone knows which tenant the request belongs to, exactly like
-- user_identities and refresh_tokens. unprotected_tenant_tables() only reports
-- tables that HAVE a companyId, so the boot check stays satisfied.
-- ---------------------------------------------------------------------------

CREATE TABLE "verification_challenges" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "purpose"    VARCHAR(30)  NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    -- SHA-256 of the six digits. Storing the code itself would mean a database
    -- leak hands over live codes.
    "codeHash"   VARCHAR(64)  NOT NULL,

    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "attempts"   INTEGER      NOT NULL DEFAULT 0,
    -- Single use is recorded, not deleted, so a replayed code is
    -- distinguishable from one that merely expired.
    "consumedAt" TIMESTAMP(3),

    "userId"    UUID,
    "ipAddress" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_challenges_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "verification_challenges"
    ADD CONSTRAINT "verification_challenges_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;

-- The lookup every verification performs: the newest live challenge for this
-- identifier and purpose.
CREATE INDEX "verification_challenges_purpose_identifier_consumedAt_idx"
    ON "verification_challenges" ("purpose", "identifier", "consumedAt");

-- Supports the sweep that clears expired rows.
CREATE INDEX "verification_challenges_expiresAt_idx"
    ON "verification_challenges" ("expiresAt");

-- The application role needs this table like any other.
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification_challenges" TO medibridge_app;
