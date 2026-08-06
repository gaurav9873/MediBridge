import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type BatchResult,
  BulkJobType,
  type ColumnSpec,
  DrugSchedule,
  MedicineForm,
  type RowIssue,
  type RowPlan,
  type SessionUser,
  UserRole,
} from '@medibridge/types'
import { z } from 'zod'
import { AppException } from '../../common/errors/app-exception'
import { PrismaService } from '../../common/prisma/prisma.service'
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
  readonly columns = columns
  readonly templateSheetName = 'Medicines'
  readonly rowSchema = rowSchema

  constructor(private readonly prisma: PrismaService) {}

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

  async validateBatch(rows: ParsedRow<MedicineRow>[], _scope: BulkScope): Promise<RowIssue[]> {
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

  async classifyBatch(rows: ParsedRow<MedicineRow>[], scope: BulkScope): Promise<RowPlan[]> {
    const existing = await this.findExisting(rows, scope)

    return rows.map((row) => {
      const key = this.naturalKey(row.data)
      return {
        rowNumber: row.rowNumber,
        action: existing.has(key) ? 'UPDATE' : 'CREATE',
        key: `${row.data.name} (${row.data.brand})`,
        describe: existing.has(key)
          ? 'Already in the catalogue — details will be updated'
          : 'New medicine',
      }
    })
  }

  async applyBatch(
    rows: ParsedRow<MedicineRow>[],
    scope: BulkScope,
    tx: PrismaTx,
  ): Promise<BatchResult> {
    const existing = await this.findExisting(rows, scope)
    let created = 0
    let updated = 0

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

      const existingId = existing.get(key)
      if (existingId) {
        await tx.medicine.update({ where: { id: existingId }, data })
        updated += 1
      } else {
        await tx.medicine.create({ data: { ...data, createdById: scope.userId } })
        created += 1
      }
    }

    return { created, updated, skipped: 0, issues: [] }
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
  ): Promise<Map<string, string>> {
    const names = [...new Set(rows.map((row) => row.data.name))]
    const brands = [...new Set(rows.map((row) => row.data.brand))]

    const candidates = await this.prisma.medicine.findMany({
      where: {
        name: { in: names, mode: 'insensitive' },
        brand: { in: brands, mode: 'insensitive' },
      },
      select: { id: true, name: true, brand: true, strength: true, packSize: true },
    })

    return new Map(
      candidates.map((medicine) => [
        [medicine.name, medicine.brand, medicine.strength ?? '', medicine.packSize ?? '']
          .map((part) => part.trim().toLowerCase())
          .join('|'),
        medicine.id,
      ]),
    )
  }
}
