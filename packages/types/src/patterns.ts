/**
 * Format rules for Indian business identifiers, kept in one place so the API,
 * the web app and the seed script all agree on what "valid" means.
 */

/**
 * GSTIN: 2-digit state code, 10-character PAN, 1 entity digit, 'Z', 1 checksum.
 * e.g. 27AAPFU0939F1ZV
 */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** Indian mobile numbers start 6–9 and have 10 digits. */
export const INDIAN_MOBILE_PATTERN = /^[6-9][0-9]{9}$/

/** 6-digit PIN code, never starting with 0. */
export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/

/** IFSC: 4 letters, '0', then 6 alphanumerics. e.g. HDFC0001234 */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

/** PAN: 5 letters, 4 digits, 1 letter. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/**
 * Drug licence numbers vary by state and have no single national format, so
 * this is deliberately loose — letters, digits, hyphens and slashes, 5 to 40
 * characters. The real check is a human reading the uploaded document.
 */
export const DRUG_LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-/ ]{3,38}[A-Za-z0-9]$/

/** HSN codes for pharmaceuticals are 4 to 8 digits. */
export const HSN_PATTERN = /^[0-9]{4,8}$/

/** 24-hour time, used for the Same-Day delivery cut-off. */
export const TIME_24H_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** Strips spaces, dashes and a +91 prefix down to bare 10 digits. */
export function normalizeMobile(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

/** Display form: "98765 43210". */
export function formatMobile(mobile: string): string {
  const digits = normalizeMobile(mobile)
  if (digits.length !== 10) return mobile
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

/** GST numbers are stored and compared uppercase. */
export function normalizeGstin(input: string): string {
  return input.replace(/\s/g, '').toUpperCase()
}

/** GST rates permitted on pharmaceutical products in India. */
export const ALLOWED_GST_RATES = [0, 5, 12, 18] as const
export type GstRate = (typeof ALLOWED_GST_RATES)[number]
