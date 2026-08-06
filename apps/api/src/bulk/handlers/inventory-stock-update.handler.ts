import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type BatchResult,
  BulkJobType,
  type ColumnSpec,
  type RowIssue,
  type RowPlan,
  type SessionUser,
  UserRole,
  rupeesToPaise,
} from '@medibridge/types'
import { z } from 'zod'
import { AppException } from '../../common/errors/app-exception'
import type { BulkHandler, BulkScope, ParsedRow, PrismaTx } from './bulk-handler'

const columns: ColumnSpec[] = [
  {
    key: 'medicineName',
    header: 'Medicine Name',
    kind: 'text',
    required: true,
    example: 'Crocin Advance',
    help: 'Must match a medicine in the MediBridge catalogue.',
    width: 28,
  },
  {
    key: 'brand',
    header: 'Brand',
    kind: 'text',
    required: true,
    example: 'Crocin',
    help: 'Used together with the name to find the medicine.',
    width: 18,
  },
  {
    key: 'batchNumber',
    header: 'Batch Number',
    kind: 'text',
    required: true,
    example: 'CRA24A091',
    help: 'The batch you want to update. Must already exist in your stock.',
    width: 18,
  },
  {
    key: 'quantity',
    header: 'Quantity',
    kind: 'integer',
    required: false,
    example: '500',
    help: 'New stock count. Leave blank to keep the current quantity.',
    width: 12,
  },
  {
    key: 'sellingPrice',
    header: 'Selling Price',
    kind: 'money',
    required: false,
    example: '24.00',
    help: 'New price in rupees. Cannot be more than the MRP.',
    width: 14,
  },
  {
    key: 'mrp',
    header: 'MRP',
    kind: 'money',
    required: false,
    example: '30.00',
    help: 'New MRP in rupees. Leave blank to keep the current one.',
    width: 12,
  },
  {
    key: 'expiryDate',
    header: 'Expiry Date',
    kind: 'date',
    required: false,
    example: '2027-06-30',
    help: 'New expiry as YYYY-MM-DD. Leave blank to keep the current one.',
    width: 14,
  },
  {
    key: 'minOrderQuantity',
    header: 'Minimum Order Quantity',
    kind: 'integer',
    required: false,
    example: '10',
    help: 'Smallest quantity a retailer may buy. Leave blank to keep it.',
    width: 20,
  },
  {
    key: 'isActive',
    header: 'Available to Order',
    kind: 'boolean',
    required: false,
    example: 'Yes',
    help: 'No hides the item from retailers without deleting it.',
    width: 18,
  },
]

const optionalText = z.literal('').transform(() => undefined)

const rowSchema = z.object({
  medicineName: z.string().trim().min(1, 'Please enter the medicine name.'),
  brand: z.string().trim().min(1, 'Please enter the brand.'),
  batchNumber: z.string().trim().min(1, 'Please enter the batch number.').toUpperCase(),
  quantity: z.coerce
    .number()
    .int()
    .nonnegative('Quantity cannot be negative.')
    .optional()
    .or(optionalText),
  sellingPrice: z.coerce
    .number()
    .positive('Please enter a valid selling price.')
    .optional()
    .or(optionalText),
  mrp: z.coerce.number().positive('Please enter a valid MRP.').optional().or(optionalText),
  expiryDate: z.coerce
    .date('Please enter the expiry date as YYYY-MM-DD.')
    .optional()
    .or(optionalText),
  minOrderQuantity: z.coerce
    .number()
    .int()
    .positive('Minimum order must be at least 1.')
    .optional()
    .or(optionalText),
  isActive: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => ['yes', 'y', 'true', '1'].includes(value))
    .optional()
    .or(optionalText),
})

type StockRow = z.infer<typeof rowSchema>

/**
 * Distributor stock update — MATCH AND UPDATE.
 *
 * Rows are matched on (distributor, medicine, batch number) and only the
 * columns actually filled in are changed. Records missing from the file are
 * left completely alone: a distributor who uploads half their sheet must not
 * lose the other half.
 *
 * Full-inventory-replace is a separate, deliberately harder workflow with its
 * own confirmations and audit trail. It is not this.
 */
@Injectable()
export class InventoryStockUpdateHandler implements BulkHandler<StockRow> {
  readonly type = BulkJobType.INVENTORY_STOCK_UPDATE
  readonly columns = columns
  readonly templateSheetName = 'Stock Update'
  readonly rowSchema = rowSchema

  naturalKey(row: StockRow): string {
    return [row.medicineName, row.brand, row.batchNumber]
      .map((part) => part.trim().toLowerCase())
      .join('|')
  }

  authorize(user: SessionUser): BulkScope {
    if (user.role !== UserRole.DISTRIBUTOR) throw new AppException(ApiErrorCode.FORBIDDEN)
    return { userId: user.id, role: user.role }
  }

  async validateBatch(
    rows: ParsedRow<StockRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<RowIssue[]> {
    const issues: RowIssue[] = []
    const matches = await this.findMatches(rows, scope, tx)

    for (const row of rows) {
      const key = this.naturalKey(row.data)
      const match = matches.get(key)

      if (!match) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Batch Number',
          value: row.data.batchNumber,
          message:
            'No stock found for this medicine and batch number. Check the spelling, or add it as new stock first.',
        })
        continue
      }

      // Selling price must stay at or below MRP — the new price is checked
      // against the new MRP if one was supplied, otherwise the existing one.
      const newMrp = row.data.mrp !== undefined ? rupeesToPaise(row.data.mrp) : match.mrpPaise
      const newPrice =
        row.data.sellingPrice !== undefined
          ? rupeesToPaise(row.data.sellingPrice)
          : match.sellingPricePaise

      if (newPrice > newMrp) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Selling Price',
          value: String(row.data.sellingPrice ?? ''),
          message: 'Selling price cannot be higher than the MRP.',
        })
      }

      // Reducing stock below what is already reserved for in-flight carts
      // would break the reserved <= quantity constraint.
      if (row.data.quantity !== undefined && row.data.quantity < match.reservedQuantity) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Quantity',
          value: String(row.data.quantity),
          message: `${match.reservedQuantity} units are reserved for orders being placed right now, so stock cannot go below that.`,
        })
      }

      if (row.data.expiryDate !== undefined && row.data.expiryDate.getTime() < Date.now()) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Expiry Date',
          value: row.raw.expiryDate ?? '',
          message: 'This expiry date is in the past.',
        })
      }
    }

    return issues
  }

  async classifyBatch(
    rows: ParsedRow<StockRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<RowPlan[]> {
    const matches = await this.findMatches(rows, scope, tx)

    return rows.map((row) => {
      const match = matches.get(this.naturalKey(row.data))
      const label = `${row.data.medicineName} · ${row.data.batchNumber}`

      if (!match) return { rowNumber: row.rowNumber, action: 'ERROR', key: label }

      const changes: string[] = []
      if (row.data.quantity !== undefined && row.data.quantity !== match.quantity) {
        changes.push(`stock ${match.quantity} → ${row.data.quantity}`)
      }
      if (
        row.data.sellingPrice !== undefined &&
        rupeesToPaise(row.data.sellingPrice) !== match.sellingPricePaise
      ) {
        changes.push(
          `price ₹${(match.sellingPricePaise / 100).toFixed(2)} → ₹${row.data.sellingPrice.toFixed(2)}`,
        )
      }
      if (row.data.mrp !== undefined && rupeesToPaise(row.data.mrp) !== match.mrpPaise) {
        changes.push('MRP updated')
      }
      if (row.data.expiryDate !== undefined) changes.push('expiry updated')
      if (row.data.minOrderQuantity !== undefined) changes.push('minimum order updated')
      if (row.data.isActive !== undefined && row.data.isActive !== match.isActive) {
        changes.push(row.data.isActive ? 'made available' : 'hidden from retailers')
      }

      return {
        rowNumber: row.rowNumber,
        // Nothing actually changing is a SKIP, not an update — so the preview
        // does not claim to have done work it did not do.
        action: changes.length > 0 ? 'UPDATE' : 'SKIP',
        key: label,
        describe: changes.length > 0 ? changes.join(', ') : 'No change',
      }
    })
  }

  async applyBatch(
    rows: ParsedRow<StockRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<BatchResult> {
    const matches = await this.findMatches(rows, scope, tx)
    let updated = 0
    let skipped = 0
    const issues: RowIssue[] = []

    for (const row of rows) {
      const match = matches.get(this.naturalKey(row.data))
      if (!match) {
        issues.push({
          rowNumber: row.rowNumber,
          message: 'No stock found for this medicine and batch number.',
        })
        continue
      }

      // Only the columns the user actually filled in are touched.
      const data: Record<string, unknown> = {}
      if (row.data.quantity !== undefined) data.quantity = row.data.quantity
      if (row.data.sellingPrice !== undefined)
        data.sellingPricePaise = rupeesToPaise(row.data.sellingPrice)
      if (row.data.mrp !== undefined) data.mrpPaise = rupeesToPaise(row.data.mrp)
      if (row.data.expiryDate !== undefined) data.expiryDate = row.data.expiryDate
      if (row.data.minOrderQuantity !== undefined) data.minOrderQuantity = row.data.minOrderQuantity
      if (row.data.isActive !== undefined) data.isActive = row.data.isActive

      if (Object.keys(data).length === 0) {
        skipped += 1
        continue
      }

      await tx.inventoryItem.update({ where: { id: match.id }, data })
      updated += 1
    }

    return { created: 0, updated, skipped, issues }
  }

  /** One query per batch, scoped to the signed-in distributor. */
  private async findMatches(
    rows: ParsedRow<StockRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<
    Map<
      string,
      {
        id: string
        quantity: number
        reservedQuantity: number
        mrpPaise: number
        sellingPricePaise: number
        isActive: boolean
      }
    >
  > {
    if (!scope.warehouseId) throw new AppException(ApiErrorCode.FORBIDDEN)

    const batchNumbers = [...new Set(rows.map((row) => row.data.batchNumber))]

    const items = await tx.inventoryItem.findMany({
      // scope.warehouseId comes from the session, so a warehouseId column in
      // the uploaded file can never widen this.
      where: {
        warehouseId: scope.warehouseId,
        batchNumber: { in: batchNumbers },
        deletedAt: null,
      },
      select: {
        id: true,
        batchNumber: true,
        quantity: true,
        reservedQuantity: true,
        mrpPaise: true,
        sellingPricePaise: true,
        isActive: true,
        medicine: { select: { name: true, brand: true } },
      },
    })

    return new Map(
      items.map((item) => [
        [item.medicine.name, item.medicine.brand, item.batchNumber]
          .map((part) => part.trim().toLowerCase())
          .join('|'),
        {
          id: item.id,
          quantity: item.quantity,
          reservedQuantity: item.reservedQuantity,
          mrpPaise: item.mrpPaise,
          sellingPricePaise: item.sellingPricePaise,
          isActive: item.isActive,
        },
      ]),
    )
  }
}
