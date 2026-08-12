import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type BatchResult,
  BulkJobType,
  type ColumnSpec,
  DrugSchedule,
  blankAsAbsent,
  MedicineForm,
  type RowIssue,
  type RowPlan,
  type SessionUser,
  UserRole,
} from '@medibridge/types'
import { z } from 'zod'
import { AppException } from '../../common/errors/app-exception'
import type { BulkHandler, BulkScope, ParsedRow, PrismaTx } from './bulk-handler'

const FORMS = Object.values(MedicineForm)
const SCHEDULES = Object.values(DrugSchedule)

const columns: ColumnSpec[] = [
  {
    key: 'name',
    header: 'Medicine Name',
    kind: 'text',
    required: true,
    example: 'Crocin Advance',
    help: 'Full name as printed on the pack.',
    width: 28,
  },
  {
    key: 'brand',
    header: 'Brand',
    kind: 'text',
    required: true,
    example: 'Crocin',
    help: 'The company that makes this medicine.',
    width: 18,
  },
  {
    key: 'composition',
    header: 'Salt or Composition',
    kind: 'text',
    required: true,
    example: 'Paracetamol 500mg',
    help: 'The active ingredient. Retailers often search by this.',
    width: 30,
  },
  {
    key: 'form',
    header: 'Type',
    kind: 'enum',
    required: true,
    example: 'TABLET',
    help: 'Tablet, syrup, injection and so on.',
    options: FORMS,
    width: 14,
  },
  {
    key: 'strength',
    header: 'Strength',
    kind: 'text',
    required: false,
    example: '500mg',
    help: 'How much active ingredient per unit.',
    width: 12,
  },
  {
    key: 'packSize',
    header: 'Pack Size',
    kind: 'text',
    required: false,
    example: '15 tablets',
    help: 'How many units in one pack.',
    width: 14,
  },
  {
    key: 'manufacturer',
    header: 'Manufacturer',
    kind: 'text',
    required: false,
    example: 'GSK',
    help: 'Who manufactures it.',
    width: 18,
  },
  {
    key: 'hsnCode',
    header: 'HSN Code',
    kind: 'text',
    required: true,
    example: '30049099',
    help: 'The 4 to 8 digit tax code used on invoices.',
    width: 12,
  },
  {
    key: 'gstRate',
    header: 'GST Rate',
    kind: 'integer',
    required: true,
    example: '12',
    help: 'GST percentage. One of 0, 5, 12 or 18.',
    options: ['0', '5', '12', '18'],
    width: 10,
  },
  {
    key: 'schedule',
    header: 'Drug Schedule',
    kind: 'enum',
    required: false,
    example: 'NONE',
    help: 'Schedule printed on the pack. Schedule X cannot be sold here.',
    options: SCHEDULES,
    width: 14,
  },
  {
    key: 'isPrescriptionRequired',
    header: 'Prescription Required',
    kind: 'boolean',
    required: false,
    example: 'No',
    help: 'Yes if it can only be sold against a prescription.',
    width: 20,
  },
]

/** Accepts the spellings a person would actually type for a yes/no column. */
const booleanish = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => ['yes', 'y', 'true', '1'].includes(value))

const rowSchema = z.object({
  name: z.string().trim().min(2, 'Please enter the medicine name.').max(200),
  brand: z.string().trim().min(1, 'Please enter the brand.').max(120),
  composition: z.string().trim().min(2, 'Please enter the salt or composition.').max(300),
  form: z.enum(FORMS as [string, ...string[]], 'Please use one of the allowed types.'),
  strength: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  packSize: z
    .string()
    .trim()
    .max(60)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  manufacturer: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  hsnCode: z
    .string()
    .trim()
    .regex(/^[0-9]{4,8}$/, 'Please enter a valid 4 to 8 digit HSN code.'),
  gstRate: z.coerce
    .number('Please enter a GST rate.')
    .refine((rate) => [0, 5, 12, 18].includes(rate), 'GST rate must be 0, 5, 12 or 18.'),
  schedule: z
    .enum(SCHEDULES as [string, ...string[]], 'Please use one of the allowed schedules.')
    .optional()
    .or(z.literal('').transform(() => DrugSchedule.NONE)),
  isPrescriptionRequired: booleanish.optional().or(z.literal('').transform(() => false)),
})

type MedicineRow = z.infer<typeof rowSchema>

/**
 * Medicine master import.
 *
 * Admin only — distributors submit a MedicineRequest instead, which keeps the
 * shared catalogue free of near-duplicates like "Crocin 500" and "crocin 500mg"
 * that would break cross-distributor price comparison.
 */
@Injectable()
export class MedicineImportHandler implements BulkHandler<MedicineRow> {
  readonly type = BulkJobType.MEDICINE_IMPORT
  /** The shared catalogue belongs to the platform, not to the admin running the import. */
  readonly scope = 'platform' as const
  readonly columns = columns
  readonly templateSheetName = 'Medicines'
  readonly rowSchema = rowSchema

  naturalKey(row: MedicineRow): string {
    // Mirrors @@unique([name, brand, strength, packSize]) on Medicine.
    return [row.name, row.brand, row.strength ?? '', row.packSize ?? '']
      .map((part) => part.trim().toLowerCase())
      .join('|')
  }

  authorize(user: SessionUser): BulkScope {
    if (user.role !== UserRole.ADMIN) throw new AppException(ApiErrorCode.FORBIDDEN)
    return { userId: user.id, role: user.role }
  }

  async validateBatch(
    rows: ParsedRow<MedicineRow>[],
    _scope: BulkScope,
    _tx: PrismaTx,
  ): Promise<RowIssue[]> {
    const issues: RowIssue[] = []

    for (const row of rows) {
      // Schedule X is refused here exactly as it is in the UI. A spreadsheet
      // must not be a way around a compliance rule.
      if (row.data.schedule === DrugSchedule.X) {
        issues.push({
          rowNumber: row.rowNumber,
          column: 'Drug Schedule',
          value: row.data.schedule,
          message: 'Schedule X medicines cannot be sold on MediBridge.',
        })
      }
    }

    return issues
  }

  async classifyBatch(
    rows: ParsedRow<MedicineRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<RowPlan[]> {
    const existing = await this.findExisting(rows, scope, tx)

    return rows.map((row) => {
      const match = existing.get(this.naturalKey(row.data))
      const label = `${row.data.name} (${row.data.brand})`

      if (!match) {
        return { rowNumber: row.rowNumber, action: 'CREATE', key: label, describe: 'New medicine' }
      }

      /*
       * Re-uploading the same file must not report work that did not happen.
       *
       * Without this, importing an unchanged sheet a second time claimed every
       * row as "updated" — and wrote every one of them, bumping updatedAt and
       * filling the audit log for nothing. A row that matches in every field
       * is a SKIP, which is what the stock-update handler has always done.
       */
      const changes = describeChanges(match, row.data)
      return {
        rowNumber: row.rowNumber,
        action: changes.length > 0 ? 'UPDATE' : 'SKIP',
        key: label,
        describe: changes.length > 0 ? changes.join(', ') : 'Already up to date',
      }
    })
  }

  async applyBatch(
    rows: ParsedRow<MedicineRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<BatchResult> {
    const existing = await this.findExisting(rows, scope, tx)
    let created = 0
    let updated = 0
    let skipped = 0

    for (const row of rows) {
      const key = this.naturalKey(row.data)
      const data = {
        name: row.data.name,
        brand: row.data.brand,
        composition: row.data.composition,
        form: row.data.form as never,
        strength: row.data.strength ?? null,
        packSize: row.data.packSize ?? null,
        manufacturer: row.data.manufacturer ?? null,
        hsnCode: row.data.hsnCode,
        gstRate: row.data.gstRate,
        schedule: (row.data.schedule ?? DrugSchedule.NONE) as never,
        isPrescriptionRequired: row.data.isPrescriptionRequired ?? false,
      }

      const match = existing.get(key)
      if (match) {
        // Nothing to write when nothing differs.
        if (describeChanges(match, row.data).length === 0) {
          skipped += 1
          continue
        }
        await tx.medicine.update({ where: { id: match.id }, data })
        updated += 1
      } else {
        await tx.medicine.create({ data: { ...data, createdById: scope.userId } })
        created += 1
      }
    }

    return { created, updated, skipped, issues: [] }
  }

  /**
   * One query for the whole batch rather than one per row.
   *
   * Matching is done in memory on the normalised key because the database
   * unique index is case-sensitive while people's spreadsheets are not.
   */
  private async findExisting(
    rows: ParsedRow<MedicineRow>[],
    _scope: BulkScope,
    tx: PrismaTx,
  ): Promise<Map<string, ExistingMedicine>> {
    const names = [...new Set(rows.map((row) => row.data.name))]
    const brands = [...new Set(rows.map((row) => row.data.brand))]

    const candidates = await tx.medicine.findMany({
      where: {
        name: { in: names, mode: 'insensitive' },
        brand: { in: brands, mode: 'insensitive' },
      },
      // Every field the import can write, so a row that changes nothing can be
      // recognised as changing nothing.
      select: {
        id: true,
        name: true,
        brand: true,
        strength: true,
        packSize: true,
        composition: true,
        form: true,
        manufacturer: true,
        hsnCode: true,
        gstRate: true,
        schedule: true,
        isPrescriptionRequired: true,
      },
    })

    return new Map(
      candidates.map((medicine) => [
        [medicine.name, medicine.brand, medicine.strength ?? '', medicine.packSize ?? '']
          .map((part) => part.trim().toLowerCase())
          .join('|'),
        medicine,
      ]),
    )
  }
}

/** Every field this import can write, as stored. */
interface ExistingMedicine {
  id: string
  name: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  manufacturer: string | null
  hsnCode: string
  gstRate: number
  schedule: string
  isPrescriptionRequired: boolean
}

/**
 * What a row would actually change about a medicine already on the list.
 *
 * Empty means the row and the record agree, which makes it a SKIP rather than
 * an update — the difference between "we re-saved 50 rows" and "nothing to do".
 *
 * Optional text is compared through blankAsAbsent so a missing strength and an
 * empty one are the same absence, exactly as the identity key treats them.
 */
function describeChanges(existing: ExistingMedicine, row: MedicineRow): string[] {
  const changes: string[] = []
  const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
    blankAsAbsent(a) === blankAsAbsent(b)

  if (!same(existing.composition, row.composition)) changes.push('salt')
  if (existing.form !== row.form) changes.push('type')
  if (!same(existing.strength, row.strength)) changes.push('strength')
  if (!same(existing.packSize, row.packSize)) changes.push('pack size')
  if (!same(existing.manufacturer, row.manufacturer)) changes.push('manufacturer')
  if (!same(existing.hsnCode, row.hsnCode)) changes.push('HSN code')
  if (existing.gstRate !== row.gstRate) changes.push('GST rate')
  if (existing.schedule !== (row.schedule ?? DrugSchedule.NONE)) changes.push('schedule')
  if (existing.isPrescriptionRequired !== (row.isPrescriptionRequired ?? false)) {
    changes.push('prescription requirement')
  }
  return changes
}
