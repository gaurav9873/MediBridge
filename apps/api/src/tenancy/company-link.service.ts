import { Injectable } from '@nestjs/common'
import { TenantPrismaService } from './tenant-prisma.service'

/**
 * Who is allowed to sign in on whose portal.
 *
 * A tenant's own people, obviously. But also the sellers that trade through
 * it: once a distributor onboards it becomes a tenant of its own, and refusing
 * it the marketplace's sign-in page would mean the act of completing
 * onboarding locked the seller out of the only portal they know. A seller
 * signing in through the marketplace they sell on is the normal case, not an
 * exception — which is what `CompanyLink` already models.
 *
 * The link only decides which door they may come through. What they can then
 * see is still their own company's data, because the session's company is what
 * Row-Level Security scopes by.
 */
@Injectable()
export class CompanyLinkService {
  constructor(private readonly db: TenantPrismaService) {}

  /** True when `sellerId` trades through `marketplaceId`. */
  async isLinkedSeller(marketplaceId: string, sellerId: string): Promise<boolean> {
    const link = await this.db.runPreTenant((tx) =>
      tx.companyLink.findFirst({
        where: { marketplaceId, sellerId, isActive: true },
        select: { id: true },
      }),
    )
    return link != null
  }

  /**
   * True when someone from `userCompanyId` may use `portalCompanyId`'s portal.
   *
   * Used at sign-in and again on every request, so a link revoked mid-session
   * takes effect on the next call rather than whenever the token expires.
   */
  async mayUsePortal(portalCompanyId: string, userCompanyId: string): Promise<boolean> {
    if (portalCompanyId === userCompanyId) return true
    return this.isLinkedSeller(portalCompanyId, userCompanyId)
  }
}
