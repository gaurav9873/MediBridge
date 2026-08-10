import { copy } from '@medibridge/copy'
import { z } from 'zod'
import { PaymentTermType } from '../tenancy.js'
import { addressSchema, mobileSchema } from './common.js'

const v = copy.validation

/**
 * Everything a company can change about itself.
 *
 * Split by the screen that edits it rather than by table, because that is how
 * someone thinks about it: "my details", "where I ship from", "how I get
 * paid", "how it looks". One giant company schema would mean every save
 * re-validating fields the user never touched.
 */

/** Who the business is, and how customers reach it. */
export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, v.requiredNamed('business name')).max(160, v.text.tooLong(160)),
  supportEmail: z.email(v.email.invalid).max(255).or(z.literal('')).optional(),
  supportPhone: mobileSchema.or(z.literal('')).optional(),
})
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>

/**
 * Where the money goes.
 *
 * Weekly settlements land here, so a wrong digit means a payment someone has
 * to chase. IFSC is checked for shape because the bank will reject it anyway,
 * and finding out here is cheaper than finding out on payout day.
 */
export const companyBankSchema = z.object({
  bankAccountHolder: z.string().trim().max(160, v.text.tooLong(160)).or(z.literal('')).optional(),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, 'Enter the account number exactly as it appears in your passbook.')
    .or(z.literal(''))
    .optional(),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'An IFSC has 11 characters, like HDFC0000123.')
    .or(z.literal(''))
    .optional(),
})
export type CompanyBankInput = z.infer<typeof companyBankSchema>

/**
 * How this company expects to be paid.
 *
 * Configuration, not a platform rule — which is the whole reason a private
 * distributor can run 30-day credit while the marketplace runs 20% token.
 */
export const companyTermsSchema = z
  .object({
    paymentTermType: z.enum(
      [
        PaymentTermType.TOKEN_PLUS_COD,
        PaymentTermType.PREPAID,
        PaymentTermType.COD,
        PaymentTermType.CREDIT,
      ],
      { error: v.selectRequired('payment terms') },
    ),
    tokenPercent: z.number().int().min(1).max(100),
    creditDays: z.number().int().min(1).max(180),
  })
  .refine(
    (data) => data.paymentTermType !== PaymentTermType.TOKEN_PLUS_COD || data.tokenPercent >= 1,
    { message: 'Choose how much of the order is paid up front.', path: ['tokenPercent'] },
  )
export type CompanyTermsInput = z.infer<typeof companyTermsSchema>

/** White label. One seed colour; the design tokens derive the rest. */
export const companyBrandingSchema = z.object({
  logoUrl: z.url(v.url.invalid).max(500).or(z.literal('')).optional(),
  loginImageUrl: z.url(v.url.invalid).max(500).or(z.literal('')).optional(),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Enter a colour like #0d7490.')
    .or(z.literal(''))
    .optional(),
})
export type CompanyBrandingInput = z.infer<typeof companyBrandingSchema>

/**
 * A place stock ships from.
 *
 * The radius and cut-off are the two numbers that decide whether a retailer is
 * offered Same-Day, so they live with the warehouse rather than as a platform
 * setting: one company's van does 25 km, another's does 8.
 */
export const warehouseSchema = z.object({
  name: z.string().trim().min(2, v.requiredNamed('warehouse name')).max(120, v.text.tooLong(120)),
  sameDayRadiusKm: z.number().int().min(1).max(200),
  sameDayCutoffTime: z
    .string()
    .trim()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Enter a time like 14:00.'),
  deliveryChargeRupees: z.number().min(0).max(100_000),
  freeDeliveryAboveRupees: z.number().min(0).max(10_000_000).optional(),
  isAcceptingOrders: z.boolean(),
  address: addressSchema,
})
export type WarehouseInput = z.infer<typeof warehouseSchema>

/** Editing a warehouse leaves its address alone; that is a separate action. */
export const warehouseUpdateSchema = warehouseSchema.omit({ address: true })
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>

/** Creating or editing a role. The screen sends the complete permission set. */
export const roleSchema = z.object({
  name: z.string().trim().min(2, v.requiredNamed('role name')).max(60, v.text.tooLong(60)),
  permissions: z.array(z.string().min(1)).max(200),
})
export type RoleInput = z.infer<typeof roleSchema>

export const assignRoleSchema = z.object({
  userId: z.uuid(v.requiredNamed('team member')),
  roleId: z.uuid(v.selectRequired('role')),
})
export type AssignRoleInput = z.infer<typeof assignRoleSchema>
