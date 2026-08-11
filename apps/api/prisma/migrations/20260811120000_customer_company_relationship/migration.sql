-- ---------------------------------------------------------------------------
-- Customer ↔ Company becomes a real many-to-many relationship.
--
-- Hand-written rather than generated. Prisma's diff of this schema also wants
-- to drop the GiST, GIN and trigram indexes it cannot see, and to drop and
-- recreate four unrelated foreign keys — see scripts/check-migration-drift.mjs.
-- Only the statements belonging to THIS change are below.
--
-- What changes, and why:
--
--   1. `customers.userId` was globally UNIQUE, so one buyer could be the
--      customer of exactly one distributor. That is the single line standing
--      between the current model and a shop that buys antibiotics from one
--      stockist and surgical supplies from another. It becomes unique per
--      company instead: many distributors, never two rows for the same pair.
--
--   2. Standing moves onto the relationship. A shop suspended by one
--      distributor is not suspended by the others, so PENDING/ACTIVE/
--      SUSPENDED/REJECTED cannot live on the user.
--
--   3. Orders record the customer they were placed under. With one
--      distributor, `retailerId -> Customer` was an unambiguous lookup. With
--      several it is not, and credit limits and payment terms hang off the
--      answer. Resolved at creation rather than inferred afterwards.
--
-- Safe on existing data: the backfill below preserves every current
-- relationship, and `orders` is empty at the time of writing, which is what
-- makes a NOT NULL column without a default possible here.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- AlterTable: standing, per relationship
ALTER TABLE "customers" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'PENDING';

-- ---------------------------------------------------------------------------
-- Backfill.
--
-- Every relationship that exists today predates the column, so its standing
-- has to be inferred from the only signal there was: whether the buyer's
-- account had been through licence approval. An ACTIVE account means somebody
-- checked their drug licence and accepted them, which is exactly what this
-- column now records.
--
-- Anything else stays PENDING — the safe reading. A relationship wrongly left
-- pending is a distributor clicking approve; a relationship wrongly marked
-- active is a shop trading on an unchecked licence.
--
-- `approvedAt` uses the relationship's own creation time rather than now(), so
-- the row does not claim it was approved during a schema migration.
-- ---------------------------------------------------------------------------
UPDATE "customers" AS c
SET "status" = 'ACTIVE', "approvedAt" = c."createdAt"
FROM "users" AS u
WHERE u."id" = c."userId"
  AND u."accountStatus" = 'ACTIVE'
  AND c."deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- One buyer, many distributors — but never twice with the same one.
-- ---------------------------------------------------------------------------
DROP INDEX "customers_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_userId_key" ON "customers"("companyId", "userId");

-- CreateIndex
CREATE INDEX "customers_userId_status_idx" ON "customers"("userId", "status");

-- ---------------------------------------------------------------------------
-- Orders name the relationship they were placed under.
--
-- NOT NULL without a default is deliberate and only safe because no order has
-- ever been written. It means the column can never be quietly skipped when
-- order creation is built in Phase 3.7.
-- ---------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN     "customerId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "orders_customerId_status_createdAt_idx" ON "orders"("customerId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
