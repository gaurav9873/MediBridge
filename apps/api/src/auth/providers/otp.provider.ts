import { Injectable } from '@nestjs/common'
import {
  ApiErrorCode,
  type AuthCredentials,
  AuthMethod,
  type AuthProviderContract,
  ChallengePurpose,
  type IdentityResult,
} from '@medibridge/types'
import { AppException } from '../../common/errors/app-exception'
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service'
import { ChallengeService } from '../challenge.service'

/**
 * Mobile number + one-time code.
 *
 * This is the whole cost of adding a login method: one class and one line in
 * the module. It identifies and nothing else — suspension, tenant and role
 * checks are AuthService's job, written once, so a new provider cannot
 * accidentally skip them.
 *
 * A code proves control of the number, so the identity comes back `verified`
 * even if the account never confirmed its phone by another route.
 */
@Injectable()
export class OtpProvider implements AuthProviderContract {
  readonly method = AuthMethod.OTP
  readonly enabled = true

  constructor(
    private readonly db: TenantPrismaService,
    private readonly challenges: ChallengeService,
  ) {}

  async identify(credentials: AuthCredentials): Promise<IdentityResult> {
    const identifier = String(credentials.identifier ?? '')
    const code = String(credentials.secret ?? '')

    // Throws OTP_INCORRECT / OTP_EXPIRED / OTP_TOO_MANY_ATTEMPTS, all of which
    // reach the user as sentences from the copy layer.
    await this.challenges.verify({
      purpose: ChallengePurpose.SIGN_IN,
      identifier,
      code,
    })

    const user = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({
        where: { phone: identifier, deletedAt: null },
        select: { id: true },
      }),
    )

    // Requesting a code for an unregistered number succeeds silently — see
    // AuthService.requestSignInCode — so the "no such user" case only surfaces
    // here, after a correct code, and still says nothing specific.
    if (!user) throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)

    const identity = await this.db.runPreTenant((tx) =>
      tx.userIdentity.upsert({
        where: { method_identifier: { method: this.method, identifier } },
        create: {
          userId: user.id,
          method: this.method,
          identifier,
          isVerified: true,
          lastUsedAt: new Date(),
        },
        update: { lastUsedAt: new Date(), isVerified: true },
      }),
    )

    return {
      userId: user.id,
      identityId: identity.id,
      method: this.method,
      verified: true,
    }
  }
}
