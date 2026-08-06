#!/usr/bin/env node
/**
 * Blocks until the Postgres container reports healthy.
 * Used by `npm run setup` so migrations never race the database boot.
 */
import { execSync } from 'node:child_process'

const MAX_ATTEMPTS = 40
const DELAY_MS = 1500

process.stdout.write('Waiting for PostgreSQL')

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync('docker exec medibridge-postgres pg_isready -U medibridge -d medibridge', {
      stdio: 'ignore',
    })
    process.stdout.write('\nPostgreSQL is ready.\n')
    process.exit(0)
  } catch {
    process.stdout.write('.')
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
  }
}

process.stdout.write('\nPostgreSQL did not become ready in time.\n')
process.stdout.write('Check that Docker Desktop is running, then: npm run db:logs\n')
process.exit(1)
