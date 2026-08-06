-- DropIndex
-- [drift-guard] kept: addresses_location_gist_idx

-- DropIndex
-- [drift-guard] kept: medicine_offers_distributor_expiry_idx

-- DropIndex
-- [drift-guard] kept: medicine_offers_distributor_price_idx

-- DropIndex
-- [drift-guard] kept: medicine_offers_medicine_price_idx

-- DropIndex
-- [drift-guard] kept: medicine_offers_name_trgm_idx

-- DropIndex
-- [drift-guard] kept: medicine_offers_search_idx

-- DropIndex
-- [drift-guard] kept: medicines_composition_trgm_idx

-- DropIndex
-- [drift-guard] kept: medicines_name_trgm_idx

-- DropIndex
-- [drift-guard] kept: medicines_search_vector_gin_idx

-- AlterTable
-- [drift-guard] kept generated column: location

-- AlterTable
-- [drift-guard] kept generated column: searchVector

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "secretHash" VARCHAR(255),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_auth_methods" (
    "companyId" UUID NOT NULL,
    "method" VARCHAR(30) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_auth_methods_pkey" PRIMARY KEY ("companyId","method")
);

-- CreateIndex
CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_method_identifier_key" ON "user_identities"("method", "identifier");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_auth_methods" ADD CONSTRAINT "company_auth_methods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- drift-guard restore
-- ---------------------------------------------------------------------------
-- Restore hand-written indexes (added by scripts/check-migration-drift.mjs).
-- Idempotent: repairs anything an earlier migration dropped.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "addresses_location_gist_idx" ON "addresses" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "medicines_search_vector_gin_idx" ON "medicines" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "medicines_name_trgm_idx" ON "medicines" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "medicines_composition_trgm_idx" ON "medicines" USING GIN ("composition" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "medicine_offers_distributor_price_idx" ON "medicine_offers" ("distributorId", "bestPricePaise");
CREATE INDEX IF NOT EXISTS "medicine_offers_search_idx" ON "medicine_offers" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "medicine_offers_name_trgm_idx" ON "medicine_offers" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "medicine_offers_medicine_price_idx" ON "medicine_offers" ("medicineId", "bestPricePaise");
CREATE INDEX IF NOT EXISTS "medicine_offers_distributor_expiry_idx" ON "medicine_offers" ("distributorId", "latestExpiry" DESC);

-- ---------------------------------------------------------------------------
-- Migrate existing passwords onto identity rows.
--
-- Every user signs in with mobile + password today. That becomes one PASSWORD
-- identity each, so nobody is locked out and User.passwordHash stops being the
-- only way in.
-- ---------------------------------------------------------------------------
INSERT INTO "user_identities" (id, "userId", method, identifier, "secretHash", "isVerified", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u.id, 'PASSWORD', u.phone, u."passwordHash",
       u."phoneVerifiedAt" IS NOT NULL, now(), now()
FROM "users" u WHERE u."passwordHash" IS NOT NULL
ON CONFLICT (method, identifier) DO NOTHING;

-- Every existing tenant offers mobile + password and mobile + OTP.
INSERT INTO "company_auth_methods" ("companyId", method, "isEnabled", "updatedAt")
SELECT c.id, m.method, true, now()
FROM "companies" c CROSS JOIN (VALUES ('PASSWORD'), ('OTP')) AS m(method)
ON CONFLICT ("companyId", method) DO NOTHING;
