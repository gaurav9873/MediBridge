import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'
import { loadEnv } from '../../config/env'

/**
 * The Prisma client, wired to Postgres through the pg driver adapter.
 *
 * Prisma 7 requires a driver adapter — the old bundled query engine is gone.
 * Everything spatial (ST_DWithin) and full-text (tsvector) runs through
 * $queryRaw on this same connection pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const env = loadEnv()
    super({
      // The application role, never the owner. See APP_DATABASE_URL in env.ts;
      // TenantPrismaService refuses to start if this role can bypass RLS.
      adapter: new PrismaPg({ connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL }),
      log:
        env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'warn' },
              { emit: 'event', level: 'error' },
            ]
          : [{ emit: 'event', level: 'error' }],
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }

  /** Used by the health check to prove the database is actually reachable. */
  async ping(): Promise<boolean> {
    const result = await this.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`
    return result[0]?.ok === 1
  }

  /** Confirms PostGIS is installed — without it the radius logic silently breaks. */
  async postgisVersion(): Promise<string | null> {
    try {
      const rows = await this.$queryRaw<Array<{ version: string }>>`
        SELECT extversion AS version FROM pg_extension WHERE extname = 'postgis'
      `
      return rows[0]?.version ?? null
    } catch {
      return null
    }
  }
}
