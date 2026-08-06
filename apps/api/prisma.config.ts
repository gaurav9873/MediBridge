import path from 'node:path'
import { defineConfig, env } from 'prisma/config'
import { loadRootEnv } from './prisma/load-env'

// Prisma 7 moved the datasource URL out of schema.prisma and the seed command
// out of package.json. Both live here now.
loadRootEnv()

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
