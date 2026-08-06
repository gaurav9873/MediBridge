import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@medibridge/types'
import { Roles } from '../auth/auth.guard'
import { PrismaService } from '../common/prisma/prisma.service'

export interface AdminOverview {
  pendingApprovals: number
  activeRetailers: number
  activeDistributors: number
  medicines: number
  inventoryBatches: number
  expiringSoon: number
  ordersToday: number
  openProblems: number
}

@ApiTags('Admin')
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Numbers for the admin home screen.
   *
   * Everything an admin might have to act on, counted in one round trip so the
   * dashboard renders in a single request rather than eight.
   */
  @Get('overview')
  @ApiOperation({ summary: 'Counts for the admin dashboard' })
  async overview(): Promise<AdminOverview> {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)

    const [
      pendingApprovals,
      activeRetailers,
      activeDistributors,
      medicines,
      inventoryBatches,
      expiringSoon,
      ordersToday,
      openProblems,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { accountStatus: 'PENDING_VERIFICATION', deletedAt: null },
      }),
      this.prisma.user.count({
        where: { role: 'RETAILER', accountStatus: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.user.count({
        where: { role: 'DISTRIBUTOR', accountStatus: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.medicine.count({ where: { isActive: true } }),
      this.prisma.inventoryItem.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.inventoryItem.count({
        where: { isActive: true, deletedAt: null, expiryDate: { lte: in90Days } },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.problemReport.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ])

    return {
      pendingApprovals,
      activeRetailers,
      activeDistributors,
      medicines,
      inventoryBatches,
      expiringSoon,
      ordersToday,
      openProblems,
    }
  }
}
