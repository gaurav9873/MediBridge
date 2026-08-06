import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@medibridge/types'
import { Roles } from '../auth/auth.guard'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

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
  constructor(private readonly db: TenantPrismaService) {}

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

    // Platform-wide by design: these counts span every tenant. runAsPlatform
    // makes that a deliberate, logged decision rather than a silent bypass.
    return this.db.runAsPlatform('admin dashboard counts', async (tx) => {
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
        tx.user.count({
          where: { accountStatus: 'PENDING_VERIFICATION', deletedAt: null },
        }),
        tx.user.count({
          where: { role: 'RETAILER', accountStatus: 'ACTIVE', deletedAt: null },
        }),
        tx.user.count({
          where: { role: 'DISTRIBUTOR', accountStatus: 'ACTIVE', deletedAt: null },
        }),
        tx.medicine.count({ where: { isActive: true } }),
        tx.inventoryItem.count({ where: { isActive: true, deletedAt: null } }),
        tx.inventoryItem.count({
          where: { isActive: true, deletedAt: null, expiryDate: { lte: in90Days } },
        }),
        tx.order.count({ where: { createdAt: { gte: startOfToday } } }),
        tx.problemReport.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
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
    })
  }
}
