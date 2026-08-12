import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  type DrugSchedule,
  EXPIRY_WARNING_DAYS,
  type ExpiryStatus,
  type InventoryItemInput,
  type InventoryItemUpdateInput,
  type InventoryListQuery,
  type Paginated,
  type SessionUser,
  type StockLevel,
  availableQuantity,
  canSetQuantityTo,
  daysUntilExpiry,
  expiryStatus,
  isSellable,
  sellableQuantity,
  sellableStockLevel,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService, type TenantTx } from '../tenancy/tenant-prisma.service'

export interface InventoryItemSummary {
  id: string
  medicineId: string
  medicineName: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  schedule: string
  isPrescriptionRequired: boolean

  warehouseId: string
  warehouseName: string

  batchNumber: string
  expiryDate: string
  daysUntilExpiry: number
  expiryStatus: ExpiryStatus

  mrpPaise: number
  sellingPricePaise: number
  /** How far below MRP this is, for the margin the retailer sees. */
  discountPercent: number

  quantity: number
  reservedQuantity: number
  availableQuantity: number
  unit: string
  minOrderQuantity: number
  lowStockThreshold: number
  stockLevel: StockLevel

  isActive: boolean
  /** False when expired, inactive or empty — the honest "can anyone buy it?". */
  isSellable: boolean

  createdAt: string
  updatedAt: string
}

export interface InventorySummary {
  totalBatches: number
  lowStock: number
  outOfStock: number
  expiringSoon: number
  expired: number
  /** Value of sellable stock at your own price, in paise. */
  stockValuePaise: number
}

/**
 * A distributor's own stock, batch by batch.
 *
 * Everything here goes through `db.run()`, so Row-Level Security scopes every
 * query to the signed-in company. There is no `companyId` parameter anywhere
 * in this service on purpose: a tenant id that arrives from a caller is a
 * tenant id that can be wrong, and the one place it is allowed to come from is
 * the session.
 *
 * Stock is held per BATCH rather than per medicine, because a batch number and
 * an expiry date are on every unit sold by law, and two batches of the same
 * medicine are genuinely two things with different prices and different lives.
 *
 * The search read model (`medicine_offers`) is maintained by a database
 * trigger on this table, so nothing here writes it. That is deliberate — a
 * projection kept up to date in application code is a projection that drifts
 * the first time somebody writes a row from a script.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name)

  constructor(private readonly db: TenantPrismaService) {}

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async list(query: InventoryListQuery): Promise<Paginated<InventoryItemSummary>> {
    const where = this.buildWhere(query)

    const [items, total] = await this.db.run((tx) =>
      Promise.all([
        tx.inventoryItem.findMany({
          where,
          orderBy: this.buildOrder(query.sortBy),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { medicine: true, warehouse: { select: { name: true } } },
        }),
        tx.inventoryItem.count({ where }),
      ]),
    )

    return {
      items: items.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async get(itemId: string): Promise<InventoryItemSummary> {
    const item = await this.db.run((tx) =>
      tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
        include: { medicine: true, warehouse: { select: { name: true } } },
      }),
    )
    if (!item) throw new AppException(ApiErrorCode.NOT_FOUND)
    return toSummary(item)
  }

  /**
   * The numbers a distributor opens the day with.
   *
   * Counted in the database rather than by paging the whole table: a
   * distributor with 20,000 batches would otherwise pay for a full scan to
   * render four tiles.
   */
  async summary(): Promise<InventorySummary> {
    const now = new Date()
    const warningDate = new Date(now)
    warningDate.setDate(warningDate.getDate() + EXPIRY_WARNING_DAYS)

    const live = { deletedAt: null, isActive: true }

    const [totalBatches, expiringSoon, expired, rows] = await this.db.run((tx) =>
      Promise.all([
        tx.inventoryItem.count({ where: { deletedAt: null } }),
        tx.inventoryItem.count({
          where: { ...live, expiryDate: { gte: now, lte: warningDate } },
        }),
        tx.inventoryItem.count({ where: { ...live, expiryDate: { lt: now } } }),
        // Low and out-of-stock compare two columns against a third, which no
        // simple `where` expresses. The projection is narrow on purpose.
        tx.inventoryItem.findMany({
          where: live,
          select: {
            quantity: true,
            reservedQuantity: true,
            lowStockThreshold: true,
            sellingPricePaise: true,
            expiryDate: true,
          },
        }),
      ]),
    )

    let lowStock = 0
    let outOfStock = 0
    let stockValuePaise = 0

    for (const row of rows) {
      /*
       * An expired batch is reported as expired and nothing else.
       *
       * It has zero sellable units, so it would otherwise land in the
       * out-of-stock tile as well and be counted twice under two headings that
       * call for different actions — reorder it, versus get it off the shelf.
       */
      const expired = row.expiryDate < now
      if (expired) continue

      const level = sellableStockLevel(row, expired)
      if (level === 'lowStock') lowStock += 1
      if (level === 'outOfStock') outOfStock += 1
      stockValuePaise += sellableQuantity(row, expired) * row.sellingPricePaise
    }

    return { totalBatches, lowStock, outOfStock, expiringSoon, expired, stockValuePaise }
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Lists a batch.
   *
   * Three things are checked that the schema cannot: that the warehouse is
   * this company's, that the medicine may legally be sold at all, and that
   * this batch is not already listed. The unique constraint would catch the
   * last one, but as a database error nobody can read.
   */
  async create(user: SessionUser, input: InventoryItemInput): Promise<InventoryItemSummary> {
    const companyId = user.companyId
    if (!companyId) throw new AppException(ApiErrorCode.FORBIDDEN)

    const created = await this.db.run(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: input.warehouseId, deletedAt: null },
        select: { id: true },
      })
      // RLS already makes another company's warehouse invisible, so a missing
      // row here means "not yours" as much as "not real". Both are NOT_FOUND:
      // telling a caller which of the two it was is telling them a warehouse
      // exists somewhere else.
      if (!warehouse) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            { field: 'warehouseId', message: 'Choose one of your own warehouses for this stock.' },
          ],
        })
      }

      await this.assertStockable(tx, input.medicineId)

      const clash = await tx.inventoryItem.findFirst({
        where: {
          warehouseId: input.warehouseId,
          medicineId: input.medicineId,
          batchNumber: input.batchNumber,
          deletedAt: null,
        },
        select: { id: true },
      })
      if (clash) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'batchNumber',
              message:
                'That batch is already listed at this warehouse. Edit the existing one instead of adding it twice.',
            },
          ],
        })
      }

      const item = await tx.inventoryItem.create({
        data: {
          companyId,
          warehouseId: input.warehouseId,
          medicineId: input.medicineId,
          batchNumber: input.batchNumber,
          expiryDate: input.expiryDate,
          mrpPaise: input.mrpPaise,
          sellingPricePaise: input.sellingPricePaise,
          quantity: input.quantity,
          unit: input.unit,
          minOrderQuantity: input.minOrderQuantity,
          lowStockThreshold: input.lowStockThreshold,
          isActive: input.isActive,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'CREATE_INVENTORY_ITEM',
          entityType: 'InventoryItem',
          entityId: item.id,
          after: {
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            sellingPricePaise: item.sellingPricePaise,
          } as never,
        },
      })

      return item
    })

    this.logger.log(`Batch listed: ${created.batchNumber}`)
    return this.get(created.id)
  }

  /**
   * Edits the things that change daily: price, stock, availability.
   *
   * Batch number, expiry and medicine are NOT editable. They identify the
   * physical goods, and a batch whose number can be edited is a batch whose
   * recall notice reaches the wrong shelf. Getting one wrong means removing it
   * and listing the right one.
   */
  async update(
    user: SessionUser,
    itemId: string,
    input: InventoryItemUpdateInput,
  ): Promise<InventoryItemSummary> {
    await this.db.run(async (tx) => {
      const before = await tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
      })
      if (!before) throw new AppException(ApiErrorCode.NOT_FOUND)

      const mrpPaise = before.mrpPaise
      const nextPrice = input.sellingPricePaise ?? before.sellingPricePaise

      // The database has a CHECK for this too. Catching it here is what turns
      // it into a sentence under the price box instead of a 500.
      if (nextPrice > mrpPaise) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'sellingPricePaise',
              message: 'Your price cannot be more than the MRP printed on the pack.',
            },
          ],
        })
      }

      if (input.quantity !== undefined && !canSetQuantityTo(before, input.quantity)) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'quantity',
              message: `${before.reservedQuantity} units are in retailers' carts right now, so the count cannot go below that yet. Try again once those orders are placed or expire.`,
            },
          ],
        })
      }

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          sellingPricePaise: input.sellingPricePaise,
          quantity: input.quantity,
          minOrderQuantity: input.minOrderQuantity,
          lowStockThreshold: input.lowStockThreshold,
          isActive: input.isActive,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId: before.companyId,
          actorId: user.id,
          action: 'UPDATE_INVENTORY_ITEM',
          entityType: 'InventoryItem',
          entityId: itemId,
          before: {
            quantity: before.quantity,
            sellingPricePaise: before.sellingPricePaise,
            isActive: before.isActive,
          } as never,
          after: {
            quantity: input.quantity ?? before.quantity,
            sellingPricePaise: nextPrice,
            isActive: input.isActive ?? before.isActive,
          } as never,
        },
      })
    })

    return this.get(itemId)
  }

  /**
   * Takes a batch off the list.
   *
   * Soft delete, never a real one: order lines reference the batch they were
   * picked from, and an invoice that cannot resolve its own line items is
   * worse than a tidy stock list. Reserved units block it for the same reason
   * a quantity cannot drop below them — somebody is mid-checkout.
   */
  async remove(user: SessionUser, itemId: string): Promise<{ removed: true }> {
    await this.db.run(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, deletedAt: null },
      })
      if (!item) throw new AppException(ApiErrorCode.NOT_FOUND)

      if (item.reservedQuantity > 0) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'id',
              message: `${item.reservedQuantity} units of this batch are in retailers' carts. Wait for those orders to be placed or to expire, then remove it.`,
            },
          ],
        })
      }

      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { deletedAt: new Date(), isActive: false },
      })

      await tx.auditLog.create({
        data: {
          companyId: item.companyId,
          actorId: user.id,
          action: 'DELETE_INVENTORY_ITEM',
          entityType: 'InventoryItem',
          entityId: itemId,
          before: { batchNumber: item.batchNumber, quantity: item.quantity } as never,
        },
      })
    })

    return { removed: true }
  }

  // ---------------------------------------------------------------------------

  /**
   * Whether this medicine may be stocked at all.
   *
   * Two gates, both the medicine domain's rules rather than this service's: it
   * has to exist and still be listed, and its schedule has to be sellable. A
   * Schedule X batch must never reach the shelf, and the catalogue archiving a
   * medicine is the platform saying "stop selling this".
   */
  private async assertStockable(tx: TenantTx, medicineId: string): Promise<void> {
    const medicine = await tx.medicine.findUnique({
      where: { id: medicineId },
      select: { isActive: true, schedule: true, name: true },
    })

    if (!medicine) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'medicineId', message: 'Choose a medicine from the shared list.' }],
      })
    }

    if (!isSellable(medicine.schedule as DrugSchedule)) {
      throw new AppException(ApiErrorCode.MEDICINE_BLOCKED_SCHEDULE, {
        fields: [
          {
            field: 'medicineId',
            message: `${medicine.name} is a Schedule X medicine and cannot be sold on MediBridge.`,
          },
        ],
      })
    }

    if (!medicine.isActive) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [
          {
            field: 'medicineId',
            message: `${medicine.name} has been archived in the shared list, so new stock cannot be added against it.`,
          },
        ],
      })
    }
  }

  private buildWhere(query: InventoryListQuery): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null }
    const now = new Date()

    if (query.status === 'active') where.isActive = true
    else if (query.status === 'inactive') where.isActive = false

    if (query.warehouseId) where.warehouseId = query.warehouseId

    if (query.expiry === 'expired') {
      where.expiryDate = { lt: now }
    } else if (query.expiry === 'expiring') {
      const warning = new Date(now)
      warning.setDate(warning.getDate() + EXPIRY_WARNING_DAYS)
      where.expiryDate = { gte: now, lte: warning }
    }

    // Out of stock is expressible; "low" is not, because it compares against
    // another column. Filtering out-of-stock here keeps the common case in the
    // database, and `low` is applied after the fact by the controller's caller.
    if (query.stock === 'out') where.quantity = { lte: 0 }

    if (query.search?.trim()) {
      const term = query.search.trim()
      where.OR = [
        { batchNumber: { contains: term, mode: 'insensitive' } },
        { medicine: { name: { contains: term, mode: 'insensitive' } } },
        { medicine: { brand: { contains: term, mode: 'insensitive' } } },
        { medicine: { composition: { contains: term, mode: 'insensitive' } } },
      ]
    }

    return where
  }

  private buildOrder(sortBy: InventoryListQuery['sortBy']): Record<string, unknown>[] {
    switch (sortBy) {
      case 'name':
        return [{ medicine: { name: 'asc' } }]
      case 'stock':
        return [{ quantity: 'asc' }]
      case 'updated':
        return [{ updatedAt: 'desc' }]
      case 'expiry':
      default:
        // Oldest expiry first: the thing a distributor most needs to see is
        // what dies soonest, not what was added last.
        return [{ expiryDate: 'asc' }]
    }
  }
}

function toSummary(item: {
  id: string
  medicineId: string
  warehouseId: string
  batchNumber: string
  expiryDate: Date
  mrpPaise: number
  sellingPricePaise: number
  quantity: number
  reservedQuantity: number
  unit: string
  minOrderQuantity: number
  lowStockThreshold: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  medicine: {
    name: string
    brand: string
    composition: string
    form: string
    strength: string | null
    packSize: string | null
    schedule: string
    isPrescriptionRequired: boolean
  }
  warehouse: { name: string }
}): InventoryItemSummary {
  const available = availableQuantity(item)
  const status = expiryStatus(item.expiryDate)
  const expired = status === 'expired'

  return {
    id: item.id,
    medicineId: item.medicineId,
    medicineName: item.medicine.name,
    brand: item.medicine.brand,
    composition: item.medicine.composition,
    form: item.medicine.form,
    strength: item.medicine.strength,
    packSize: item.medicine.packSize,
    schedule: item.medicine.schedule,
    isPrescriptionRequired: item.medicine.isPrescriptionRequired,

    warehouseId: item.warehouseId,
    warehouseName: item.warehouse.name,

    batchNumber: item.batchNumber,
    expiryDate: item.expiryDate.toISOString().slice(0, 10),
    daysUntilExpiry: daysUntilExpiry(item.expiryDate),
    expiryStatus: status,

    mrpPaise: item.mrpPaise,
    sellingPricePaise: item.sellingPricePaise,
    discountPercent:
      item.mrpPaise > 0
        ? Math.round(((item.mrpPaise - item.sellingPricePaise) / item.mrpPaise) * 100)
        : 0,

    quantity: item.quantity,
    reservedQuantity: item.reservedQuantity,
    /*
     * What a retailer could actually buy. Zero once expired, however many
     * units are physically on the shelf — the point of this number is "can
     * this be sold", and the physical count is `quantity` right above it.
     */
    availableQuantity: sellableQuantity(item, expired),
    unit: item.unit,
    minOrderQuantity: item.minOrderQuantity,
    lowStockThreshold: item.lowStockThreshold,
    stockLevel: sellableStockLevel(item, expired),

    isActive: item.isActive,
    isSellable: item.isActive && !expired && available > 0,

    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}
