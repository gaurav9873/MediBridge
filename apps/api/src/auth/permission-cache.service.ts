import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from '../common/redis/redis.service'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

/**
 * What a user is allowed to do, resolved once instead of on every request.
 *
 * `PermissionGuard` runs on every protected route, and answering "may they?"
 * meant a two-level join — assignments to roles to permissions — before the
 * handler had done anything at all. That is a database round trip on the hot
 * path of every single request, to answer a question whose answer changes
 * perhaps twice a year.
 *
 * So it is cached, and the cache is invalidated at the three moments the answer
 * can actually change:
 *
 *   - a role is assigned to or removed from a user      -> that user
 *   - a role's permissions are edited                   -> everyone holding it
 *   - a role is deleted                                 -> everyone holding it
 *
 * Invalidation is by explicit call rather than a short TTL, so a permission
 * taken away takes effect on the next request rather than up to a minute
 * later. The TTL is a backstop for a missed invalidation, not the mechanism.
 */
@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name)

  /** Long, because invalidation is explicit. This only catches mistakes. */
  private static readonly TTL_SECONDS = 3600

  constructor(
    private readonly db: TenantPrismaService,
    private readonly redis: RedisService,
  ) {}

  async permissionsFor(userId: string): Promise<Set<string>> {
    const key = cacheKey(userId)

    const cached = await this.redis.getJson<string[]>(key)
    if (cached) return new Set(cached)

    const permissions = await this.load(userId)
    await this.redis.setJson(key, [...permissions], PermissionCacheService.TTL_SECONDS)
    return permissions
  }

  /** Forgets one user. Call after changing what roles they hold. */
  async invalidateUser(userId: string): Promise<void> {
    await this.redis.client.del(cacheKey(userId))
  }

  /**
   * Forgets everyone holding a role. Call after editing or deleting one.
   *
   * The holders are looked up rather than scanning Redis for keys: SCAN over a
   * production keyspace to find a handful of users is the kind of thing that
   * looks fine until the keyspace is large.
   */
  async invalidateRole(roleId: string): Promise<void> {
    const holders = await this.db.runPreTenant((tx) =>
      tx.userRoleAssignment.findMany({ where: { roleId }, select: { userId: true } }),
    )
    if (holders.length === 0) return

    await this.redis.client.del(...holders.map((holder) => cacheKey(holder.userId)))
    this.logger.log(`Permissions invalidated for ${holders.length} user(s) after a role change`)
  }

  /**
   * The uncached read.
   *
   * Joins roles, which is tenant-scoped, and permissions are resolved before
   * the request's own tenant work begins — hence runPreTenant.
   */
  private async load(userId: string): Promise<Set<string>> {
    const assignments = await this.db.runPreTenant((tx) =>
      tx.userRoleAssignment.findMany({
        where: { userId },
        select: { role: { select: { permissions: { select: { permission: true } } } } },
      }),
    )

    const granted = new Set<string>()
    for (const assignment of assignments) {
      for (const entry of assignment.role.permissions) granted.add(entry.permission)
    }
    return granted
  }
}

function cacheKey(userId: string): string {
  return `permissions:${userId}`
}
