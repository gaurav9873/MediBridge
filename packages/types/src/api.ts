import { copy } from '@medibridge/copy'

/**
 * The API response envelope, and the machinery that guarantees a user never
 * sees a technical error.
 *
 * Every failure the API returns carries a stable `code`. The web app looks that
 * code up in `FRIENDLY_ERRORS` below and shows the sentence it finds. A code we
 * have not written copy for falls back to a generic apology — never to a raw
 * message, a stack trace or an SQL string.
 */

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiFieldError {
  /** Dotted path into the submitted form, e.g. "business.gstNumber". */
  field: string
  message: string
}

export interface ApiError {
  success: false
  error: {
    code: ApiErrorCode
    /** Already user-safe. Populated from FRIENDLY_ERRORS on the server. */
    message: string
    /** Present on validation failures so forms can highlight the right inputs. */
    fields?: ApiFieldError[]
    /** Correlation id, shown in small print so support can find the log line. */
    requestId?: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const ApiErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Account and licensing
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED',
  LICENSE_EXPIRED: 'LICENSE_EXPIRED',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  GST_ALREADY_REGISTERED: 'GST_ALREADY_REGISTERED',
  LICENSE_ALREADY_REGISTERED: 'LICENSE_ALREADY_REGISTERED',
  OTP_INCORRECT: 'OTP_INCORRECT',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',

  // Catalogue and stock
  MEDICINE_BLOCKED_SCHEDULE: 'MEDICINE_BLOCKED_SCHEDULE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  BELOW_MINIMUM_ORDER: 'BELOW_MINIMUM_ORDER',
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  BATCH_EXPIRED: 'BATCH_EXPIRED',

  // Ordering
  CART_EMPTY: 'CART_EMPTY',
  PRICE_CHANGED: 'PRICE_CHANGED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  ORDER_NOT_CANCELLABLE: 'ORDER_NOT_CANCELLABLE',
  DELIVERY_MODE_UNAVAILABLE: 'DELIVERY_MODE_UNAVAILABLE',
  ADDRESS_NOT_SERVICEABLE: 'ADDRESS_NOT_SERVICEABLE',
  STOCK_RESERVATION_EXPIRED: 'STOCK_RESERVATION_EXPIRED',

  // Money
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_ALREADY_PROCESSED: 'PAYMENT_ALREADY_PROCESSED',
  REFUND_NOT_ALLOWED: 'REFUND_NOT_ALLOWED',
  INCORRECT_DELIVERY_OTP: 'INCORRECT_DELIVERY_OTP',
  CASH_AMOUNT_MISMATCH: 'CASH_AMOUNT_MISMATCH',

  // Uploads
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
} as const
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode]

const v = copy.validation
const f = copy.common.feedback

/**
 * Every error code the API can return, in plain English.
 *
 * If you add a code above, add its sentence here. The exhaustive Record type
 * means TypeScript will refuse to compile until you do — which is exactly the
 * guard we want, because a missing entry is how technical text leaks out.
 */
export const FRIENDLY_ERRORS: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: 'Please check the highlighted fields and try again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  SESSION_EXPIRED: f.sessionExpired,
  FORBIDDEN: f.noAccess,
  NOT_FOUND: f.notFound,
  CONFLICT: v.server.conflict,
  RATE_LIMITED: v.server.rateLimited,
  INTERNAL_ERROR: v.server.unexpected,
  SERVICE_UNAVAILABLE: v.server.unavailable,

  INVALID_CREDENTIALS: copy.auth.signIn.errors.invalidCredentials,
  ACCOUNT_SUSPENDED: copy.auth.signIn.errors.accountSuspended,
  ACCOUNT_NOT_VERIFIED:
    'Your account is still being approved. You can place orders once our team approves your drug license.',
  LICENSE_EXPIRED: copy.auth.licenseExpired.body,
  PHONE_ALREADY_REGISTERED: v.phone.alreadyUsed,
  EMAIL_ALREADY_REGISTERED: v.email.alreadyUsed,
  GST_ALREADY_REGISTERED: v.gst.alreadyUsed,
  LICENSE_ALREADY_REGISTERED: v.drugLicense.alreadyUsed,
  OTP_INCORRECT: v.otp.incorrect,
  OTP_EXPIRED: v.otp.expired,
  OTP_TOO_MANY_ATTEMPTS: v.otp.tooManyAttempts,

  MEDICINE_BLOCKED_SCHEDULE: 'This medicine cannot be sold on MediBridge.',
  INSUFFICIENT_STOCK: v.quantity.exceedsStock,
  BELOW_MINIMUM_ORDER: 'You are ordering less than this distributor’s minimum quantity.',
  ITEM_UNAVAILABLE: 'This medicine is no longer available from this distributor.',
  BATCH_EXPIRED: 'This batch has expired and can no longer be sold.',

  CART_EMPTY: 'Your cart is empty. Add some medicines before checking out.',
  PRICE_CHANGED: copy.catalog.cart.priceChanged.body,
  INVALID_STATUS_TRANSITION: 'This order has already moved on. Please refresh to see its status.',
  ORDER_NOT_CANCELLABLE:
    'This order has already been packed, so it cannot be cancelled. Please contact our support team.',
  DELIVERY_MODE_UNAVAILABLE:
    'Same-Day Delivery is not available for this order. Please choose Next-Day.',
  ADDRESS_NOT_SERVICEABLE: v.pincode.notServiceable,
  STOCK_RESERVATION_EXPIRED:
    'We could only hold your items for 15 minutes. Please check your cart and try again.',

  PAYMENT_FAILED: copy.payments.gateway.failedBody,
  PAYMENT_VERIFICATION_FAILED:
    'We could not confirm your payment. If money left your account it will be returned within 5 to 7 working days.',
  PAYMENT_ALREADY_PROCESSED: 'This payment has already gone through. You do not need to pay again.',
  REFUND_NOT_ALLOWED: copy.payments.refund.manualReview,
  INCORRECT_DELIVERY_OTP: 'That delivery code is not correct. Please check with the retailer.',
  CASH_AMOUNT_MISMATCH: 'The amount collected does not match the balance due on this order.',

  FILE_TOO_LARGE: v.file.tooLarge(5),
  FILE_TYPE_NOT_ALLOWED: v.file.wrongType,
  UPLOAD_FAILED: v.file.uploadFailed,
}

/** Never throws, never returns a technical string. */
export function friendlyMessage(code: string | undefined): string {
  if (code && code in FRIENDLY_ERRORS) {
    return FRIENDLY_ERRORS[code as ApiErrorCode]
  }
  return v.server.unexpected
}

export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return response.success === false
}
