import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  type CompanyBankInput,
  type CompanyBrandingInput,
  type CompanyProfileInput,
  type CompanyTermsInput,
  type SessionUser,
  type WarehouseInput,
  type WarehouseUpdateInput,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

export interface CompanySettings {
  id: string
  name: string
  slug: string
  status: string
  businessMode: string
  gstNumber: string | null
  drugLicenseNumber: string | null
  licenseExpiresOn: string | null
  supportEmail: string | null
  supportPhone: string | null
  logoUrl: string | null
  loginImageUrl: string | null
  brandColor: string | null
  paymentTermType: string
  tokenPercent: number
  creditDays: number
  bankAccountHolder: string | null
  /** Masked: only the last four digits, so a screenshot is not a payout risk. */
  bankAccountNumberMasked: string | null
  bankIfsc: string | null
}

export interface WarehouseSummary {
  id: string
  name: string
  isDefault: boolean
  isAcceptingOrders: boolean
  sameDayRadiusKm: number
  sameDayCutoffTime: string
  deliveryChargePaise: number
  freeDeliveryAbovePaise: number | null
  city: string
  state: string
  pincode: string
  line1: string
  latitude: number
  longitude: number
  /** Live batches shipping from here. Shown before anyone deletes it. */
  stockItems: number
}

/**
 * A company looking after itself.
 *
 * Everything here is configuration rather than a platform rule, which is the
 * whole reason one codebase serves a marketplace and a private distributor:
 * payment terms, delivery radius, cut-off time and branding are rows, not
 * branches.
 *
 * The company is always the one on the session. There is no companyId
 * parameter anywhere in this file — that is what stops a crafted request
 * editing somebody else's business.
 */
@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name)

  constructor(private readonly db: TenantPrismaService) {}

  async settings(user: SessionUser): Promise<CompanySettings> {
    const company = await this.db.run((tx) =>
      tx.company.findUnique({ where: { id: requireCompany(user) } }),
    )
    if (!company) throw new AppException(ApiErrorCode.NOT_FOUND)

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
      businessMode: company.businessMode,
      gstNumber: company.gstNumber,
      drugLicenseNumber: company.drugLicenseNumber,
      licenseExpiresOn: company.licenseExpiresOn?.toISOString().slice(0, 10) ?? null,
      supportEmail: company.supportEmail,
      supportPhone: company.supportPhone,
      logoUrl: company.logoUrl,
      loginImageUrl: company.loginImageUrl,
      brandColor: company.brandColor,
      paymentTermType: company.paymentTermType,
      tokenPercent: company.tokenPercent,
      creditDays: company.creditDays,
      bankAccountHolder: company.bankAccountHolder,
      bankAccountNumberMasked: mask(company.bankAccountNumber),
      bankIfsc: company.bankIfsc,
    }
  }

  async updateProfile(user: SessionUser, input: CompanyProfileInput): Promise<CompanySettings> {
    return this.applyUpdate(user, 'UPDATE_COMPANY_PROFILE', {
      name: input.name,
      supportEmail: blankToNull(input.supportEmail),
      supportPhone: blankToNull(input.supportPhone),
    })
  }

  async updateBank(user: SessionUser, input: CompanyBankInput): Promise<CompanySettings> {
    return this.applyUpdate(user, 'UPDATE_COMPANY_BANK', {
      bankAccountHolder: blankToNull(input.bankAccountHolder),
      bankAccountNumber: blankToNull(input.bankAccountNumber),
      bankIfsc: blankToNull(input.bankIfsc),
    })
  }

  /**
   * Payment terms.
   *
   * Changing these does not touch orders already placed — those carry their own
   * `tokenPercent` snapshot, so a company raising its token from 20% to 30%
   * cannot retroactively ask a retailer for more money.
   */
  async updateTerms(user: SessionUser, input: CompanyTermsInput): Promise<CompanySettings> {
    return this.applyUpdate(user, 'UPDATE_COMPANY_TERMS', {
      paymentTermType: input.paymentTermType,
      tokenPercent: input.tokenPercent,
      creditDays: input.creditDays,
    })
  }

  async updateBranding(user: SessionUser, input: CompanyBrandingInput): Promise<CompanySettings> {
    return this.applyUpdate(user, 'UPDATE_COMPANY_BRANDING', {
      logoUrl: blankToNull(input.logoUrl),
      loginImageUrl: blankToNull(input.loginImageUrl),
      brandColor: blankToNull(input.brandColor),
    })
  }

  /**
   * One write path for all four screens.
   *
   * Each records what changed, and what it changed from. An audit entry that
   * only says "settings updated" is no use the day someone asks why the token
   * percentage is different.
   */
  private async applyUpdate(
    user: SessionUser,
    action: string,
    data: Record<string, unknown>,
  ): Promise<CompanySettings> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
      const before = await tx.company.findUnique({ where: { id: companyId } })
      if (!before) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.company.update({ where: { id: companyId }, data })
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action,
          entityType: 'Company',
          entityId: companyId,
          // Cast: Prisma's Json input type does not accept a plain record,
          // and these are only ever serialisable primitives.
          before: pick(before, Object.keys(data)) as never,
          after: redact(data) as never,
        },
      })
    })

    return this.settings(user)
  }

  // ---------------------------------------------------------------------------
  // Warehouses
  // ---------------------------------------------------------------------------

  async listWarehouses(user: SessionUser): Promise<WarehouseSummary[]> {
    const warehouses = await this.db.run((tx) =>
      tx.warehouse.findMany({
        where: { companyId: requireCompany(user), deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: {
          address: true,
          _count: { select: { inventoryItems: { where: { deletedAt: null, isActive: true } } } },
        },
      }),
    )

    return warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      isDefault: warehouse.isDefault,
      isAcceptingOrders: warehouse.isAcceptingOrders,
      sameDayRadiusKm: warehouse.sameDayRadiusKm,
      sameDayCutoffTime: warehouse.sameDayCutoffTime,
      deliveryChargePaise: warehouse.deliveryChargePaise,
      freeDeliveryAbovePaise: warehouse.freeDeliveryAbovePaise,
      city: warehouse.address.city,
      state: warehouse.address.state,
      pincode: warehouse.address.pincode,
      line1: warehouse.address.line1,
      latitude: warehouse.address.latitude,
      longitude: warehouse.address.longitude,
      stockItems: warehouse._count.inventoryItems,
    }))
  }

  async createWarehouse(user: SessionUser, input: WarehouseInput): Promise<WarehouseSummary[]> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
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
        },
      })

      // The first warehouse is the default, so a company with exactly one never
      // has to think about the concept at all.
      const existing = await tx.warehouse.count({ where: { companyId, deletedAt: null } })

      const warehouse = await tx.warehouse.create({
        data: {
          companyId,
          name: input.name,
          addressId: address.id,
          sameDayRadiusKm: input.sameDayRadiusKm,
          sameDayCutoffTime: input.sameDayCutoffTime,
          deliveryChargePaise: toPaise(input.deliveryChargeRupees),
          freeDeliveryAbovePaise:
            input.freeDeliveryAboveRupees != null ? toPaise(input.freeDeliveryAboveRupees) : null,
          isAcceptingOrders: input.isAcceptingOrders,
          isDefault: existing === 0,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'CREATE_WAREHOUSE',
          entityType: 'Warehouse',
          entityId: warehouse.id,
          after: { name: input.name, city: input.address.city, radiusKm: input.sameDayRadiusKm },
        },
      })
    })

    return this.listWarehouses(user)
  }

  async updateWarehouse(
    user: SessionUser,
    warehouseId: string,
    input: WarehouseUpdateInput,
  ): Promise<WarehouseSummary[]> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
      // Scoped by RLS as well as this filter, so a guessed id reaches nothing.
      const before = await tx.warehouse.findFirst({
        where: { id: warehouseId, companyId, deletedAt: null },
      })
      if (!before) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.warehouse.update({
        where: { id: warehouseId },
        data: {
          name: input.name,
          sameDayRadiusKm: input.sameDayRadiusKm,
          sameDayCutoffTime: input.sameDayCutoffTime,
          deliveryChargePaise: toPaise(input.deliveryChargeRupees),
          freeDeliveryAbovePaise:
            input.freeDeliveryAboveRupees != null ? toPaise(input.freeDeliveryAboveRupees) : null,
          isAcceptingOrders: input.isAcceptingOrders,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'UPDATE_WAREHOUSE',
          entityType: 'Warehouse',
          entityId: warehouseId,
          before: {
            name: before.name,
            radiusKm: before.sameDayRadiusKm,
            cutoff: before.sameDayCutoffTime,
            accepting: before.isAcceptingOrders,
          },
          after: {
            name: input.name,
            radiusKm: input.sameDayRadiusKm,
            cutoff: input.sameDayCutoffTime,
            accepting: input.isAcceptingOrders,
          },
        },
      })
    })

    return this.listWarehouses(user)
  }

  /**
   * Closes a warehouse.
   *
   * Refused while stock still ships from it — the stock would become
   * unreachable rather than moving somewhere, and an order already placed
   * against it has to stay fulfillable. Turning off "accepting orders" is the
   * reversible version, and the message says so.
   */
  async deleteWarehouse(user: SessionUser, warehouseId: string): Promise<WarehouseSummary[]> {
    const companyId = requireCompany(user)

    await this.db.run(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: warehouseId, companyId, deletedAt: null },
        include: {
          _count: { select: { inventoryItems: { where: { deletedAt: null } } } },
        },
      })
      if (!warehouse) throw new AppException(ApiErrorCode.NOT_FOUND)

      if (warehouse._count.inventoryItems > 0) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'warehouseId',
              message:
                'This warehouse still holds stock. Move or remove the stock first, or switch off "accepting orders" to pause it instead.',
            },
          ],
        })
      }

      const remaining = await tx.warehouse.count({
        where: { companyId, deletedAt: null, id: { not: warehouseId } },
      })
      if (remaining === 0) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'warehouseId',
              message: 'This is your only warehouse. Add another one before closing this.',
            },
          ],
        })
      }

      await tx.warehouse.update({ where: { id: warehouseId }, data: { deletedAt: new Date() } })

      // Something has to be the default, or imports have nowhere to land.
      if (warehouse.isDefault) {
        const next = await tx.warehouse.findFirst({
          where: { companyId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        })
        if (next) await tx.warehouse.update({ where: { id: next.id }, data: { isDefault: true } })
      }

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'CLOSE_WAREHOUSE',
          entityType: 'Warehouse',
          entityId: warehouseId,
          before: { name: warehouse.name },
        },
      })
    })

    return this.listWarehouses(user)
  }
}

function requireCompany(user: SessionUser): string {
  if (!user.companyId) throw new AppException(ApiErrorCode.FORBIDDEN)
  return user.companyId
}

/** Rupees from a form to the integer paise everything downstream expects. */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function mask(accountNumber: string | null): string | null {
  if (!accountNumber) return null
  return `${'•'.repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key]]))
}

/** An audit trail should never become the second place a bank number leaks. */
function redact(data: Record<string, unknown>): Record<string, unknown> {
  if (!('bankAccountNumber' in data)) return data
  return { ...data, bankAccountNumber: mask(String(data.bankAccountNumber ?? '')) }
}
