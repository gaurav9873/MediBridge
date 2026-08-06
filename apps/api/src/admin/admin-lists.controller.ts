import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { type Paginated, UserRole } from '@medibridge/types'
import { z } from 'zod'
import { Roles } from '../auth/auth.guard'
import { PrismaService } from '../common/prisma/prisma.service'

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
  constructor(private readonly prisma: PrismaService) {}

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

    const [items, total] = await Promise.all([
      this.prisma.medicine.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { inventoryItems: true } } },
      }),
      this.prisma.medicine.count({ where }),
    ])

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

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          retailerProfile: true,
          distributorProfile: true,
          addresses: { where: { deletedAt: null }, take: 1, orderBy: { isDefault: 'desc' } },
        },
      }),
      this.prisma.user.count({ where }),
    ])

    return {
      items: items.map((user) => {
        const profile = user.retailerProfile ?? user.distributorProfile
        return {
          id: user.id,
          fullName: user.fullName,
          businessName: profile?.businessName ?? null,
          role: user.role,
          phone: user.phone,
          email: user.email,
          city: user.addresses[0]?.city ?? null,
          accountStatus: user.accountStatus,
          licenseExpiresOn: profile?.licenseExpiresOn?.toISOString().slice(0, 10) ?? null,
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

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          retailer: {
            select: { fullName: true, retailerProfile: { select: { businessName: true } } },
          },
          distributor: { select: { businessName: true } },
        },
      }),
      this.prisma.order.count(),
    ])

    return {
      items: items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        retailerName: order.retailer.retailerProfile?.businessName ?? order.retailer.fullName,
        distributorName: order.distributor.businessName,
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
    const settings = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } })
    return settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: setting.updatedAt.toISOString(),
    }))
  }
}
