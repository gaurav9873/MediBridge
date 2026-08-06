import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

/**
 * Loads the monorepo's single root .env.
 *
 * Walks up from the current working directory looking for it, rather than
 * assuming a fixed depth — so `npm run db:seed -w @medibridge/api` (cwd
 * apps/api) and `tsx apps/api/prisma/seed.ts` (cwd repo root) both work.
 *
 * Deliberately avoids import.meta: these files are executed as CommonJS by
 * tsx and the Prisma CLI, where it is not available.
 */
export function loadRootEnv(): void {
  let directory = process.cwd()

  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(directory, '.env')
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, quiet: true })
      return
    }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
}

/** Loads the environment and fails loudly if the database URL is missing. */
export function requireDatabaseUrl(): string {
  loadRootEnv()
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env at the repo root.')
    process.exit(1)
  }
  return url
}
