import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type AuthCredentials,
  AuthMethod,
  type AuthProviderContract,
  type IdentityResult,
} from '@medibridge/types'
import { AppException } from '../../common/errors/app-exception'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PasswordProvider } from './password.provider'

/**
 * Every way of signing in, in one place.
 *
 * The sign-in flow is always the same three steps:
 *
 *     resolve tenant  ->  provider identifies the user  ->  issue session
 *
 * A provider only answers "which user is this?". Whether that user may sign in
 * — suspended, wrong tenant, expired licence — is decided once, centrally,
 * AFTER every provider. That is what stops each new login method growing its
 * own copy of the access rules and eventually getting one wrong.
 *
 * Adding Google is a new provider class and one line here.
 */
@Injectable()
export class AuthProviderRegistry {
  private readonly providers = new Map<AuthMethod, AuthProviderContract>()

  constructor(
    private readonly prisma: PrismaService,
    password: PasswordProvider,
  ) {
    this.register(password)
  }

  private register(provider: AuthProviderContract): void {
    this.providers.set(provider.method, provider)
  }

  /** Methods that exist in code. Not the same as methods a tenant offers. */
  available(): AuthMethod[] {
    return [...this.providers.values()].filter((p) => p.enabled).map((p) => p.method)
  }

  /** Methods this tenant has switched on, intersected with what exists. */
  async enabledFor(companyId: string | null): Promise<AuthMethod[]> {
    const built = new Set(this.available())
    if (!companyId) return [...built]

    const configured = await this.prisma.companyAuthMethod.findMany({
      where: { companyId, isEnabled: true },
      select: { method: true },
    })
    const offered = configured.map((row) => row.method as AuthMethod).filter((m) => built.has(m))
    // A tenant with nothing configured falls back to whatever is built, rather
    // than locking everyone out.
    return offered.length > 0 ? offered : [...built]
  }

  async identify(credentials: AuthCredentials, companyId: string | null): Promise<IdentityResult> {
    const provider = this.providers.get(credentials.method)
    if (!provider?.enabled) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'method', message: 'This way of signing in is not available.' }],
      })
    }

    // A tenant may switch a method off without it being removed from the build.
    if (companyId) {
      const enabled = await this.enabledFor(companyId)
      if (!enabled.includes(credentials.method)) {
        throw new AppException(ApiErrorCode.FORBIDDEN, {
          fields: [
            { field: 'method', message: 'This portal does not allow that way of signing in.' },
          ],
        })
      }
    }

    return provider.identify(credentials, companyId)
  }
}
