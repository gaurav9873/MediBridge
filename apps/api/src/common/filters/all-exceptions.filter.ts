import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { ApiErrorCode, type ApiError, friendlyMessage } from '@medibridge/types'
import type { Request, Response } from 'express'
import { AppException } from '../errors/app-exception'

/**
 * The last line of defence for the "never show a technical error" rule.
 *
 * Every failure — a thrown AppException, a Nest HttpException, a Prisma unique
 * violation, a null dereference — leaves through here and comes out as the same
 * shape, carrying a sentence written for a pharmacy owner rather than for a
 * developer. The real error is logged with a request id; the client gets only
 * the code, the friendly message, and that id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception')

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const requestId = (request.headers['x-request-id'] as string) ?? crypto.randomUUID()

    const { status, body, logLevel, internal } = this.describe(exception, requestId)

    if (logLevel === 'error') {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${body.error.code}] ${internal}`,
        exception instanceof Error ? exception.stack : undefined,
      )
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} [${body.error.code}]`)
    }

    response.status(status).json(body)
  }

  private describe(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ApiError; logLevel: 'warn' | 'error'; internal: string } {
    // 1. Our own domain errors — already carry a user-safe message.
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: {
            code: exception.code,
            message: friendlyMessage(exception.code),
            ...(exception.fields ? { fields: exception.fields } : {}),
            requestId,
          },
        },
        logLevel: exception.getStatus() >= 500 ? 'error' : 'warn',
        internal: exception.message,
      }
    }

    // 2. Prisma errors. These leak table and constraint names, so they are
    //    translated rather than passed through.
    const prismaCode = this.prismaErrorCode(exception)
    if (prismaCode) {
      return {
        status: prismaCode === ApiErrorCode.NOT_FOUND ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT,
        body: {
          success: false,
          error: { code: prismaCode, message: friendlyMessage(prismaCode), requestId },
        },
        logLevel: 'warn',
        internal: exception instanceof Error ? exception.message : 'prisma error',
      }
    }

    // 3. Nest's built-in exceptions (guards, 404s, payload limits). We keep the
    //    status but replace the message — "Cannot POST /api/v1/x" helps nobody.
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const code = CODE_BY_STATUS[status] ?? ApiErrorCode.INTERNAL_ERROR
      return {
        status,
        body: {
          success: false,
          error: { code, message: friendlyMessage(code), requestId },
        },
        logLevel: status >= 500 ? 'error' : 'warn',
        internal: exception.message,
      }
    }

    // 4. Anything else is a bug. Log it fully, tell the user nothing about it.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: ApiErrorCode.INTERNAL_ERROR,
          message: friendlyMessage(ApiErrorCode.INTERNAL_ERROR),
          requestId,
        },
      },
      logLevel: 'error',
      internal: exception instanceof Error ? exception.message : String(exception),
    }
  }

  /** Maps the Prisma error codes we can act on. Everything else stays a 500. */
  private prismaErrorCode(exception: unknown): ApiErrorCode | null {
    if (typeof exception !== 'object' || exception === null) return null
    const code = (exception as { code?: unknown }).code
    if (typeof code !== 'string') return null

    switch (code) {
      case 'P2002': // unique constraint
        return ApiErrorCode.CONFLICT
      case 'P2025': // record not found
        return ApiErrorCode.NOT_FOUND
      case 'P2003': // foreign key constraint
      case 'P2014': // required relation violation
        return ApiErrorCode.CONFLICT
      default:
        return null
    }
  }
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ApiErrorCode.FILE_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ApiErrorCode.FILE_TYPE_NOT_ALLOWED,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ApiErrorCode.SERVICE_UNAVAILABLE,
}
