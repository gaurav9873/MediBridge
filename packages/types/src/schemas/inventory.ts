import { copy } from '@medibridge/copy'
import { z } from 'zod'
import { DrugSchedule, MedicineForm, SaleUnit } from '../enums.js'
import { ALLOWED_GST_RATES, HSN_PATTERN } from '../patterns.js'
import { paiseSchema, positivePaiseSchema, quantitySchema, timeOfDaySchema } from './common.js'

const v = copy.validation

/** Admin-managed master catalogue entry. */
export const medicineSchema = z.object({
  name: z.string().trim().min(2, v.requiredNamed('medicine name')).max(200, v.text.tooLong(200)),
  brand: z.string().trim().min(1, v.requiredNamed('brand')).max(120, v.text.tooLong(120)),
  composition: z
    .string()
    .trim()
    .min(2, v.requiredNamed('composition'))
    .max(300, v.text.tooLong(300)),
  form: z.enum(MedicineForm, v.selectRequired('type')),
  strength: z.string().trim().max(60, v.text.tooLong(60)).optional(),
  packSize: z.string().trim().max(60, v.text.tooLong(60)).optional(),
  manufacturer: z.string().trim().max(160, v.text.tooLong(160)).optional(),
  hsnCode: z.string().trim().regex(HSN_PATTERN, 'Please enter a valid 4 to 8 digit HSN code.'),
  gstRate: z.union(
    ALLOWED_GST_RATES.map((rate) => z.literal(rate)) as [
      z.ZodLiteral<0>,
      z.ZodLiteral<5>,
      z.ZodLiteral<12>,
      z.ZodLiteral<18>,
    ],
    { error: v.selectRequired('GST rate') },
  ),
  schedule: z.enum(DrugSchedule, v.selectRequired('drug schedule')).default(DrugSchedule.NONE),
  isPrescriptionRequired: z.boolean().default(false),
})
export type MedicineInput = z.infer<typeof medicineSchema>

/**
 * One batch of stock held by one distributor.
 *
 * Two rules are enforced here rather than left to the UI:
 *   - selling price may never exceed MRP
 *   - a batch must have at least 30 days of shelf life to be listed
 */
export const inventoryItemSchema = z
  .object({
    medicineId: z.uuid(v.selectRequired('medicine')),
    batchNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, v.requiredNamed('batch number'))
      .max(60, v.text.tooLong(60)),
    expiryDate: z.coerce.date(v.date.invalid),
    mrpPaise: positivePaiseSchema,
    sellingPricePaise: positivePaiseSchema,
    quantity: z.number().int(v.number.wholeNumber).nonnegative(v.number.positive),
    unit: z.enum(SaleUnit, v.selectRequired('unit')),
    minOrderQuantity: quantitySchema.default(1),
    lowStockThreshold: z.number().int().nonnegative().default(10),
    isActive: z.boolean().default(true),
  })
  .refine((item) => item.sellingPricePaise <= item.mrpPaise, {
    message: v.price.aboveMrp,
    path: ['sellingPricePaise'],
  })
  .refine(
    (item) => {
      const thirtyDays = 30 * 24 * 60 * 60 * 1000
      return item.expiryDate.getTime() > Date.now() + thirtyDays
    },
    { message: v.date.expiryTooSoon, path: ['expiryDate'] },
  )
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>

/** Partial update — price, stock and availability are the fields that change daily. */
export const inventoryItemUpdateSchema = z.object({
  sellingPricePaise: positivePaiseSchema.optional(),
  quantity: z.number().int().nonnegative(v.number.positive).optional(),
  minOrderQuantity: quantitySchema.optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
})
export type InventoryItemUpdateInput = z.infer<typeof inventoryItemUpdateSchema>

/** One row of the bulk-upload spreadsheet, before it becomes an InventoryItem. */
export const inventoryBulkRowSchema = z.object({
  medicineName: z.string().trim().min(1, v.requiredNamed('medicine name')),
  batchNumber: z.string().trim().min(1, v.requiredNamed('batch number')),
  expiryDate: z.coerce.date(v.date.invalid),
  mrp: z.number().positive(v.price.invalid),
  sellingPrice: z.number().positive(v.price.invalid),
  quantity: z.number().int().nonnegative(v.number.positive),
  unit: z.enum(SaleUnit, v.selectRequired('unit')),
  minOrderQuantity: z.number().int().positive().default(1),
})
export type InventoryBulkRow = z.infer<typeof inventoryBulkRowSchema>

/** Result of validating an uploaded spreadsheet, shown before anything is saved. */
export interface BulkUploadPreview {
  validRows: number
  invalidRows: number
  errors: Array<{ row: number; message: string }>
}

/** Distributor's Same-Day service area. Feeds the PostGIS radius query. */
export const deliverySettingsSchema = z
  .object({
    sameDayRadiusKm: z
      .number(v.number.notANumber)
      .min(1, v.number.min(1))
      .max(200, v.number.max(200)),
    sameDayCutoffTime: timeOfDaySchema,
    deliveryChargePaise: paiseSchema.default(0),
    freeDeliveryAbovePaise: paiseSchema.optional(),
  })
  .refine(
    (settings) =>
      settings.freeDeliveryAbovePaise === undefined ||
      settings.freeDeliveryAbovePaise > settings.deliveryChargePaise,
    {
      message: 'The free delivery amount should be higher than the delivery charge.',
      path: ['freeDeliveryAbovePaise'],
    },
  )
export type DeliverySettingsInput = z.infer<typeof deliverySettingsSchema>

/** Retailer-facing search query. */
export const medicineSearchSchema = z.object({
  query: z.string().trim().max(120, v.text.tooLong(120)).optional(),
  form: z.enum(MedicineForm).optional(),
  sameDayOnly: z.coerce.boolean().default(false),
  inStockOnly: z.coerce.boolean().default(true),
  minPricePaise: paiseSchema.optional(),
  maxPricePaise: paiseSchema.optional(),
  sortBy: z
    .enum(['relevance', 'priceLow', 'priceHigh', 'fastest', 'expiryLongest'])
    .default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})
export type MedicineSearchInput = z.infer<typeof medicineSearchSchema>
