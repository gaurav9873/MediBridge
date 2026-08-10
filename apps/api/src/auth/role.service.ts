import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  PERMISSION_GROUPS,
  type Permission,
  type SessionUser,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'
import { PermissionCacheService } from './permission-cache.service'

export interface RoleSummary {
  id: string
  key: string
  name: string
  /** System roles come with the platform and cannot be renamed or deleted. */
  isSystem: boolean
  permissions: string[]
  /** How many people hold it. Shown before anyone deletes one. */
  memberCount: number
}

export interface PermissionGroup {
  key: string
  label: string
  permissions: Array<{ key: string; label: string }>
}

/**
 * Who can do what, inside one company.
 *
 * Roles are per-company rows, not a global table: two companies can both have a
 * "Warehouse Manager" that means slightly different things, and one editing
 * theirs must never touch the other's. Row-Level Security enforces that; the
 * company on the session is the only one this service will ever read or write.
 *
 * The seven system roles are seeded per company and cannot be renamed or
 * deleted — they are what the platform assumes exists. Their permissions can
 * still be adjusted, because a company knowing its own business better than we
 * do is the normal case rather than the exception.
 */
@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name)

  constructor(
    private readonly db: TenantPrismaService,
    private readonly cache: PermissionCacheService,
  ) {}

  /**
   * Every role, with its permissions and how many people hold it.
   *
   * One query with two nested selects rather than a list followed by a count
   * per role: seven roles would otherwise be fifteen round trips, and the page
   * would get slower every time a company added a custom one.
   */
  async list(user: SessionUser): Promise<RoleSummary[]> {
    const roles = await this.db.run((tx) =>
      tx.role.findMany({
        where: { companyId: requireCompany(user) },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          key: true,
          name: true,
          isSystem: true,
          permissions: { select: { permission: true } },
          _count: { select: { assignments: true } },
        },
      }),
    )

    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions.map((entry) => entry.permission),
      memberCount: role._count.assignments,
    }))
  }

  /**
   * The permission catalogue, grouped the way the screen shows it.
   *
   * Read from the types package rather than the database: these are keys the
   * code checks against, so the list of what exists belongs with the code that
   * checks them. A key in the database that no guard reads would be a lie on
   * the screen.
   */
  catalogue(): PermissionGroup[] {
    return PERMISSION_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      permissions: group.permissions.map((entry) => ({ key: entry.key, label: entry.label })),
    }))
  }

  /** Creates a role of this company's own. */
  async create(
    user: SessionUser,
    input: { name: string; permissions: Permission[] },
  ): Promise<RoleSummary[]> {
    const companyId = requireCompany(user)
    const key = await this.uniqueKey(companyId, input.name)

    await this.db.run(async (tx) => {
      const role = await tx.role.create({
        data: { companyId, key, name: input.name, isSystem: false },
      })
      if (input.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((permission) => ({ roleId: role.id, permission })),
        })
      }
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'CREATE_ROLE',
          entityType: 'Role',
          entityId: role.id,
          after: { name: input.name, permissions: input.permissions } as never,
        },
      })
    })

    return this.list(user)
  }

  /**
   * Changes what a role can do, and what it is called.
   *
   * A system role keeps its name — the platform and the copy layer both refer
   * to "Company Admin" — but its permissions are the company's business.
   */
  async update(
    user: SessionUser,
    roleId: string,
    input: { name?: string; permissions: Permission[] },
  ): Promise<RoleSummary[]> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, companyId },
        include: { permissions: { select: { permission: true } } },
      })
      if (!role) throw new AppException(ApiErrorCode.NOT_FOUND)

      // Locking yourself out is easy to do and painful to undo, so the one
      // permission that can grant permissions back is protected.
      if (role.key === 'COMPANY_ADMIN' && !input.permissions.includes('ROLE_MANAGE' as Permission)) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'permissions',
              message:
                'Company Admin must keep "Manage roles", or nobody would be able to change permissions again.',
            },
          ],
        })
      }

      await tx.role.update({
        where: { id: roleId },
        data: role.isSystem ? {} : { name: input.name ?? role.name },
      })

      // Replace wholesale: the screen sends the complete set it wants, so a
      // diff would only be a chance to get it wrong.
      await tx.rolePermission.deleteMany({ where: { roleId } })
      if (input.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissions.map((permission) => ({ roleId, permission })),
        })
      }

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'UPDATE_ROLE',
          entityType: 'Role',
          entityId: roleId,
          before: { permissions: role.permissions.map((p) => p.permission) } as never,
          after: { name: input.name ?? role.name, permissions: input.permissions } as never,
        },
      })
    })

    // Everyone holding it is now allowed something different.
    await this.cache.invalidateRole(roleId)
    return this.list(user)
  }

  /** Deletes a custom role, once nobody holds it. */
  async remove(user: SessionUser, roleId: string): Promise<RoleSummary[]> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, companyId },
        include: { _count: { select: { assignments: true } } },
      })
      if (!role) throw new AppException(ApiErrorCode.NOT_FOUND)

      if (role.isSystem) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'roleId',
              message: 'This is a built-in role. You can change what it does, but not remove it.',
            },
          ],
        })
      }

      if (role._count.assignments > 0) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'roleId',
              message: `${role._count.assignments} ${role._count.assignments === 1 ? 'person holds' : 'people hold'} this role. Move them to another role first.`,
            },
          ],
        })
      }

      await tx.role.delete({ where: { id: roleId } })
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'DELETE_ROLE',
          entityType: 'Role',
          entityId: roleId,
          before: { name: role.name } as never,
        },
      })
    })

    return this.list(user)
  }

  /**
   * Gives someone a role, replacing whatever they had.
   *
   * One role per person keeps "what can they do?" answerable by looking at one
   * word. The data model allows several — `UserRoleAssignment` is a join table
   * — so stacking them later needs no migration, only a different screen.
   */
  async assign(user: SessionUser, targetUserId: string, roleId: string): Promise<void> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
      const [target, role] = await Promise.all([
        tx.user.findFirst({ where: { id: targetUserId, companyId, deletedAt: null } }),
        tx.role.findFirst({ where: { id: roleId, companyId } }),
      ])
      if (!target || !role) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.userRoleAssignment.deleteMany({ where: { userId: targetUserId } })
      await tx.userRoleAssignment.create({ data: { userId: targetUserId, roleId } })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'ASSIGN_ROLE',
          entityType: 'User',
          entityId: targetUserId,
          after: { roleKey: role.key, roleName: role.name } as never,
        },
      })
    })

    await this.cache.invalidateUser(targetUserId)
  }

  /**
   * A slug nothing else in this company holds.
   *
   * The key is what code would check against, so it stays stable even if the
   * display name is later changed.
   */
  private async uniqueKey(companyId: string, name: string): Promise<string> {
    const base =
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'CUSTOM_ROLE'

    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}_${suffix + 1}`
      const taken = await this.db.run((tx) =>
        tx.role.findFirst({ where: { companyId, key: candidate }, select: { id: true } }),
      )
      if (!taken) return candidate
    }
    throw new AppException(ApiErrorCode.CONFLICT)
  }
}

function requireCompany(user: SessionUser): string {
  if (!user.companyId) throw new AppException(ApiErrorCode.FORBIDDEN)
  return user.companyId
}
