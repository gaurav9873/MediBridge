import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { ApiSuccess } from '@medibridge/types'
import { type Observable, map } from 'rxjs'

/**
 * Wraps every successful response in `{ success: true, data }`.
 *
 * Errors are wrapped by AllExceptionsFilter into `{ success: false, error }`,
 * so the web app can branch on one field for every call it makes rather than
 * guessing at each endpoint's shape.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    return next.handle().pipe(map((data) => ({ success: true as const, data })))
  }
}
