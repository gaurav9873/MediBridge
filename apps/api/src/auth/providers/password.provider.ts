import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type AuthCredentials,
  AuthMethod,
  type AuthProviderContract,
  type IdentityResult,
} from '@medibridge/types'
import argon2 from 'argon2'
import { AppException } from '../../common/errors/app-exception'
import { PrismaService } from '../../common/prisma/prisma.service'

/**
 * Mobile number + password.
 *
 * Identifies only. It deliberately does not check account status, tenant or
 * licence — those are the same for every login method, so they live once in
 * AuthService rather than being re-implemented per provider.
 */
@Injectable()
export class PasswordProvider implements AuthProviderContract {
  readonly method = AuthMethod.PASSWORD
  readonly enabled = true

  constructor(private readonly prisma: PrismaService) {}

  async identify(credentials: AuthCredentials): Promise<IdentityResult> {
    const identifier = String(credentials.identifier ?? '')
    const secret = String(credentials.secret ?? '')

    const identity = await this.prisma.userIdentity.findUnique({
      where: { method_identifier: { method: this.method, identifier } },
    })

    if (!identity?.secretHash) {
      // Hash anyway so an unknown identifier does not answer measurably faster
      // than a wrong password.
      await argon2.hash(secret).catch(() => undefined)
      throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)
    }

    const matches = await argon2.verify(identity.secretHash, secret).catch(() => false)
    if (!matches) throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)

    await this.prisma.userIdentity.update({
      where: { id: identity.id },
      data: { lastUsedAt: new Date() },
    })

    return {
      userId: identity.userId,
      identityId: identity.id,
      method: this.method,
      verified: identity.isVerified,
    }
  }
}
