import { createHash, randomInt } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_RESEND_SECONDS,
  CHALLENGE_TTL_SECONDS,
  type ChallengeIssued,
  type ChallengePurpose,
  type OtpSenderContract,
  maskIdentifier,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { loadEnv } from '../config/env'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

/** DI token for whatever actually delivers the code. */
export const OTP_SENDER = Symbol('OTP_SENDER')

/**
 * Issues and verifies the short-lived codes used for OTP sign-in, phone
 * confirmation and password reset.
 *
 * Every rule that makes a code safe lives here and nowhere else:
 *
 *   - it expires                       (CHALLENGE_TTL_SECONDS)
 *   - it survives few wrong guesses    (CHALLENGE_MAX_ATTEMPTS)
 *   - it works once                    (consumedAt)
 *   - it is stored hashed              (a leak yields no live codes)
 *   - it cannot be spent for something else than it was issued for (purpose)
 *
 * Three call sites share these rules rather than reimplementing them, which is
 * the whole reason there is one challenge table instead of three.
 */
@Injectable()
export class ChallengeService {
  private readonly logger = new Logger(ChallengeService.name)
  private readonly env = loadEnv()

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(OTP_SENDER) private readonly sender: OtpSenderContract,
  ) {}

  /**
   * Creates a code, sends it, and reports back what the screen needs.
   *
   * Any earlier live challenge for the same identifier and purpose is consumed
   * first. Otherwise asking for a second code would leave the first one valid,
   * and "Send code again" would quietly widen the guessing window instead of
   * replacing it.
   */
  async issue(params: {
    purpose: ChallengePurpose
    identifier: string
    userId?: string | null
    ipAddress?: string
  }): Promise<ChallengeIssued> {
    const now = new Date()

    await this.assertNotTooSoon(params.purpose, params.identifier, now)

    // randomInt is the CSPRNG; Math.random would make codes guessable.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

    await this.db.runPreTenant(async (tx) => {
      await tx.verificationChallenge.updateMany({
        where: { purpose: params.purpose, identifier: params.identifier, consumedAt: null },
        data: { consumedAt: now },
      })
      await tx.verificationChallenge.create({
        data: {
          purpose: params.purpose,
          identifier: params.identifier,
          codeHash: hash(code),
          expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000),
          userId: params.userId ?? null,
          ipAddress: params.ipAddress ?? null,
        },
      })
    })

    await this.sender.send(params.identifier, code, params.purpose)

    return {
      sentTo: maskIdentifier(params.identifier),
      issuedAt: now.toISOString(),
      expiresInSeconds: CHALLENGE_TTL_SECONDS,
      resendInSeconds: CHALLENGE_RESEND_SECONDS,
      // So nobody has to read server logs to sign in locally. Never in production.
      devCode: this.env.NODE_ENV === 'production' ? undefined : code,
    }
  }

  /**
   * Spends a code, or explains why it cannot be spent.
   *
   * Returns the challenge's `userId` so a caller that issued the code against a
   * known account does not have to look the user up again.
   *
   * A wrong code costs an attempt. Running out of attempts kills the challenge
   * rather than merely failing, so the guesser has to request a new code and
   * pass the resend delay again — which is what turns 10^6 into an unreachable
   * number rather than an afternoon's work.
   */
  async verify(params: {
    purpose: ChallengePurpose
    identifier: string
    code: string
  }): Promise<{ userId: string | null }> {
    return this.db.runPreTenant(async (tx) => {
      const challenge = await tx.verificationChallenge.findFirst({
        where: { purpose: params.purpose, identifier: params.identifier, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      })

      if (!challenge) throw new AppException(ApiErrorCode.OTP_INCORRECT)

      if (challenge.expiresAt.getTime() < Date.now()) {
        await tx.verificationChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        })
        throw new AppException(ApiErrorCode.OTP_EXPIRED)
      }

      if (challenge.codeHash !== hash(params.code)) {
        const attempts = challenge.attempts + 1
        await tx.verificationChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts,
            // Burn it rather than leaving a nearly-dead challenge around.
            consumedAt: attempts >= CHALLENGE_MAX_ATTEMPTS ? new Date() : null,
          },
        })
        if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
          this.logger.warn(`Challenge exhausted for ${maskIdentifier(params.identifier)}`)
          throw new AppException(ApiErrorCode.OTP_TOO_MANY_ATTEMPTS)
        }
        throw new AppException(ApiErrorCode.OTP_INCORRECT)
      }

      // Single use. Marked, not deleted, so a replay is distinguishable from
      // an expiry in the logs.
      await tx.verificationChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      })

      return { userId: challenge.userId }
    })
  }

  /**
   * Refuses a second code inside the resend window.
   *
   * Without this, "Send code again" is a free SMS button: an attacker can bill
   * us, and a victim's phone can be flooded.
   */
  private async assertNotTooSoon(
    purpose: ChallengePurpose,
    identifier: string,
    now: Date,
  ): Promise<void> {
    const recent = await this.db.runPreTenant((tx) =>
      tx.verificationChallenge.findFirst({
        where: {
          purpose,
          identifier,
          createdAt: { gt: new Date(now.getTime() - CHALLENGE_RESEND_SECONDS * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    )
    if (!recent) return

    const waitSeconds = Math.ceil(
      (recent.createdAt.getTime() + CHALLENGE_RESEND_SECONDS * 1000 - now.getTime()) / 1000,
    )
    throw new AppException(ApiErrorCode.OTP_RESEND_TOO_SOON, {
      fields: [
        {
          field: 'phone',
          message: `Please wait ${waitSeconds} more second${waitSeconds === 1 ? '' : 's'} before asking for a new code.`,
        },
      ],
    })
  }
}

function hash(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}
