import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { TenantContext } from '@medibridge/types'
import type { NextFunction, Request, Response } from 'express'
import { TenantContextService } from './tenant-context'
import { TenantResolverService } from './tenant-resolver.service'

/**
 * Establishes the tenant for every request.
 *
 * MIDDLEWARE, not an interceptor, because Nest runs middleware before guards —
 * and the auth guard, the permission guard and every service below them need
 * the tenant to already be known.
 *
 * The whole rest of the request runs inside `TenantContextService.run()`, so
 * the context is ambient: no service takes a companyId parameter, and none can
 * forget to pass one.
 *
 * At this point the user is not known yet, so only host/path/header strategies
 * can answer. AuthGuard refines the context once the session is resolved.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly resolver: TenantResolverService,
    private readonly context: TenantContextService,
  ) {}

  async use(request: Request, response: Response, next: NextFunction): Promise<void> {
    const resolved = await this.resolver.resolve({
      host: request.get('host') ?? '',
      path: request.path,
      headers: request.headers as Record<string, string | string[] | undefined>,
    })

    const context: TenantContext = {
      companyId: resolved?.companyId ?? null,
      customerId: null,
      isPlatformOwner: false,
      mode: null,
    }

    // Everything downstream — guards, controllers, services, the database
    // session variable — runs inside this scope.
    this.context.run(context, () => next())
  }
}
