import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  type SessionUser,
  type StockTransferInput,
  canTransfer,
  transferableQuantity,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

export interface StockTransferSummary {
  id: string
  medicineName: string
  brand: string
  batchNumber: string
  quantity: number
  fromWarehouseName: string
  toWarehouseName: string
  transferredBy: string
  note: string | null
  createdAt: string
}

/** What a warehouse is holding, for the per-warehouse view. */
export interface WarehouseStock {
  warehouseId: string
  warehouseName: string
  isAcceptingOrders: boolean
  batches: number
  units: number
  lowStock: number
  expiringSoon: number
  stockValuePaise: number
}

/**
 * Moving stock between a company's own warehouses.
 *
 * The whole operation is one transaction, because a transfer that half-happens
 * either invents stock or destroys it. Both sides move together or neither
 * does.
 *
 * Everything runs through `db.run()`, so Row-Level Security scopes it to the
 * signed-in company — which is also what stops a transfer INTO somebody else's
 * warehouse: their row is invisible, so the destination lookup simply finds
 * nothing.
 */
@Injectable()
export class StockTransferService {
  private readonly logger = new Logger(StockTransferService.name)

  constructor(private readonly db: TenantPrismaService) {}

  /**
   * Moves part of a batch to another warehouse.
   *
   * The destination either already holds this exact batch, in which case the
   * quantities merge, or it does not, in which case the batch is recreated
   * there carrying its identity — same medicine, batch number, expiry and MRP.
   * Those four are the physical goods and must not change in transit; the
   * selling price and the order/stock settings are copied as a sensible
   * starting point and can be edited afterwards.
   */
  async transfer(user: SessionUser, input: StockTransferInput): Promise<StockTransferSummary> {
    const companyId = user.companyId
    if (!companyId) throw new AppException(ApiErrorCode.FORBIDDEN)

    const transferId = await this.db.run(async (tx) => {
      const source = await tx.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, deletedAt: null },
        include: { medicine: { select: { name: true } } },
      })
      if (!source) throw new AppException(ApiErrorCode.NOT_FOUND)

      if (source.warehouseId === input.toWarehouseId) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'toWarehouseId',
              message: 'That is the warehouse this stock is already in. Choose a different one.',
            },
          ],
        })
      }

      // RLS makes another company's warehouse invisible, so "not found" and
      // "not yours" are the same answer here — as they should be.
      const destination = await tx.warehouse.findFirst({
        where: { id: input.toWarehouseId, deletedAt: null },
        select: { id: true, name: true },
      })
      if (!destination) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            { field: 'toWarehouseId', message: 'Choose one of your own warehouses to move it to.' },
          ],
        })
      }

      if (!canTransfer(source, input.quantity)) {
        const movable = transferableQuantity(source)
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'quantity',
              message:
                movable === 0
                  ? 'There is nothing free to move — every unit of this batch is in a retailer’s cart.'
                  : `Only ${movable} units of this batch are free to move. The rest are in retailers’ carts.`,
            },
          ],
        })
      }

      // Take it off the source first: if the destination write fails, the
      // transaction rolls both back, and this ordering keeps the intermediate
      // state short of stock rather than double-counting it.
      await tx.inventoryItem.update({
        where: { id: source.id },
        data: { quantity: { decrement: input.quantity } },
      })

      const existing = await tx.inventoryItem.findFirst({
        where: {
          warehouseId: destination.id,
          medicineId: source.medicineId,
          batchNumber: source.batchNumber,
          deletedAt: null,
        },
        select: { id: true },
      })

      if (existing) {
        await tx.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: input.quantity } },
        })
      } else {
        await tx.inventoryItem.create({
          data: {
            companyId,
            warehouseId: destination.id,
            medicineId: source.medicineId,
            // Identity travels with the goods, unchanged.
            batchNumber: source.batchNumber,
            expiryDate: source.expiryDate,
            mrpPaise: source.mrpPaise,
            // A starting point, editable at the destination.
            sellingPricePaise: source.sellingPricePaise,
            quantity: input.quantity,
            unit: source.unit,
            minOrderQuantity: source.minOrderQuantity,
            lowStockThreshold: source.lowStockThreshold,
            isActive: source.isActive,
          },
        })
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          companyId,
          fromWarehouseId: source.warehouseId,
          toWarehouseId: destination.id,
          medicineId: source.medicineId,
          batchNumber: source.batchNumber,
          quantity: input.quantity,
          note: input.note ?? null,
          transferredById: user.id,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'TRANSFER_STOCK',
          entityType: 'StockTransfer',
          entityId: transfer.id,
          after: {
            medicine: source.medicine.name,
            batchNumber: source.batchNumber,
            quantity: input.quantity,
            to: destination.name,
          } as never,
        },
      })

      return transfer.id
    })

    this.logger.log(`Stock transferred: ${input.quantity} units, transfer ${transferId}`)
    const [summary] = await this.history(1, transferId)
    return summary!
  }

  /** Recent transfers, newest first. */
  async history(limit = 50, onlyId?: string): Promise<StockTransferSummary[]> {
    const transfers = await this.db.run((tx) =>
      tx.stockTransfer.findMany({
        where: onlyId ? { id: onlyId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          medicine: { select: { name: true, brand: true } },
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
          transferredBy: { select: { fullName: true } },
        },
      }),
    )

    return transfers.map((transfer) => ({
      id: transfer.id,
      medicineName: transfer.medicine.name,
      brand: transfer.medicine.brand,
      batchNumber: transfer.batchNumber,
      quantity: transfer.quantity,
      fromWarehouseName: transfer.fromWarehouse.name,
      toWarehouseName: transfer.toWarehouse.name,
      transferredBy: transfer.transferredBy.fullName,
      note: transfer.note,
      createdAt: transfer.createdAt.toISOString(),
    }))
  }

  /**
   * What each warehouse is holding.
   *
   * The rollup is done in memory over a narrow projection rather than in SQL
   * because low stock compares two columns against a third, which no GROUP BY
   * expresses cleanly — and a distributor has warehouses in single figures, not
   * thousands.
   */
  async stockByWarehouse(): Promise<WarehouseStock[]> {
    const now = new Date()
    const warning = new Date(now)
    warning.setDate(warning.getDate() + 90)

    const [warehouses, items] = await this.db.run((tx) =>
      Promise.all([
        tx.warehouse.findMany({
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          select: { id: true, name: true, isAcceptingOrders: true },
        }),
        tx.inventoryItem.findMany({
          where: { deletedAt: null, isActive: true },
          select: {
            warehouseId: true,
            quantity: true,
            reservedQuantity: true,
            lowStockThreshold: true,
            sellingPricePaise: true,
            expiryDate: true,
          },
        }),
      ]),
    )

    const byWarehouse = new Map<string, WarehouseStock>()
    for (const warehouse of warehouses) {
      byWarehouse.set(warehouse.id, {
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        isAcceptingOrders: warehouse.isAcceptingOrders,
        batches: 0,
        units: 0,
        lowStock: 0,
        expiringSoon: 0,
        stockValuePaise: 0,
      })
    }

    for (const item of items) {
      const row = byWarehouse.get(item.warehouseId)
      if (!row) continue
      const available = Math.max(0, item.quantity - item.reservedQuantity)

      row.batches += 1
      row.units += available
      if (available > 0 && available <= item.lowStockThreshold) row.lowStock += 1
      if (item.expiryDate >= now && item.expiryDate <= warning) row.expiringSoon += 1
      if (item.expiryDate >= now) row.stockValuePaise += available * item.sellingPricePaise
    }

    return [...byWarehouse.values()]
  }
}
