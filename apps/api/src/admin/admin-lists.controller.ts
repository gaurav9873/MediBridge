import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { type Paginated, UserRole } from '@medibridge/types'
import { z } from 'zod'
import { Roles } from '../auth/auth.guard'
import { PRIMARY_CUSTOMER_PROFILE, primaryProfile } from '../common/customer-profile'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

/**
 * Read-only lists behind the admin menu.
 *
 * Deliberately thin: these back the browse screens so every menu item leads
 * somewhere real. The editing workflows for each module arrive with their own
 * phases; nothing here writes.
 */

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

const userListQuery = listQuery.extend({
  role: z.enum(UserRole).optional(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
})

export interface AdminMedicineRow {
  id: string
  name: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  schedule: string
  gstRate: number
  isActive: boolean
  distributorCount: number
}

export interface AdminUserRow {
  id: string
  fullName: string
  businessName: string | null
  role: string
  phone: string
  email: string
  city: string | null
  accountStatus: string
  licenseExpiresOn: string | null
  createdAt: string
}

export interface AdminOrderRow {
  id: string
  orderNumber: string
  retailerName: string
  distributorName: string
  status: string
  deliveryMode: string
  totalPaise: number
  balancePaise: number
  createdAt: string
}

export interface AdminSettingRow {
  key: string
  value: unknown
  description: string
  updatedAt: string
}

@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminListsController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get('medicines')
  @ApiOperation({ summary: 'Browse the shared medicine catalogue' })
  async medicines(@Query() rawQuery: Record<string, string>): Promise<Paginated<AdminMedicineRow>> {
    const query = listQuery.parse(rawQuery)

    // Substring match rather than the tsvector index: this is an admin browse
    // box where "cro" should match "Crocin", not a ranked retailer search.
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { brand: { contains: query.q, mode: 'insensitive' as const } },
            { composition: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}

    // Platform-wide by design; runAsPlatform makes the bypass explicit and logged.
    const [items, total] = await this.db.runAsPlatform('admin browse list', (tx) =>
      Promise.all([
        tx.medicine.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { _count: { select: { inventoryItems: true } } },
        }),
        tx.medicine.count({ where }),
      ]),
    )

    return {
      items: items.map((medicine) => ({
        id: medicine.id,
        name: medicine.name,
        brand: medicine.brand,
        composition: medicine.composition,
        form: medicine.form,
        strength: medicine.strength,
        packSize: medicine.packSize,
        schedule: medicine.schedule,
        gstRate: medicine.gstRate,
        isActive: medicine.isActive,
        distributorCount: medicine._count.inventoryItems,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  @Get('users')
  @ApiOperation({ summary: 'Browse retailers, distributors and staff' })
  async users(@Query() rawQuery: Record<string, string>): Promise<Paginated<AdminUserRow>> {
    const query = userListQuery.parse(rawQuery)

    const where = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { accountStatus: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    // Platform-wide by design; runAsPlatform makes the bypass explicit and logged.
    const [items, total] = await this.db.runAsPlatform('admin browse list', (tx) =>
      Promise.all([
        tx.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            customerProfiles: PRIMARY_CUSTOMER_PROFILE,
            companyRef: true,
            addresses: { where: { deletedAt: null }, take: 1, orderBy: { isDefault: 'desc' } },
          },
        }),
        tx.user.count({ where }),
      ]),
    )

    return {
      items: items.map((user) => {
        // Buyers trade under a Customer name; a seller's staff under the
        // selling company's own name.
        const profile = primaryProfile(user.customerProfiles)
        return {
          id: user.id,
          fullName: user.fullName,
          businessName: profile?.businessName ?? user.companyRef?.name ?? null,
          role: user.role,
          phone: user.phone,
          email: user.email,
          city: user.addresses[0]?.city ?? null,
          accountStatus: user.accountStatus,
          licenseExpiresOn:
            (profile?.licenseExpiresOn ?? user.companyRef?.licenseExpiresOn)
              ?.toISOString()
              .slice(0, 10) ?? null,
          createdAt: user.createdAt.toISOString(),
        }
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  @Get('orders')
  @ApiOperation({ summary: 'Browse every order on the platform' })
  async orders(@Query() rawQuery: Record<string, string>): Promise<Paginated<AdminOrderRow>> {
    const query = listQuery.parse(rawQuery)

    // Platform-wide by design; runAsPlatform makes the bypass explicit and logged.
    const [items, total] = await this.db.runAsPlatform('admin browse list', (tx) =>
      Promise.all([
        tx.order.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            retailer: { select: { fullName: true } },
            // The order names the relationship it was placed under, so the
            // trading name comes from there rather than being looked up from
            // the buyer — which now has one per distributor.
            customer: { select: { businessName: true } },
            // The seller is the company; the warehouse only says where from.
            warehouse: { select: { name: true, company: { select: { name: true } } } },
          },
        }),
        tx.order.count(),
      ]),
    )

    return {
      items: items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        retailerName: order.customer.businessName ?? order.retailer.fullName,
        distributorName: order.warehouse.company.name,
        status: order.status,
        deliveryMode: order.deliveryMode,
        totalPaise: order.totalPaise,
        balancePaise: order.balancePaise,
        createdAt: order.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  @Get('settings')
  @ApiOperation({ summary: 'Platform rules currently in force' })
  async settings(): Promise<AdminSettingRow[]> {
    const settings = await this.db.runAsPlatform('platform settings', (tx) =>
      tx.setting.findMany({ orderBy: { key: 'asc' } }),
    )
    return settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: setting.updatedAt.toISOString(),
    }))
  }
}
