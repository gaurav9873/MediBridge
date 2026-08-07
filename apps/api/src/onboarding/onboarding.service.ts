import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  type SessionUser,
  type SignUpBusinessInput,
  UserRole,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

/** Where someone is in the journey from account to trading business. */
export interface OnboardingStatus {
  /** What the wizard should show next. */
  step: 'BUSINESS' | 'DOCUMENTS' | 'AWAITING_REVIEW' | 'REJECTED' | 'DONE'
  businessName: string | null
  gstNumber: string | null
  hasLicenceDocument: boolean
  hasGstDocument: boolean
  /** Set when an admin rejected something, in words the applicant can act on. */
  rejectionReason: string | null
  canPlaceOrders: boolean
}

/**
 * Turning a person into a business.
 *
 * Sign-up (Phase 2.1) produced someone who can sign in. This produces the
 * record they trade as — and the two are deliberately separate, because
 * confirming a mobile number and verifying a drug licence answer completely
 * different questions and take completely different amounts of time.
 *
 * What gets created depends on which side of the market they are on, and this
 * is the only place that difference exists:
 *
 *   a retailer     ->  a Customer of the marketplace they signed up on
 *   a distributor  ->  a Company of its own, a Warehouse, and a CompanyLink
 *
 * A seller is a tenant in its own right — its stock, staff and payouts are its
 * own, and Row-Level Security keeps one seller out of another's data. So
 * onboarding a distributor moves their user account to the company it creates.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name)

  constructor(private readonly db: TenantPrismaService) {}

  async status(user: SessionUser): Promise<OnboardingStatus> {
    const [customer, company, documents] = await this.db.runPreTenant((tx) =>
      Promise.all([
        tx.customer.findUnique({
          where: { userId: user.id },
          select: { businessName: true, gstNumber: true },
        }),
        user.companyId
          ? tx.company.findUnique({
              where: { id: user.companyId },
              select: { name: true, gstNumber: true, businessMode: true },
            })
          : Promise.resolve(null),
        tx.document.findMany({
          where: { userId: user.id },
          select: { type: true, verificationStatus: true, rejectionReason: true },
        }),
      ]),
    )

    // A distributor trades as its company; a retailer as its customer record.
    // A distributor who has not onboarded yet still belongs to the marketplace
    // company, which is not their business — hence the seller check.
    const isSeller = user.role === UserRole.DISTRIBUTOR && company?.gstNumber != null
    const business = customer ?? (isSeller ? { businessName: company.name, gstNumber: company.gstNumber } : null)

    const hasLicence = documents.some((doc) => doc.type === 'DRUG_LICENSE')
    const hasGst = documents.some((doc) => doc.type === 'GST_CERTIFICATE')
    const rejected = documents.find((doc) => doc.verificationStatus === 'REJECTED')

    return {
      step: this.stepFor(user, business != null, hasLicence && hasGst, rejected != null),
      businessName: business?.businessName ?? null,
      gstNumber: business?.gstNumber ?? null,
      hasLicenceDocument: hasLicence,
      hasGstDocument: hasGst,
      rejectionReason: rejected?.rejectionReason ?? null,
      canPlaceOrders: user.canPlaceOrders,
    }
  }

  private stepFor(
    user: SessionUser,
    hasBusiness: boolean,
    hasBothDocuments: boolean,
    wasRejected: boolean,
  ): OnboardingStatus['step'] {
    if (user.accountStatus === 'ACTIVE') return 'DONE'
    if (wasRejected) return 'REJECTED'
    if (!hasBusiness) return 'BUSINESS'
    if (!hasBothDocuments) return 'DOCUMENTS'
    return 'AWAITING_REVIEW'
  }

  /**
   * Records the business, and the address everything is measured from.
   *
   * The address is not a formality: its latitude and longitude are one half of
   * every Same-Day radius check. A retailer's shop decides which distributors
   * can reach them; a distributor's warehouse decides who they can reach.
   */
  async submitBusiness(
    user: SessionUser,
    input: SignUpBusinessInput,
  ): Promise<OnboardingStatus> {
    if (user.role === UserRole.ADMIN) throw new AppException(ApiErrorCode.FORBIDDEN)

    await this.assertGstFree(input.gstNumber, user.id)

    if (user.role === UserRole.RETAILER) {
      await this.onboardRetailer(user, input)
    } else {
      await this.onboardDistributor(user, input)
    }

    // The session is stale now — a distributor has moved company — so the
    // caller re-reads rather than trusting what it was handed.
    const fresh = await this.reloadSessionUser(user.id)
    return this.status(fresh)
  }

  private async onboardRetailer(user: SessionUser, input: SignUpBusinessInput): Promise<void> {
    const companyId = user.companyId
    if (!companyId) throw new AppException(ApiErrorCode.FORBIDDEN)

    await this.db.runPreTenant(async (tx) => {
      const address = await tx.address.create({
        data: {
          companyId,
          userId: user.id,
          label: input.address.label,
          line1: input.address.line1,
          line2: input.address.line2,
          city: input.address.city,
          state: input.address.state,
          pincode: input.address.pincode,
          contactPhone: input.address.contactPhone,
          latitude: input.address.location.latitude,
          longitude: input.address.location.longitude,
          isDefault: true,
        },
      })

      await tx.customer.upsert({
        where: { userId: user.id },
        create: {
          companyId,
          userId: user.id,
          businessName: input.businessName,
          gstNumber: input.gstNumber,
        },
        update: { businessName: input.businessName, gstNumber: input.gstNumber },
      })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'SUBMIT_BUSINESS_DETAILS',
          entityType: 'Customer',
          entityId: user.id,
          after: { businessName: input.businessName, gstNumber: input.gstNumber, addressId: address.id },
        },
      })
    })
  }

  /**
   * A distributor becomes its own tenant.
   *
   * Everything the account already owns has to move with it, or Row-Level
   * Security will hide the seller's own data from them the moment they sign in
   * again. That is the same trap Step 4's migration had to avoid.
   */
  private async onboardDistributor(user: SessionUser, input: SignUpBusinessInput): Promise<void> {
    const marketplaceId = user.companyId
    if (!marketplaceId) throw new AppException(ApiErrorCode.FORBIDDEN)

    await this.db.runPreTenant(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.businessName,
          slug: await uniqueSlug(tx, input.businessName),
          status: 'TRIAL',
          businessMode: 'MARKETPLACE',
          paymentTermType: 'TOKEN_PLUS_COD',
          tokenPercent: 20,
          gstNumber: input.gstNumber,
        },
      })

      // Same seven fixed roles every company gets, copied from the marketplace
      // so the shapes cannot drift apart.
      const templates = await tx.role.findMany({
        where: { companyId: marketplaceId, isSystem: true },
        include: { permissions: true },
      })
      for (const template of templates) {
        const role = await tx.role.create({
          data: { companyId: company.id, key: template.key, name: template.name, isSystem: true },
        })
        await tx.rolePermission.createMany({
          data: template.permissions.map((permission) => ({
            roleId: role.id,
            permission: permission.permission,
          })),
        })
      }

      await tx.companyLink.create({
        data: { marketplaceId, sellerId: company.id, isActive: true },
      })

      // The person who onboarded the seller runs it. Without this they own a
      // company they hold no permission in, and cannot add their own staff.
      const owner = await tx.role.findFirst({
        where: { companyId: company.id, key: 'COMPANY_ADMIN' },
        select: { id: true },
      })
      if (owner) {
        // Their marketplace-scoped assignments no longer apply — that company
        // is not theirs any more.
        await tx.userRoleAssignment.deleteMany({ where: { userId: user.id } })
        await tx.userRoleAssignment.create({ data: { userId: user.id, roleId: owner.id } })
      }

      const address = await tx.address.create({
        data: {
          companyId: company.id,
          userId: user.id,
          label: input.address.label,
          line1: input.address.line1,
          line2: input.address.line2,
          city: input.address.city,
          state: input.address.state,
          pincode: input.address.pincode,
          contactPhone: input.address.contactPhone,
          latitude: input.address.location.latitude,
          longitude: input.address.location.longitude,
          isDefault: true,
        },
      })

      await tx.warehouse.create({
        data: {
          companyId: company.id,
          name: `${input.businessName} Warehouse`,
          addressId: address.id,
          isDefault: true,
        },
      })

      // The user, and everything of theirs, follows the company.
      await tx.user.update({ where: { id: user.id }, data: { companyId: company.id } })
      await tx.document.updateMany({ where: { userId: user.id }, data: { companyId: company.id } })

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: user.id,
          action: 'ONBOARD_SELLER',
          entityType: 'Company',
          entityId: company.id,
          after: { name: input.businessName, gstNumber: input.gstNumber, marketplaceId },
        },
      })
    })

    this.logger.log(`Seller onboarded: ${input.businessName}`)
  }

  /**
   * Refuses a GST number already claimed by someone else.
   *
   * One business, one GST number. Two accounts sharing one would make the
   * licence check meaningless — approve one, and the other trades on it.
   */
  private async assertGstFree(gstNumber: string, userId: string): Promise<void> {
    const [customer, company] = await this.db.runPreTenant((tx) =>
      Promise.all([
        tx.customer.findFirst({
          where: { gstNumber, userId: { not: userId }, deletedAt: null },
          select: { id: true },
        }),
        tx.company.findFirst({ where: { gstNumber, deletedAt: null }, select: { id: true } }),
      ]),
    )
    if (customer || company) throw new AppException(ApiErrorCode.GST_ALREADY_REGISTERED)
  }

  private async reloadSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.db.runPreTenant((tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          companyId: true,
          fullName: true,
          phone: true,
          email: true,
          role: true,
          accountStatus: true,
        },
      }),
    )
    if (!user) throw new AppException(ApiErrorCode.NOT_FOUND)
    return {
      ...user,
      role: user.role as UserRole,
      businessName: null,
      canPlaceOrders: false,
      licenseExpiresOn: null,
    }
  }
}

/**
 * A URL-safe slug that no other company holds.
 *
 * The slug becomes a subdomain, so a collision would send one tenant's traffic
 * to another. Two pharmacies called "Sharma Medical" is not unusual.
 */
async function uniqueSlug(tx: { company: { findUnique: (args: never) => Promise<unknown> } }, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'company'

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const taken = await tx.company.findUnique({
      where: { slug: candidate },
      select: { id: true },
    } as never)
    if (!taken) return candidate
  }
  throw new AppException(ApiErrorCode.CONFLICT)
}
