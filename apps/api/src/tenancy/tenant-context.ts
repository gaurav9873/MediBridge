import { AsyncLocalStorage } from 'node:async_hooks'
import { Injectable } from '@nestjs/common'
import type { TenantContext } from '@medibridge/types'

/**
 * Carries "who is asking, on whose behalf" through a request.
 *
 * AsyncLocalStorage rather than passing a context argument down every call:
 * with 40 tables and RLS underneath, one forgotten parameter is a leak, and a
 * signature change would touch every service. This makes the context ambient
 * and impossible to drop by accident.
 *
 * The company is set from the authenticated session or the resolved subdomain
 * — never from a request body or query string, so a caller cannot ask for
 * another tenant's data by supplying its id.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>()

  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn)
  }

  get(): TenantContext | undefined {
    return this.storage.getStore()
  }

  /** The current company, or null for platform-owner and unauthenticated work. */
  companyId(): string | null {
    return this.storage.getStore()?.companyId ?? null
  }

  isPlatformOwner(): boolean {
    return this.storage.getStore()?.isPlatformOwner ?? false
  }

  /**
   * Fails loudly when tenant-scoped work runs without a company.
   *
   * Without this a missing context would silently return an empty result set
   * — the query would look like it worked and simply found nothing, which is
   * far harder to notice than an error.
   */
  requireCompanyId(): string {
    const companyId = this.companyId()
    if (!companyId) {
      throw new Error(
        'No tenant context. This code path must run inside TenantContextService.run().',
      )
    }
    return companyId
  }
}
