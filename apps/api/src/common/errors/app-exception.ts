import { HttpException, HttpStatus } from '@nestjs/common'
import { ApiErrorCode, type ApiFieldError, friendlyMessage } from '@medibridge/types'

/**
 * The only exception type application code should throw.
 *
 * Callers pick an error CODE, never a message. The message is looked up from
 * the shared copy layer, which is what guarantees the retailer sees the same
 * friendly sentence the frontend would have shown.
 */
export class AppException extends HttpException {
  readonly code: ApiErrorCode
  readonly fields?: ApiFieldError[]

  constructor(code: ApiErrorCode, options?: { fields?: ApiFieldError[]; status?: HttpStatus }) {
    const status = options?.status ?? STATUS_BY_CODE[code] ?? HttpStatus.BAD_REQUEST
    super({ code, message: friendlyMessage(code) }, status)
    this.code = code
    this.fields = options?.fields
  }
}

/** HTTP status for each domain error. Kept beside the codes so they cannot drift. */
const STATUS_BY_CODE: Partial<Record<ApiErrorCode, HttpStatus>> = {
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  SESSION_EXPIRED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  ACCOUNT_SUSPENDED: HttpStatus.FORBIDDEN,
  ACCOUNT_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  LICENSE_EXPIRED: HttpStatus.FORBIDDEN,
  MEDICINE_BLOCKED_SCHEDULE: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  PHONE_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  EMAIL_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  GST_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  LICENSE_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  PRICE_CHANGED: HttpStatus.CONFLICT,
  INVALID_STATUS_TRANSITION: HttpStatus.CONFLICT,
  PAYMENT_ALREADY_PROCESSED: HttpStatus.CONFLICT,
  INSUFFICIENT_STOCK: HttpStatus.CONFLICT,
  STOCK_RESERVATION_EXPIRED: HttpStatus.GONE,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  OTP_TOO_MANY_ATTEMPTS: HttpStatus.TOO_MANY_REQUESTS,
  FILE_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  FILE_TYPE_NOT_ALLOWED: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
}

/** Shorthands for the codes thrown most often. */
export const AppErrors = {
  notFound: () => new AppException(ApiErrorCode.NOT_FOUND),
  forbidden: () => new AppException(ApiErrorCode.FORBIDDEN),
  unauthenticated: () => new AppException(ApiErrorCode.UNAUTHENTICATED),
  validation: (fields: ApiFieldError[]) =>
    new AppException(ApiErrorCode.VALIDATION_FAILED, { fields }),
} as const
