import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiErrorCode, type SessionUser, type UserRole } from '@medibridge/types'
import type { Request } from 'express'
import { AppException } from '../common/errors/app-exception'
import { CompanyLinkService } from '../tenancy/company-link.service'
import { TenantContextService } from '../tenancy/tenant-context'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'

export const ACCESS_COOKIE = 'mb_access'
export const REFRESH_COOKIE = 'mb_refresh'

/** Marks a route as reachable without signing in. */
export const IS_PUBLIC = 'isPublic'
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true)

/** Restricts a route to specific roles. Used with AuthGuard. */
export const ROLES_KEY = 'roles'
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles)

export interface AuthenticatedRequest extends Request {
  user?: SessionUser
}

/** Injects the signed-in user into a handler. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>()
  return request.user
})

/**
 * Reads the access token from its httpOnly cookie and loads the user.
 *
 * The token is a cookie rather than an Authorization header on purpose:
 * JavaScript cannot read it, so an XSS bug cannot exfiltrate the session.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token body — so suspending an account takes effect immediately
 * instead of whenever the access token happens to expire.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
    private readonly links: CompanyLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.cookies?.[ACCESS_COOKIE]

    if (!token) throw new AppException(ApiErrorCode.UNAUTHENTICATED)

    let userId: string
    try {
      userId = this.tokens.verifyAccessToken(token).sub
    } catch {
      // Expired or tampered. The web app answers this by calling /auth/refresh.
      throw new AppException(ApiErrorCode.SESSION_EXPIRED)
    }

    const user = await this.auth.findSessionUser(userId)
    if (!user) throw new AppException(ApiErrorCode.SESSION_EXPIRED)

    request.user = user

    /*
     * Refine the tenant now that the session is known.
     *
     * The middleware could only use host, path and headers. An ordinary API
     * call carries none of those, so this is where most requests actually get
     * their tenant — and where a mismatch between the portal's tenant and the
     * user's own is caught.
     */
    const tenantContext = this.tenant.get()
    if (tenantContext) {
      if (tenantContext.companyId && user.companyId && tenantContext.companyId !== user.companyId) {
        // A seller trading through this marketplace may use its portal. Anyone
        // else whose session says a different tenant is refused rather than
        // silently preferred.
        if (!(await this.links.mayUsePortal(tenantContext.companyId, user.companyId))) {
          throw new AppException(ApiErrorCode.FORBIDDEN)
        }
      }
      // The session decides what the request may READ. A seller signing in
      // through the marketplace still sees only its own rows.
      tenantContext.companyId = user.companyId ?? tenantContext.companyId
      tenantContext.isPlatformOwner = user.companyId === null && user.role === 'ADMIN'
    }

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (required?.length && !required.includes(user.role)) {
      throw new AppException(ApiErrorCode.FORBIDDEN)
    }

    return true
  }
}
