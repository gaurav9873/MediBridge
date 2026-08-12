-- ---------------------------------------------------------------------------
-- Stock transfers between a company's own warehouses.
--
-- Hand-written rather than generated: Prisma's diff of this schema also wants
-- to drop the GiST, GIN and trigram indexes it cannot see. Only the statements
-- belonging to THIS change are below.
--
-- A record rather than only an AuditLog row, because "what moved last week?"
-- is a question a distributor asks of their own data, and you cannot filter a
-- screen by an audit line.
--
-- No status column on purpose. This records a move that has already happened
-- on the shelf. Tracking a lorry between two of your own warehouses is a
-- different feature with its own lifecycle, and inventing that state machine
-- here would be guessing at it.
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "stock_transfers" (
    "companyId" UUID NOT NULL,
    "id" UUID NOT NULL,
    "fromWarehouseId" UUID NOT NULL,
    "toWarehouseId" UUID NOT NULL,
    "medicineId" UUID NOT NULL,
    "batchNumber" VARCHAR(60) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "transferredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_companyId_createdAt_idx" ON "stock_transfers"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfers_medicineId_createdAt_idx" ON "stock_transfers"("medicineId", "createdAt");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Sanity: a transfer moves a positive quantity, and never to where it already
-- is. Both are checked in the service with a readable message; these are the
-- backstop for anything that does not go through it.
-- ---------------------------------------------------------------------------
ALTER TABLE "stock_transfers"
    ADD CONSTRAINT "stock_transfer_positive_quantity" CHECK ("quantity" > 0);

ALTER TABLE "stock_transfers"
    ADD CONSTRAINT "stock_transfer_distinct_warehouses"
    CHECK ("fromWarehouseId" <> "toWarehouseId");

-- ---------------------------------------------------------------------------
-- Row-Level Security.
--
-- Same shape as every other tenant table. A new tenant table without this is
-- exactly the hole verify:isolation exists to catch, so the script gains a
-- check for it in the same commit.
-- ---------------------------------------------------------------------------
ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfers" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "stock_transfers"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "companyId" IS NOT DISTINCT FROM nullif(current_setting('app.company_id', true), '')::uuid
  );

-- The restricted application role. ALTER DEFAULT PRIVILEGES should cover this
-- already; granting explicitly costs nothing and does not depend on which role
-- happened to create the table.
GRANT SELECT, INSERT, UPDATE, DELETE ON "stock_transfers" TO medibridge_app;
