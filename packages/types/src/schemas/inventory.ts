import { copy } from '@medibridge/copy'
import { z } from 'zod'
import { DrugSchedule, MedicineForm, SaleUnit } from '../enums.js'
import { hasMinimumShelfLife } from '../medicine-rules.js'
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
    /**
     * Which of the seller's warehouses holds it.
     *
     * Stock is physical, so it lives somewhere, and a distributor with a hub
     * in two cities needs to say which. The service checks the warehouse
     * belongs to the signed-in company — an id in a request body is a claim,
     * not a fact.
     */
    warehouseId: z.uuid(v.selectRequired('warehouse')),
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
  // The shelf-life rule itself lives in the medicine domain — this only asks
  // it. Duplicating "30 days" here is how the form and the service end up
  // disagreeing about what is listable.
  .refine((item) => hasMinimumShelfLife(item.expiryDate), {
    message: v.date.expiryTooSoon,
    path: ['expiryDate'],
  })
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

/** Browsing the catalogue: text, filters and paging in one place. */
export const medicineListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  form: z.string().trim().optional(),
  schedule: z.string().trim().optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type MedicineListQuery = z.infer<typeof medicineListSchema>

/**
 * Browsing your own stock.
 *
 * `stock` and `expiry` are separate filters because they answer separate
 * questions — "what do I need to reorder?" and "what do I need to shift before
 * it dies?" — and a batch is routinely one without being the other.
 */
export const inventoryListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  warehouseId: z.uuid().optional(),
  stock: z.enum(['all', 'low', 'out']).default('all'),
  expiry: z.enum(['all', 'expiring', 'expired']).default('all'),
  /** Archived batches are history; the working view is what can be sold. */
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  sortBy: z.enum(['expiry', 'name', 'stock', 'updated']).default('expiry'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
export type InventoryListQuery = z.infer<typeof inventoryListSchema>

/**
 * Moving stock between two of your own warehouses.
 *
 * The batch is identified by the inventory row it is leaving, not by medicine
 * plus batch number: the same batch can sit in two warehouses at once, and
 * "which one is it leaving?" is the whole question.
 */
export const stockTransferSchema = z.object({
  inventoryItemId: z.uuid(v.selectRequired('batch')),
  toWarehouseId: z.uuid(v.selectRequired('destination warehouse')),
  quantity: z
    .number(v.number.notANumber)
    .int(v.number.wholeNumber)
    .positive(v.number.positive),
  note: z.string().trim().max(500, v.text.tooLong(500)).optional(),
})
export type StockTransferInput = z.infer<typeof stockTransferSchema>

/** Merging a duplicate into the row that should survive. */
export const mergeMedicineSchema = z.object({
  keepId: z.uuid(),
  mergeId: z.uuid(),
})
export type MergeMedicineInput = z.infer<typeof mergeMedicineSchema>

/** Asking for a medicine that is missing from the catalogue. */
export const medicineRequestSchema = z.object({
  name: z.string().trim().min(2, v.requiredNamed('medicine name')).max(200, v.text.tooLong(200)),
  brand: z.string().trim().min(1, v.requiredNamed('brand')).max(120, v.text.tooLong(120)),
  composition: z.string().trim().max(300, v.text.tooLong(300)).optional(),
  form: z.string().trim().optional(),
  strength: z.string().trim().max(60, v.text.tooLong(60)).optional(),
  notes: z.string().trim().max(1000, v.text.tooLong(1000)).optional(),
})
export type MedicineRequestInput = z.infer<typeof medicineRequestSchema>
