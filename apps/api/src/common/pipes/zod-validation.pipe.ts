import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common'
import { ApiErrorCode, type ApiFieldError } from '@medibridge/types'
import type { ZodType } from 'zod'
import { AppException } from '../errors/app-exception'

/**
 * Validates a request body against a shared Zod schema from @medibridge/types.
 *
 * The same schema runs in the browser via React Hook Form, so a field that
 * fails here fails there too, with the identical sentence. Failures come back
 * as a field list the form can map straight onto its inputs.
 *
 *   @Post()
 *   signUp(@Body(new ZodValidationPipe(signUpSchema)) body: SignUpInput) { ... }
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value)
    if (result.success) return result.data

    const fields: ApiFieldError[] = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))

    throw new AppException(ApiErrorCode.VALIDATION_FAILED, { fields })
  }
}

/** Convenience factory, so controllers read a little more cleanly. */
export function validate<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema)
}
