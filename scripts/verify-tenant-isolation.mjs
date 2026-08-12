#!/usr/bin/env node
/**
 * Proves tenant isolation against a live database, as the application role.
 *
 * This exists because three separate isolation claims were recorded as
 * "verified" in FOUNDATION-CHECKLIST.md while none of them worked: the API
 * connected as a SUPERUSER with BYPASSRLS, so every policy was inert; a
 * marketplace could not read its own sellers; and cross-tenant sign-in was
 * never refused because the controller never passed the portal's tenant.
 *
 * A claim in a document cannot fail. This can.
 *
 *   node scripts/verify-tenant-isolation.mjs
 *
 * Connects with APP_DATABASE_URL — deliberately the same restricted role the
 * API uses, because testing as the owner is what hid the problem originally.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const text = readFileSync(join(root, '.env'), 'utf8')
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const checks = []
const check = (name, actual, expected) => {
  const pass = actual === expected
  checks.push({ name, actual, expected, pass })
  const mark = pass ? '[32mPASS[0m' : '[31mFAIL[0m'
  const detail = pass ? `${actual}` : `got ${actual}, expected ${expected}`
  console.log(`  ${mark}  ${name.padEnd(52)} ${detail}`)
}

/**
 * The truth, read with RLS deliberately bypassed.
 *
 * Used only to compute what a tenant SHOULD see, so every assertion compares
 * two live numbers rather than one live number and a hardcoded fixture that
 * goes stale the first time someone adds test data.
 */
async function expected(client, sql) {
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.bypass_rls', 'on', true)")
  const { rows } = await client.query(sql)
  await client.query('COMMIT')
  return Number(rows[0].count)
}

/** Runs `sql` with one tenant applied, exactly as TenantPrismaService does. */
async function asTenant(client, companyId, sql) {
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.company_id', $1, true)", [companyId])
  const { rows } = await client.query(sql)
  await client.query('COMMIT')
  return Number(rows[0].count)
}

async function main() {
  loadEnv()

  const connectionString = process.env.APP_DATABASE_URL
  if (!connectionString) {
    console.error('APP_DATABASE_URL is not set. The owner role bypasses RLS; testing as it proves nothing.')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString })
  await client.connect()

  console.log('\nRow-Level Security\n')

  // The check that would have caught the original defect on day one.
  const { rows: roleRows } = await client.query(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  )
  const role = roleRows[0]
  check(`role "${role.rolname}" is not a superuser`, role.rolsuper, false)
  check(`role "${role.rolname}" does not have BYPASSRLS`, role.rolbypassrls, false)

  const { rows: unprotected } = await client.query('SELECT * FROM unprotected_tenant_tables()')
  check('every tenant table has a policy', unprotected.length, 0)

  // Setup, not a check: reading the ids needs the deliberate escape hatch,
  // because companies is itself tenant-scoped. Every assertion below runs
  // scoped to one tenant.
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.bypass_rls', 'on', true)")
  const { rows: companies } = await client.query(
    `SELECT slug, id FROM companies WHERE slug IN
       ('medibridge','healthplus','medplus-wholesale','wellness-distributors')`,
  )
  await client.query('COMMIT')
  const id = Object.fromEntries(companies.map((c) => [c.slug, c.id]))
  if (Object.keys(id).length < 4) {
    console.error('\nSeed data missing. Run: npm run db:seed\n')
    process.exit(1)
  }

  console.log('\nA tenant cannot read another tenant\n')

  // HealthPlus owns nothing and links to no seller, so it is the cleanest
  // probe: anything it can see is a leak.
  check(
    'HealthPlus sees no users',
    await asTenant(client, id.healthplus, 'SELECT count(*) FROM users'),
    0,
  )
  check(
    'HealthPlus sees no inventory',
    await asTenant(client, id.healthplus, 'SELECT count(*) FROM inventory_items'),
    0,
  )
  check(
    'HealthPlus sees no addresses',
    await asTenant(client, id.healthplus, 'SELECT count(*) FROM addresses'),
    0,
  )

  console.log('\nOne seller cannot read another\n')

  // Expectations are derived, not hardcoded: this asserts the RULE, so adding
  // a seller or importing stock cannot turn a passing suite red for no reason.
  for (const slug of ['medplus-wholesale', 'wellness-distributors']) {
    const owned = await expected(client, `SELECT count(*) FROM inventory_items WHERE "companyId" = '${id[slug]}'`)
    const visible = await asTenant(client, id[slug], 'SELECT count(*) FROM inventory_items')
    check(`${slug} sees its own batches and no others`, visible, owned)
  }

  // Stock transfers are tenant rows too. The generic policy check above proves
  // the table HAS a policy; this proves the policy does what it claims.
  for (const slug of ['medplus-wholesale', 'wellness-distributors']) {
    const owned = await expected(
      client,
      `SELECT count(*) FROM stock_transfers WHERE "companyId" = '${id[slug]}'`,
    )
    const visible = await asTenant(client, id[slug], 'SELECT count(*) FROM stock_transfers')
    check(`${slug} sees its own stock transfers and no others`, visible, owned)
  }

  console.log('\nA marketplace reads its sellers\' shop window, not their books\n')

  const linked = `SELECT "sellerId" FROM company_links WHERE "marketplaceId" = '${id.medibridge}' AND "isActive"`
  check(
    'marketplace sees every linked seller offer',
    await asTenant(client, id.medibridge, 'SELECT count(*) FROM medicine_offers'),
    await expected(client, `SELECT count(*) FROM medicine_offers WHERE "companyId" IN (${linked})`),
  )
  check(
    'marketplace sees every linked seller warehouse',
    await asTenant(client, id.medibridge, 'SELECT count(*) FROM warehouses'),
    await expected(client, `SELECT count(*) FROM warehouses WHERE "companyId" IN (${linked})`),
  )
  // The line between a shop window and a ledger: offers are public, the
  // batches, costs and expiries behind them are not.
  check(
    'marketplace sees NO seller inventory',
    await asTenant(client, id.medibridge, 'SELECT count(*) FROM inventory_items'),
    0,
  )

  console.log('\nThe global catalogue stays shared\n')

  const catalogue = await asTenant(client, id['medplus-wholesale'], 'SELECT count(*) FROM medicines')
  check('a seller reads the global medicine master', catalogue > 0, true)

  console.log('\nWrites stay strict\n')

  // A tenant writing into another tenant's rows must be refused by the
  // database, not merely by a WHERE clause someone might forget.
  // Deliberately unqualified: no WHERE narrows this to HealthPlus. If the
  // database is the thing enforcing isolation, it still touches nothing.
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.company_id', $1, true)", [id.healthplus])
  const priceRewrite = await client.query('UPDATE medicine_offers SET "bestPricePaise" = 1')
  const stockWipe = await client.query('UPDATE inventory_items SET quantity = 0')
  await client.query('ROLLBACK')
  check("HealthPlus cannot rewrite another tenant's prices", priceRewrite.rowCount, 0)
  check("HealthPlus cannot zero another tenant's stock", stockWipe.rowCount, 0)

  // The marketplace can READ its sellers' offers — it must still not write them.
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.company_id', $1, true)", [id.medibridge])
  const readable = await client.query('SELECT count(*) FROM medicine_offers')
  const writable = await client.query('UPDATE medicine_offers SET "bestPricePaise" = 1')
  await client.query('ROLLBACK')
  check('marketplace can read seller offers at all', Number(readable.rows[0].count) > 0, true)
  check('marketplace cannot write seller offers', writable.rowCount, 0)

  await client.end()

  const failed = checks.filter((c) => !c.pass)
  console.log('')
  if (failed.length > 0) {
    console.error(`${failed.length} of ${checks.length} checks FAILED\n`)
    process.exit(1)
  }
  console.log(`All ${checks.length} isolation checks passed.\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
