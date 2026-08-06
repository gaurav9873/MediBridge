/*
  Warnings:

  - Added the required column `companyId` to the `bulk_job_errors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `bulk_jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `cart_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `carts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `deliveries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `inventory_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `medicine_offers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `medicine_requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `order_groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `order_status_history` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `problem_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `refunds` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `settlement_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `settlements` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `stock_reservations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BusinessMode" AS ENUM ('MARKETPLACE', 'PRIVATE_DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTermType" AS ENUM ('TOKEN_PLUS_COD', 'PREPAID', 'COD', 'CREDIT');

-- DropForeignKey
ALTER TABLE "medicine_offers" DROP CONSTRAINT "medicine_offers_distributorId_fkey";

-- DropForeignKey
ALTER TABLE "medicine_offers" DROP CONSTRAINT "medicine_offers_medicineId_fkey";

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
ALTER TABLE "addresses" ADD COLUMN     "companyId" UUID;
-- [drift-guard] kept generated column: location

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "bulk_job_errors" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "bulk_jobs" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "medicine_offers" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "medicine_requests" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "medicines" ADD COLUMN     "companyId" UUID;
-- [drift-guard] kept generated column: searchVector

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "order_groups" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "order_status_history" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "problem_reports" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "settlement_items" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "stock_reservations" ADD COLUMN     "companyId" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "companyId" UUID;

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'TRIAL',
    "businessMode" "BusinessMode" NOT NULL DEFAULT 'PRIVATE_DISTRIBUTOR',
    "gstNumber" VARCHAR(15),
    "drugLicenseNumber" VARCHAR(60),
    "supportEmail" VARCHAR(255),
    "supportPhone" VARCHAR(10),
    "logoUrl" VARCHAR(500),
    "brandColor" VARCHAR(9),
    "loginImageUrl" VARCHAR(500),
    "customDomain" VARCHAR(255),
    "paymentTermType" "PaymentTermType" NOT NULL DEFAULT 'TOKEN_PLUS_COD',
    "tokenPercent" INTEGER NOT NULL DEFAULT 20,
    "creditDays" INTEGER NOT NULL DEFAULT 30,
    "planId" UUID,
    "trialEndsOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_links" (
    "id" UUID NOT NULL,
    "marketplaceId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "addressId" UUID NOT NULL,
    "sameDayRadiusKm" INTEGER NOT NULL DEFAULT 25,
    "sameDayCutoffTime" VARCHAR(5) NOT NULL DEFAULT '14:00',
    "deliveryChargePaise" INTEGER NOT NULL DEFAULT 0,
    "freeDeliveryAbovePaise" INTEGER,
    "isAcceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessName" VARCHAR(160) NOT NULL,
    "gstNumber" VARCHAR(15),
    "drugLicenseNumber" VARCHAR(60),
    "licenseExpiresOn" DATE,
    "creditLimitPaise" INTEGER,
    "paymentTermType" "PaymentTermType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permission" VARCHAR(60) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "pricePaise" INTEGER NOT NULL DEFAULT 0,
    "billingPeriod" VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "planId" UUID NOT NULL,
    "capability" VARCHAR(60) NOT NULL,
    "limit" INTEGER,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("planId","capability")
);

-- CreateTable
CREATE TABLE "company_capabilities" (
    "companyId" UUID NOT NULL,
    "capability" VARCHAR(60) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "limit" INTEGER,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_capabilities_pkey" PRIMARY KEY ("companyId","capability")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "companies_customDomain_key" ON "companies"("customDomain");

-- CreateIndex
CREATE INDEX "companies_status_businessMode_idx" ON "companies"("status", "businessMode");

-- CreateIndex
CREATE INDEX "companies_deletedAt_idx" ON "companies"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_links_marketplaceId_sellerId_key" ON "company_links"("marketplaceId", "sellerId");

-- CreateIndex
CREATE INDEX "warehouses_companyId_isAcceptingOrders_idx" ON "warehouses"("companyId", "isAcceptingOrders");

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "customers"("userId");

-- CreateIndex
CREATE INDEX "customers_companyId_deletedAt_idx" ON "customers"("companyId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_gstNumber_key" ON "customers"("companyId", "gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "roles_companyId_key_key" ON "roles"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE INDEX "subscriptions_companyId_status_idx" ON "subscriptions"("companyId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_requests" ADD CONSTRAINT "medicine_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_groups" ADD CONSTRAINT "order_groups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_job_errors" ADD CONSTRAINT "bulk_job_errors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_offers" ADD CONSTRAINT "medicine_offers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_offers" ADD CONSTRAINT "medicine_offers_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_offers" ADD CONSTRAINT "medicine_offers_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "distributor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_links" ADD CONSTRAINT "company_links_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_links" ADD CONSTRAINT "company_links_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_capabilities" ADD CONSTRAINT "company_capabilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- Tenant #1 and backfill
--
-- Everything that exists today belongs to one company. Creating it here rather
-- than in the seed means this migration is correct against a real database
-- with real data, not only against an empty one.
-- ===========================================================================
DO $$
DECLARE v_company uuid;
BEGIN
    INSERT INTO "plans" (id, key, name, "pricePaise", "billingPeriod", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), 'ENTERPRISE', 'Enterprise', 0, 'MONTHLY', true, now(), now())
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO "companies" (id, name, slug, status, "businessMode", "paymentTermType",
                             "tokenPercent", "creditDays", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), 'MediBridge', 'medibridge', 'ACTIVE', 'MARKETPLACE',
            'TOKEN_PLUS_COD', 20, 30, now(), now())
    RETURNING id INTO v_company;

UPDATE "audit_logs" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "bulk_job_errors" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "bulk_jobs" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "cart_items" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "carts" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "deliveries" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "documents" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "inventory_items" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "medicine_offers" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "medicine_requests" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "notification_preferences" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "notifications" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "order_groups" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "order_items" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "order_status_history" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "orders" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "payments" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "problem_reports" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "refunds" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "settings" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "settlement_items" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "settlements" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "stock_reservations" SET "companyId" = v_company WHERE "companyId" IS NULL;
UPDATE "users" SET "companyId" = v_company WHERE "companyId" IS NULL;
END $$;

ALTER TABLE "bulk_job_errors" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "bulk_jobs" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "cart_items" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "carts" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "deliveries" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "inventory_items" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "medicine_offers" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "medicine_requests" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "order_groups" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "order_status_history" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "problem_reports" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "refunds" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "settlement_items" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "settlements" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "stock_reservations" ALTER COLUMN "companyId" SET NOT NULL;

-- ===========================================================================
-- Row-Level Security
--
-- The final layer. After this, a query without app.company_id set returns
-- NOTHING from these tables — from Prisma, from raw SQL, or from a bug. Wrong
-- data is not filtered out; it is never returned.
--
-- `IS NOT DISTINCT FROM` rather than `=` so that rows with a NULL companyId
-- (the global medicine master, platform settings) are visible when no company
-- context is set, and invisible when one is.
--
-- app.bypass_rls is set only by the platform-owner client, so a platform-wide
-- query is a deliberate, auditable act.
-- ===========================================================================
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "bulk_job_errors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bulk_job_errors" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bulk_job_errors"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "bulk_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bulk_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bulk_jobs"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "cart_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "carts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "deliveries"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "documents"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inventory_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "medicine_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medicine_offers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "medicine_offers"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "medicine_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medicine_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "medicine_requests"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_preferences"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "order_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_groups" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_groups"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_status_history"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "orders"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "problem_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "problem_reports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "problem_reports"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "refunds"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "settings"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "settlement_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlement_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "settlement_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "settlements"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "stock_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_reservations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "stock_reservations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );

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
