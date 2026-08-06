import { copy } from '@medibridge/copy'
import { z } from 'zod'
import {
  DRUG_LICENSE_PATTERN,
  GSTIN_PATTERN,
  IFSC_PATTERN,
  INDIAN_MOBILE_PATTERN,
  PINCODE_PATTERN,
  TIME_24H_PATTERN,
  normalizeGstin,
  normalizeMobile,
} from '../patterns.js'

const v = copy.validation

/**
 * Reusable field schemas.
 *
 * Every message here comes from @medibridge/copy, and these same schemas are
 * used by the NestJS validation pipe AND by React Hook Form in the browser.
 * That is the whole point: a retailer sees the identical friendly sentence
 * whether the check failed on their phone or on our server.
 */

/** Mobile number, tolerant of spaces and a +91 prefix on the way in. */
export const mobileSchema = z
  .string()
  .trim()
  .transform(normalizeMobile)
  .pipe(z.string().regex(INDIAN_MOBILE_PATTERN, v.phone.invalid))

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email(v.email.invalid))

export const passwordSchema = z
  .string()
  .min(8, v.password.tooShort)
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, v.password.needsLetterAndNumber)

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, v.otp.invalid)

export const gstinSchema = z
  .string()
  .trim()
  .transform(normalizeGstin)
  .pipe(z.string().regex(GSTIN_PATTERN, v.gst.invalid))

export const drugLicenseNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(DRUG_LICENSE_PATTERN, v.drugLicense.invalid))

export const pincodeSchema = z.string().trim().regex(PINCODE_PATTERN, v.pincode.invalid)

export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(IFSC_PATTERN, 'Please enter a valid 11-character IFSC code.'))

/** "14:00" — the Same-Day delivery cut-off. */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(TIME_24H_PATTERN, 'Please enter a time in 24-hour format, like 14:00.')

/** Money, always as whole paise. */
export const paiseSchema = z
  .number(v.number.notANumber)
  .int(v.number.wholeNumber)
  .nonnegative(v.number.positive)

export const positivePaiseSchema = paiseSchema.positive(v.price.invalid)

export const quantitySchema = z
  .number(v.number.notANumber)
  .int(v.number.wholeNumber)
  .positive(v.quantity.zero)

/**
 * A point on the map. Bounds are India's, so a mis-dragged pin is caught here
 * rather than producing a distributor "12,000 km away" in search results.
 */
export const geoPointSchema = z.object({
  latitude: z
    .number(v.address.locationRequired)
    .min(6, v.address.locationRequired)
    .max(38, v.address.locationRequired),
  longitude: z
    .number(v.address.locationRequired)
    .min(68, v.address.locationRequired)
    .max(98, v.address.locationRequired),
})
export type GeoPoint = z.infer<typeof geoPointSchema>

export const addressSchema = z.object({
  label: z.string().trim().min(1, v.requiredNamed('address name')).max(40, v.text.tooLong(40)),
  line1: z.string().trim().min(5, v.text.tooShort(5)).max(200, v.text.tooLong(200)),
  line2: z.string().trim().max(200, v.text.tooLong(200)).optional(),
  city: z.string().trim().min(2, v.requiredNamed('city')).max(80, v.text.tooLong(80)),
  state: z.string().trim().min(2, v.selectRequired('state')).max(80, v.text.tooLong(80)),
  pincode: pincodeSchema,
  contactPhone: mobileSchema,
  location: geoPointSchema,
})
export type AddressInput = z.infer<typeof addressSchema>

/** Cursor-free pagination — simple page numbers, which is what the UI shows. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type PaginationInput = z.infer<typeof paginationSchema>

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc')

/** Uploaded document limits, shared by the client-side picker and the API. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const ALLOWED_SPREADSHEET_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

export const documentUploadSchema = z.object({
  fileName: z.string().min(1, v.file.required),
  mimeType: z.enum(ALLOWED_DOCUMENT_TYPES, v.file.wrongType),
  sizeBytes: z.number().int().max(MAX_DOCUMENT_BYTES, v.file.tooLarge(5)),
})
