import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type BatchResult,
  BulkJobType,
  type ColumnSpec,
  type DrugSchedule,
  MINIMUM_SHELF_LIFE_DAYS,
  type RowIssue,
  type RowPlan,
  SaleUnit,
  type SessionUser,
  UserRole,
  hasMinimumShelfLife,
  isSellable,
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
    help: 'Must match a medicine in the MediBridge list. Ask for it first if it is missing.',
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
    help: 'As printed on the pack. One row per batch.',
    width: 18,
  },
  {
    key: 'expiryDate',
    header: 'Expiry Date',
    kind: 'date',
    required: true,
    example: '2027-06-30',
    help: `As YYYY-MM-DD. Needs at least ${MINIMUM_SHELF_LIFE_DAYS} days left to be listed.`,
    width: 14,
  },
  {
    key: 'mrp',
    header: 'MRP',
    kind: 'money',
    required: true,
    example: '30.00',
    help: 'The maximum retail price printed on the pack, in rupees.',
    width: 12,
  },
  {
    key: 'sellingPrice',
    header: 'Selling Price',
    kind: 'money',
    required: true,
    example: '24.00',
    help: 'What retailers pay you, in rupees. Cannot be more than the MRP.',
    width: 14,
  },
  {
    key: 'quantity',
    header: 'Quantity',
    kind: 'integer',
    required: true,
    example: '500',
    help: 'How many units of this batch you hold right now.',
    width: 12,
  },
  {
    key: 'unit',
    header: 'Sold As',
    kind: 'text',
    required: false,
    example: 'STRIP',
    help: 'STRIP, BOX, BOTTLE, VIAL, TUBE, PIECE or PACK. Defaults to STRIP.',
    width: 12,
  },
  {
    key: 'minOrderQuantity',
    header: 'Minimum Order Quantity',
    kind: 'integer',
    required: false,
    example: '10',
    help: 'Smallest quantity a retailer may buy. Defaults to 1.',
    width: 20,
  },
  {
    key: 'lowStockThreshold',
    header: 'Warn Below',
    kind: 'integer',
    required: false,
    example: '20',
    help: 'We warn you when free stock drops to this. Defaults to 10.',
    width: 14,
  },
  {
    key: 'isActive',
    header: 'Available to Order',
    kind: 'boolean',
    required: false,
    example: 'Yes',
    help: 'No lists the batch but hides it from retailers. Defaults to Yes.',
    width: 18,
  },
]

const optionalText = z.literal('').transform(() => undefined)

const rowSchema = z.object({
  medicineName: z.string().trim().min(1, 'Please enter the medicine name.'),
  brand: z.string().trim().min(1, 'Please enter the brand.'),
  batchNumber: z.string().trim().min(1, 'Please enter the batch number.').toUpperCase(),
  expiryDate: z.coerce.date('Please enter the expiry date as YYYY-MM-DD.'),
  mrp: z.coerce.number().positive('Please enter a valid MRP.'),
  sellingPrice: z.coerce.number().positive('Please enter a valid selling price.'),
  quantity: z.coerce.number().int().nonnegative('Quantity cannot be negative.'),
  unit: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || (Object.values(SaleUnit) as string[]).includes(value), {
      message: 'Use STRIP, BOX, BOTTLE, VIAL, TUBE, PIECE or PACK.',
    })
    .optional()
    .or(optionalText),
  minOrderQuantity: z.coerce
    .number()
    .int()
    .positive('Minimum order must be at least 1.')
    .optional()
    .or(optionalText),
  lowStockThreshold: z.coerce
    .number()
    .int()
    .nonnegative('Warn Below cannot be negative.')
    .optional()
    .or(optionalText),
  isActive: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => !['no', 'n', 'false', '0'].includes(value))
    .optional()
    .or(optionalText),
})

type ImportRow = z.infer<typeof rowSchema>

interface MedicineMatch {
  id: string
  name: string
  isActive: boolean
  schedule: string
}

/**
 * Listing a whole stock list at once — CREATE ONLY.
 *
 * This is how a distributor gets started: a spreadsheet of everything on their
 * shelves, rather than a hundred trips through the add-a-batch form.
 *
 * It deliberately never updates. A batch already listed at this warehouse is
 * SKIPPED, not overwritten, so re-uploading a corrected file cannot silently
 * reset prices or stock counts that have moved on since. Changing existing
 * stock is `INVENTORY_STOCK_UPDATE`, which matches and updates on purpose.
 *
 * Every rule the single-batch form enforces is enforced here too, and from the
 * same shared functions — `isSellable` for Schedule X and `hasMinimumShelfLife`
 * for expiry. A bulk path that is more permissive than the form is a bulk path
 * people use to get around the form.
 */
@Injectable()
export class InventoryImportHandler implements BulkHandler<ImportRow> {
  readonly type = BulkJobType.INVENTORY_IMPORT
  readonly columns = columns
  readonly templateSheetName = 'Stock Import'
  readonly rowSchema = rowSchema

  naturalKey(row: ImportRow): string {
    return [row.medicineName, row.brand, row.batchNumber]
      .map((part) => part.trim().toLowerCase())
      .join('|')
  }

  authorize(user: SessionUser): BulkScope {
    // Stock belongs to a seller. An admin has no shelves of their own.
    if (user.role !== UserRole.DISTRIBUTOR) throw new AppException(ApiErrorCode.FORBIDDEN)
    return { userId: user.id, role: user.role }
  }

  async validateBatch(
    rows: ParsedRow<ImportRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<RowIssue[]> {
    const issues: RowIssue[] = []
    const medicines = await this.findMedicines(rows, tx)

    for (const row of rows) {
      const medicine = medicines.get(medicineKeyOf(row.data))

      if (!medicine) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Medicine Name',
          value: row.data.medicineName,
          message:
            'We could not find this medicine and brand in the shared list. Check the spelling, or ask for it to be added from Medicine Requests.',
        })
        continue
      }

      if (!isSellable(medicine.schedule as DrugSchedule)) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Medicine Name',
          value: row.data.medicineName,
          message: `${medicine.name} is a Schedule X medicine and cannot be sold on MediBridge.`,
        })
      }

      if (!medicine.isActive) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Medicine Name',
          value: row.data.medicineName,
          message: `${medicine.name} has been archived in the shared list, so new stock cannot be added against it.`,
        })
      }

      if (rupeesToPaise(row.data.sellingPrice) > rupeesToPaise(row.data.mrp)) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Selling Price',
          value: String(row.data.sellingPrice),
          message: 'Selling price cannot be higher than the MRP.',
        })
      }

      if (!hasMinimumShelfLife(row.data.expiryDate)) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Expiry Date',
          value: row.raw.expiryDate ?? '',
          message: `A batch needs at least ${MINIMUM_SHELF_LIFE_DAYS} days of shelf life left to be listed.`,
        })
      }
    }

    return issues
  }

  async classifyBatch(
    rows: ParsedRow<ImportRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<RowPlan[]> {
    const [medicines, existing] = await Promise.all([
      this.findMedicines(rows, tx),
      this.findExisting(rows, scope, tx),
    ])

    return rows.map((row) => {
      const label = `${row.data.medicineName} · ${row.data.batchNumber}`
      const medicine = medicines.get(medicineKeyOf(row.data))
      if (!medicine) return { rowNumber: row.rowNumber, action: 'ERROR', key: label }

      if (existing.has(`${medicine.id}|${row.data.batchNumber}`)) {
        return {
          rowNumber: row.rowNumber,
          action: 'SKIP',
          key: label,
          describe: 'Already listed — use a Stock Update to change it',
        }
      }

      return {
        rowNumber: row.rowNumber,
        action: 'CREATE',
        key: label,
        describe: `${row.data.quantity} units at ₹${row.data.sellingPrice.toFixed(2)}`,
      }
    })
  }

  async applyBatch(
    rows: ParsedRow<ImportRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<BatchResult> {
    if (!scope.warehouseId) throw new AppException(ApiErrorCode.FORBIDDEN)

    const [medicines, existing] = await Promise.all([
      this.findMedicines(rows, tx),
      this.findExisting(rows, scope, tx),
    ])

    // The warehouse is the seller's, resolved by the engine from the session —
    // never from a column in the file.
    const warehouse = await tx.warehouse.findFirst({
      where: { id: scope.warehouseId, deletedAt: null },
      select: { companyId: true },
    })
    if (!warehouse) throw new AppException(ApiErrorCode.FORBIDDEN)

    let created = 0
    let skipped = 0
    const issues: RowIssue[] = []

    for (const row of rows) {
      const medicine = medicines.get(medicineKeyOf(row.data))
      if (!medicine) {
        issues.push({ rowNumber: row.rowNumber, message: 'Medicine not found in the shared list.' })
        continue
      }

      if (existing.has(`${medicine.id}|${row.data.batchNumber}`)) {
        skipped += 1
        continue
      }

      await tx.inventoryItem.create({
        data: {
          companyId: warehouse.companyId,
          warehouseId: scope.warehouseId,
          medicineId: medicine.id,
          batchNumber: row.data.batchNumber,
          expiryDate: row.data.expiryDate,
          mrpPaise: rupeesToPaise(row.data.mrp),
          sellingPricePaise: rupeesToPaise(row.data.sellingPrice),
          quantity: row.data.quantity,
          unit: (row.data.unit as SaleUnit) || SaleUnit.STRIP,
          minOrderQuantity: row.data.minOrderQuantity ?? 1,
          lowStockThreshold: row.data.lowStockThreshold ?? 10,
          isActive: row.data.isActive ?? true,
        },
      })
      created += 1
    }

    return { created, updated: 0, skipped, issues }
  }

  /**
   * Resolves each row's medicine from the shared catalogue.
   *
   * One query per batch rather than one per row: 50,000 rows would otherwise
   * be 50,000 round trips. The catalogue is platform-owned, so this reads
   * across tenants by design — every seller stocks against the same rows.
   */
  private async findMedicines(
    rows: ParsedRow<ImportRow>[],
    tx: PrismaTx,
  ): Promise<Map<string, MedicineMatch>> {
    const names = [...new Set(rows.map((row) => row.data.medicineName))]
    const brands = [...new Set(rows.map((row) => row.data.brand))]

    const medicines = await tx.medicine.findMany({
      where: {
        name: { in: names, mode: 'insensitive' },
        brand: { in: brands, mode: 'insensitive' },
      },
      select: { id: true, name: true, brand: true, isActive: true, schedule: true },
    })

    const byKey = new Map<string, MedicineMatch>()
    for (const medicine of medicines) {
      byKey.set(`${medicine.name.trim().toLowerCase()}|${medicine.brand.trim().toLowerCase()}`, {
        id: medicine.id,
        name: medicine.name,
        isActive: medicine.isActive,
        schedule: medicine.schedule,
      })
    }
    return byKey
  }

  /** Which of these batches this warehouse already holds. */
  private async findExisting(
    rows: ParsedRow<ImportRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<Set<string>> {
    if (!scope.warehouseId) throw new AppException(ApiErrorCode.FORBIDDEN)

    const batchNumbers = [...new Set(rows.map((row) => row.data.batchNumber))]
    const items = await tx.inventoryItem.findMany({
      where: {
        warehouseId: scope.warehouseId,
        batchNumber: { in: batchNumbers },
        deletedAt: null,
      },
      select: { medicineId: true, batchNumber: true },
    })

    return new Set(items.map((item) => `${item.medicineId}|${item.batchNumber}`))
  }
}

function medicineKeyOf(row: ImportRow): string {
  return `${row.medicineName.trim().toLowerCase()}|${row.brand.trim().toLowerCase()}`
}
