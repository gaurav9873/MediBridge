import path from 'node:path'
import dotenv from 'dotenv'

/**
 * Loads the repo-root .env.
 *
 * This lives in its own module and is imported FIRST in main.ts on purpose.
 * Import statements are hoisted, so calling dotenv.config() inline among the
 * other imports would run after they had already read process.env — and
 * config/env.ts validates at import time.
 */
dotenv.config({
  path: path.resolve(__dirname, '../../../.env'),
  quiet: true,
})
