#!/usr/bin/env node
/**
 * Strips false drift from a freshly generated Prisma migration.
 *
 * Parts of this schema cannot be expressed in schema.prisma:
 *
 *   - `addresses.location`         GENERATED geography column + GiST index
 *   - `medicines.searchVector`     GENERATED tsvector + GIN index
 *   - `medicine_offers.searchVector` and its indexes (trigger-maintained)
 *   - trigram indexes for typo-tolerant search
 *   - partial indexes and CHECK constraints
 *
 * Prisma cannot see them, reads them as drift, and emits DROP INDEX / ALTER
 * COLUMN statements on EVERY new migration. Applying one silently destroys the
 * delivery-radius and search indexes — the app keeps working, just slowly and
 * wrongly, which is the worst kind of failure.
 *
 * Matching is done on OBJECT NAMES, not on whole statements. An earlier version
 * matched exact single-line statements and missed
 *
 *     ALTER TABLE "addresses" ADD COLUMN "companyId" UUID,
 *     ALTER COLUMN "location" DROP DEFAULT;
 *
 * because Prisma splits a multi-clause ALTER TABLE across lines. Names are what
 * is stable; statement layout is not.
 *
 * Runs automatically as part of `npm run db:migrate`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved from this file, not from cwd — the script is invoked from both the
// repo root and apps/api, and silently finding no migrations is worse than
// failing loudly.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.resolve(HERE, '..', 'apps/api/prisma/migrations')

/** Indexes Prisma cannot express, so must never be allowed to drop. */
const PROTECTED_INDEXES = [
  'addresses_location_gist_idx',
  'addresses_one_default_per_user',
  'medicines_search_vector_gin_idx',
  'medicines_name_trgm_idx',
  'medicines_composition_trgm_idx',
  'inventory_items_sellable_idx',
  'stock_reservations_live_idx',
  'medicine_offers_distributor_price_idx',
  'medicine_offers_search_idx',
  'medicine_offers_name_trgm_idx',
  'medicine_offers_medicine_price_idx',
  'medicine_offers_distributor_expiry_idx',
]

/** GENERATED columns. Prisma tries to strip their expression. */
const PROTECTED_GENERATED_COLUMNS = ['location', 'searchVector']

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

/**
 * The migration to check.
 *
 * Picked by modification time, not by name. Name order was wrong: a migration
 * hand-written with a later timestamp than the one Prisma just generated made
 * the guard inspect the wrong file and report "clean" while real drift sat in
 * the new one. An explicit path can also be passed as the first argument.
 */
function targetMigration() {
  const explicit = process.argv[2]
  if (explicit) {
    const file = explicit.endsWith('.sql') ? explicit : path.join(explicit, 'migration.sql')
    return path.resolve(file)
  }
  if (!fs.existsSync(MIGRATIONS_DIR)) return null

  const dirs = fs
    .readdirSync(MIGRATIONS_DIR)
    .map((name) => path.join(MIGRATIONS_DIR, name))
    .filter((full) => fs.statSync(full).isDirectory())
    .map((full) => ({ full, mtime: fs.statSync(full).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  return dirs[0] ? path.join(dirs[0].full, 'migration.sql') : null
}

const file = targetMigration()
if (!file || !fs.existsSync(file)) {
  console.error('Drift guard: no migration found. Check the path.')
  process.exit(1)
}

const original = fs.readFileSync(file, 'utf8')
const lines = original.split('\n')
const output = []
let stripped = 0

for (let index = 0; index < lines.length; index++) {
  const line = lines[index]

  // 1. Whole-statement drops of a protected index.
  const dropIndex = /^\s*DROP INDEX (?:IF EXISTS )?"([^"]+)"\s*;\s*$/.exec(line)
  if (dropIndex && PROTECTED_INDEXES.includes(dropIndex[1])) {
    output.push(`-- [drift-guard] kept: ${dropIndex[1]}`)
    stripped += 1
    continue
  }

  // 2. A clause stripping a GENERATED column's expression. It may be the only
  //    clause, or one of several in a multi-line ALTER TABLE — so the previous
  //    line's trailing comma has to become a semicolon when this one goes.
  const alterColumn = /^\s*ALTER COLUMN "([^"]+)" DROP DEFAULT\s*(,|;)\s*$/.exec(line)
  if (alterColumn && PROTECTED_GENERATED_COLUMNS.includes(alterColumn[1])) {
    const terminator = alterColumn[2]
    if (terminator === ';') {
      // Last clause: the previous line ends with a comma that must now close.
      for (let back = output.length - 1; back >= 0; back--) {
        if (output[back].trim().endsWith(',')) {
          output[back] = output[back].replace(/,\s*$/, ';')
          break
        }
        if (output[back].trim().endsWith(';')) break
      }
    }
    output.push(`-- [drift-guard] kept generated column: ${alterColumn[1]}`)
    stripped += 1
    continue
  }

  output.push(line)
}

let sql = output.join('\n')

if (stripped > 0) {
  if (!sql.includes('drift-guard restore')) {
    sql += `\n-- drift-guard restore${RESTORE_SQL}`
  }
  fs.writeFileSync(file, sql)
  console.log(
    `Drift guard: removed ${stripped} destructive statement(s) from ${path.basename(path.dirname(file))}`,
  )
} else {
  console.log('Drift guard: migration is clean.')
}
