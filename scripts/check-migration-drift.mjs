#!/usr/bin/env node
/**
 * Strips false drift from a freshly generated Prisma migration.
 *
 * Parts of this schema cannot be expressed in schema.prisma:
 *
 *   - `addresses.location`   GENERATED geography column + GiST index
 *   - `medicines.searchVector` GENERATED tsvector + GIN index
 *   - trigram indexes for typo-tolerant search
 *   - partial indexes and CHECK constraints
 *
 * Prisma cannot see them, reads them as drift, and emits DROP INDEX / ALTER
 * COLUMN statements on EVERY new migration. Applying one silently destroys the
 * delivery-radius and search indexes — the app keeps working, just slowly and
 * wrongly, which is the worst kind of failure.
 *
 * This runs automatically as part of `npm run db:migrate`. It rewrites the
 * newest migration, commenting out the destructive statements and appending
 * idempotent re-creates as a backstop.
 */
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve('apps/api/prisma/migrations')

/** Statements that must never reach the database. */
const FORBIDDEN_PATTERNS = [
  /^DROP INDEX "addresses_location_gist_idx";$/m,
  /^DROP INDEX "medicines_search_vector_gin_idx";$/m,
  /^DROP INDEX "medicines_name_trgm_idx";$/m,
  /^DROP INDEX "medicines_composition_trgm_idx";$/m,
  /^DROP INDEX "inventory_items_sellable_idx";$/m,
  /^DROP INDEX "stock_reservations_live_idx";$/m,
  /^DROP INDEX "addresses_one_default_per_user";$/m,
  /^ALTER TABLE "addresses" ALTER COLUMN "location" DROP DEFAULT;$/m,
  /^ALTER TABLE "medicines" ALTER COLUMN "searchVector" DROP DEFAULT;$/m,
  /^ALTER TABLE "addresses" DROP COLUMN "location";$/m,
  /^ALTER TABLE "medicines" DROP COLUMN "searchVector";$/m,
  // The search read model is trigger-maintained; Prisma sees its indexes and
  // its tsvector column as drift for the same reason.
  /^DROP INDEX "medicine_offers_distributor_price_idx";$/m,
  /^DROP INDEX "medicine_offers_search_idx";$/m,
  /^DROP INDEX "medicine_offers_name_trgm_idx";$/m,
  /^DROP INDEX "medicine_offers_medicine_price_idx";$/m,
  /^DROP INDEX "medicine_offers_distributor_expiry_idx";$/m,
  /^ALTER TABLE "medicine_offers" ALTER COLUMN "searchVector" DROP DEFAULT;$/m,
]

/** Re-created idempotently, so a previously damaged database repairs itself. */
const RESTORE_SQL = `
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
`

function newestMigration() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return null
  const dirs = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => fs.statSync(path.join(MIGRATIONS_DIR, name)).isDirectory())
    .sort()
  const newest = dirs.at(-1)
  return newest ? path.join(MIGRATIONS_DIR, newest, 'migration.sql') : null
}

const file = newestMigration()
if (!file || !fs.existsSync(file)) {
  console.log('No migration to check.')
  process.exit(0)
}

let sql = fs.readFileSync(file, 'utf8')
let stripped = 0

for (const pattern of FORBIDDEN_PATTERNS) {
  if (pattern.test(sql)) {
    sql = sql.replace(
      pattern,
      (match) => `-- [drift-guard] removed, would destroy a hand-written object:\n-- ${match}`,
    )
    stripped += 1
  }
}

if (stripped > 0) {
  if (!sql.includes('drift-guard restore')) {
    sql += `\n-- drift-guard restore${RESTORE_SQL}`
  }
  fs.writeFileSync(file, sql)
  console.log(
    `Drift guard: removed ${stripped} destructive statement(s) from ${path.basename(path.dirname(file))}`,
  )
  console.log('  (Prisma cannot see the generated columns and custom indexes.)')
} else {
  console.log('Drift guard: migration is clean.')
}
