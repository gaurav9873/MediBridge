import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../common/prisma/prisma.service'
import { TenantContextService } from './tenant-context'

/** The transaction client handed to callers. */
export type TenantTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

/**
 * Runs database work with the tenant's Row-Level Security context applied.
 *
 * RLS reads `app.company_id` from the session. With a connection pool a plain
 * `SET` would persist on the connection and leak into whoever borrows it next,
 * so the setting must be transaction-local — which means the work has to run
 * inside a transaction. `set_config(..., true)` is the transaction-local form.
 *
 *   await tenantDb.run(async (tx) => tx.order.findMany())
 *
 * Inside that callback the database itself refuses to return another tenant's
 * rows, whether the query came from Prisma or from raw SQL.
 */
@Injectable()
export class TenantPrismaService implements OnModuleInit {
  private readonly logger = new Logger(TenantPrismaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  /**
   * The unscoped client, for infrastructure reads only.
   *
   * Job bookkeeping — status polling, progress counters — is keyed by primary
   * key and belongs to the engine, not to a tenant. Business data must never
   * come through here; that is what run() and runAs() are for.
   */
  get raw(): PrismaService {
    return this.prisma
  }

  /**
   * A startup check that every tenant table is actually protected.
   *
   * Coverage was derived by pattern-matching generated SQL once, and it missed
   * two tables. Now the database is asked directly, at boot, every boot.
   */
  async onModuleInit(): Promise<void> {
    try {
      const unprotected = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT * FROM unprotected_tenant_tables()
      `
      if (unprotected.length > 0) {
        const names = unprotected.map((row) => row.table_name).join(', ')
        this.logger.error(`Tenant tables without RLS: ${names}`)
        throw new Error(`Refusing to start: ${unprotected.length} tenant table(s) unprotected`)
      }
      this.logger.log('Row-Level Security verified on every tenant table')
    } catch (error) {
      if ((error as Error).message.startsWith('Refusing to start')) throw error
      // The check function is created by a migration; a database that has not
      // run it yet should say so clearly rather than fail mysteriously.
      this.logger.warn('Could not verify RLS coverage — is the database migrated?')
    }
  }

  /** Runs `fn` with the current request's tenant applied. */
  async run<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    const context = this.context.get()
    return this.withTenant(context?.companyId ?? null, context?.isPlatformOwner ?? false, fn)
  }

  /**
   * Explicit form, for work outside a request — the bulk worker, scheduled
   * jobs, the seed. The company must be passed deliberately.
   */
  async runAs<T>(companyId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.withTenant(companyId, false, fn)
  }

  /**
   * Platform-owner access across every tenant.
   *
   * Deliberately verbose to call, and logged, because it is the one path that
   * can read everything.
   */
  async runAsPlatform<T>(reason: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    this.logger.log(`Platform-wide query: ${reason}`)
    return this.withTenant(null, true, fn)
  }

  private async withTenant<T>(
    companyId: string | null,
    bypass: boolean,
    fn: (tx: TenantTx) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // `true` = transaction-local, so the setting cannot outlive this
      // transaction and reach the next borrower of the pooled connection.
      if (bypass) {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`
      } else {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId ?? ''}, true)`
      }
      return fn(tx)
    })
  }
}
