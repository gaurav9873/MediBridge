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
    await this.assertRlsApplies()
    await this.assertEveryTenantTableHasAPolicy()
  }

  /**
   * Refuse to run as a role that Postgres exempts from Row-Level Security.
   *
   * Policies on every table counted for nothing while the API connected as a
   * SUPERUSER with BYPASSRLS: correct policies, never applied, and a
   * cross-tenant read returned everything. Coverage and enforcement are
   * different questions, so they get different checks.
   */
  private async assertRlsApplies(): Promise<void> {
    const [role] = await this.prisma.$queryRaw<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`
      SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
    `

    if (!role) {
      this.logger.warn('Could not identify the database role — skipping the RLS bypass check')
      return
    }

    if (role.rolsuper || role.rolbypassrls) {
      this.logger.error(
        `Database role "${role.rolname}" bypasses Row-Level Security ` +
          `(superuser=${role.rolsuper}, bypassrls=${role.rolbypassrls}). ` +
          'Every tenant policy would be inert. Point APP_DATABASE_URL at a ' +
          'role with NOSUPERUSER and NOBYPASSRLS.',
      )
      throw new Error(`Refusing to start: role "${role.rolname}" bypasses Row-Level Security`)
    }

    this.logger.log(`Row-Level Security applies to this connection (role: ${role.rolname})`)
  }

  private async assertEveryTenantTableHasAPolicy(): Promise<void> {
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

  /**
   * Lookups from before a tenant is known.
   *
   * Three things happen before there is a tenant to scope by, and each of them
   * is how the tenant gets decided in the first place:
   *
   *   - resolving a host, domain or slug to a company
   *   - fetching that company's branding for the login page
   *   - identifying a user, since the tenant is derived FROM the user
   *
   * Scoping these by tenant would be circular, so they are unscoped for that
   * reason and no other. That is why this is a separate, narrowly named method
   * rather than a second use of runAsPlatform — and why the checks that follow
   * matter: AuthService refuses a session whose company does not match the
   * portal it arrived on.
   *
   * Unlogged, unlike runAsPlatform, because it runs on every request rather
   * than on a deliberate administrative action.
   */
  async runPreTenant<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
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
