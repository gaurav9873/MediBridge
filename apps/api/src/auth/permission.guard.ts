import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiErrorCode, type Permission } from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'
import type { AuthenticatedRequest } from './auth.guard'

export const PERMISSIONS_KEY = 'requiredPermissions'

/**
 * Guards check permission KEYS, never role names.
 *
 *     @RequirePermission(Permission.ORDER_ACCEPT)
 *
 * Fixed roles ship as bundles of these keys, so turning on custom roles later
 * is a UI feature — no guard and no table changes.
 */
export const RequirePermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions)

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: TenantPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required?.length) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.user
    if (!user) throw new AppException(ApiErrorCode.UNAUTHENTICATED)

    const granted = await this.permissionsFor(user.id)
    const allowed = required.every((permission) => granted.has(permission))
    if (!allowed) throw new AppException(ApiErrorCode.FORBIDDEN)

    return true
  }

  /** Every permission across every role the user holds. */
  private async permissionsFor(userId: string): Promise<Set<string>> {
    // Joins roles, which is tenant-scoped. Permissions are resolved before the
    // request's own tenant work begins, so this reads outside that scope.
    const assignments = await this.db.runPreTenant((tx) =>
      tx.userRoleAssignment.findMany({
        where: { userId },
        include: { role: { include: { permissions: true } } },
      }),
    )

    const granted = new Set<string>()
    for (const assignment of assignments) {
      for (const permission of assignment.role.permissions) {
        granted.add(permission.permission)
      }
    }
    return granted
  }
}
