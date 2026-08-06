-- CreateEnum
CREATE TYPE "BulkJobType" AS ENUM ('MEDICINE_IMPORT', 'INVENTORY_IMPORT', 'INVENTORY_STOCK_UPDATE', 'INVENTORY_PRICE_UPDATE', 'INVENTORY_EXPIRY_UPDATE', 'INVENTORY_STATUS_UPDATE', 'USER_IMPORT');

-- CreateEnum
CREATE TYPE "BulkJobStatus" AS ENUM ('PENDING', 'VALIDATING', 'AWAITING_CONFIRMATION', 'IMPORTING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- DropIndex
-- removed: Prisma drift on a GENERATED column, see docs/BULK-OPERATIONS.md

-- DropIndex
-- removed: hand-written index Prisma cannot see

-- DropIndex
-- removed: hand-written index Prisma cannot see

-- DropIndex
-- removed: hand-written index Prisma cannot see

-- AlterTable
-- removed: Prisma drift on a GENERATED column, see docs/BULK-OPERATIONS.md

-- AlterTable
-- removed: Prisma drift on a GENERATED column, see docs/BULK-OPERATIONS.md

-- CreateTable
CREATE TABLE "bulk_jobs" (
    "id" UUID NOT NULL,
    "type" "BulkJobType" NOT NULL,
    "status" "BulkJobStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" UUID NOT NULL,
    "scopeId" UUID,
    "fileKey" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "totalRows" INTEGER,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createCount" INTEGER NOT NULL DEFAULT 0,
    "updateCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorsTruncated" BOOLEAN NOT NULL DEFAULT false,
    "errorFileKey" VARCHAR(500),
    "resultFileKey" VARCHAR(500),
    "options" JSONB,
    "failureReason" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_job_errors" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "column" VARCHAR(80),
    "value" VARCHAR(500),
    "message" TEXT NOT NULL,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_job_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulk_jobs_createdById_queuedAt_idx" ON "bulk_jobs"("createdById", "queuedAt");

-- CreateIndex
CREATE INDEX "bulk_jobs_type_status_idx" ON "bulk_jobs"("type", "status");

-- CreateIndex
CREATE INDEX "bulk_jobs_status_queuedAt_idx" ON "bulk_jobs"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "bulk_job_errors_jobId_rowNumber_idx" ON "bulk_job_errors"("jobId", "rowNumber");

-- AddForeignKey
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_job_errors" ADD CONSTRAINT "bulk_job_errors_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "bulk_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Restore the hand-written indexes.
--
-- Prisma cannot express GiST, GIN or trigram indexes on Unsupported() columns,
-- so it reads them as drift and emits DROP INDEX on every migration. Those
-- statements are stripped by scripts/check-migration-drift.mjs; these
-- idempotent creates repair any that a previous run removed.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "addresses_location_gist_idx" ON "addresses" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "medicines_search_vector_gin_idx" ON "medicines" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "medicines_name_trgm_idx" ON "medicines" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "medicines_composition_trgm_idx" ON "medicines" USING GIN ("composition" gin_trgm_ops);
