import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  AuthMethod,
  type ChallengeIssued,
  ChallengePurpose,
  type ResetPasswordInput,
  type SignUpAccountInput,
} from '@medibridge/types'
import argon2 from 'argon2'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'
import { ChallengeService } from './challenge.service'

/** One active sign-in, as the account screen shows it. */
export interface SessionSummary {
  id: string
  device: string
  ipAddress: string | null
  signedInAt: string
  lastSeenAt: string
  /** The session making this request. The UI must not offer to revoke it. */
  isCurrent: boolean
}

/**
 * Everything about an account other than proving who you are.
 *
 * Signing up, confirming a phone number, resetting a forgotten password,
 * changing a known one, and seeing where you are signed in. AuthService stays
 * responsible for turning a credential into a session; this turns a person into
 * an account and lets them look after it.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)

  constructor(
    private readonly db: TenantPrismaService,
    private readonly challenges: ChallengeService,
  ) {}

  // -------------------------------------------------------------------------
  // Signing up
  // -------------------------------------------------------------------------

  /**
   * Creates an account and sends a code to confirm the mobile number.
   *
   * The account starts `PENDING_VERIFICATION` and stays there: confirming the
   * phone proves the number is real, but a pharmacy cannot buy medicines until
   * an admin has seen its drug licence. Those are different questions and this
   * only answers the first.
   *
   * What this deliberately does NOT create is the business record — the
   * `Customer` for a buyer, or the seller `Company` and `Warehouse` for a
   * distributor. Those need a GST number and a licence, and belong to
   * onboarding. Sign-up produces a person who can sign in; onboarding produces
   * a business that can trade.
   */
  async signUp(
    input: SignUpAccountInput,
    context: { companyId: string | null; ipAddress?: string },
  ): Promise<{ userId: string; challenge: ChallengeIssued }> {
    if (!context.companyId) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [
          {
            field: 'phone',
            message: 'We could not tell which store you are signing up to. Please use the link you were given.',
          },
        ],
      })
    }

    const company = await this.db.runPreTenant((tx) =>
      tx.company.findUnique({
        where: { id: context.companyId! },
        select: { id: true, businessMode: true, status: true },
      }),
    )

    // A private distributor's customers are invited, not walk-ins. Letting
    // anyone self-register there would put strangers inside a private portal.
    if (!company || company.businessMode !== 'MARKETPLACE') {
      throw new AppException(ApiErrorCode.FORBIDDEN, {
        fields: [
          {
            field: 'phone',
            message: 'This store does not accept new sign-ups online. Please contact them directly.',
          },
        ],
      })
    }

    await this.assertIdentifiersFree(input.phone, input.email)

    const passwordHash = await argon2.hash(input.password)

    const user = await this.db.runPreTenant(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId: company.id,
          phone: input.phone,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          accountStatus: 'PENDING_VERIFICATION',
        },
      })

      // The password lives on an identity row, so adding Google later is a new
      // row rather than a new column on User.
      await tx.userIdentity.create({
        data: {
          userId: created.id,
          method: AuthMethod.PASSWORD,
          identifier: input.phone,
          secretHash: passwordHash,
          isVerified: false,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: created.id,
          action: 'SIGN_UP',
          entityType: 'User',
          entityId: created.id,
          after: { role: input.role, phone: input.phone, email: input.email },
        },
      })

      return created
    })

    const challenge = await this.challenges.issue({
      purpose: ChallengePurpose.VERIFY_PHONE,
      identifier: input.phone,
      userId: user.id,
      ipAddress: context.ipAddress,
    })

    return { userId: user.id, challenge }
  }

  /** Re-sends the sign-up confirmation code. */
  async resendPhoneCode(phone: string, ipAddress?: string): Promise<ChallengeIssued> {
    const user = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true } }),
    )
    return this.challenges.issue({
      purpose: ChallengePurpose.VERIFY_PHONE,
      identifier: phone,
      userId: user?.id ?? null,
      ipAddress,
    })
  }

  /**
   * Confirms the mobile number given at sign-up.
   *
   * Marks the phone verified and the password identity trusted. The account
   * stays `PENDING_VERIFICATION` — an admin still has to approve the licence.
   */
  async verifyPhone(phone: string, code: string): Promise<{ userId: string }> {
    await this.challenges.verify({
      purpose: ChallengePurpose.VERIFY_PHONE,
      identifier: phone,
      code,
    })

    const user = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true, companyId: true } }),
    )
    if (!user) throw new AppException(ApiErrorCode.NOT_FOUND)

    await this.db.runPreTenant(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } })
      await tx.userIdentity.updateMany({
        where: { userId: user.id, method: AuthMethod.PASSWORD },
        data: { isVerified: true },
      })
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'VERIFY_PHONE',
          entityType: 'User',
          entityId: user.id,
        },
      })
    })

    return { userId: user.id }
  }

  // -------------------------------------------------------------------------
  // Signing in with a code
  // -------------------------------------------------------------------------

  /**
   * Sends a sign-in code.
   *
   * Succeeds identically whether or not the number is registered. Answering
   * "no such account" here would turn the login page into a way to discover
   * which pharmacies use MediBridge — the same reason a wrong password and an
   * unknown number give one shared error.
   */
  async requestSignInCode(phone: string, ipAddress?: string): Promise<ChallengeIssued> {
    const user = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true } }),
    )
    if (!user) this.logger.warn(`Sign-in code requested for an unregistered number`)

    return this.challenges.issue({
      purpose: ChallengePurpose.SIGN_IN,
      identifier: phone,
      userId: user?.id ?? null,
      ipAddress,
    })
  }

  // -------------------------------------------------------------------------
  // Passwords
  // -------------------------------------------------------------------------

  /**
   * Starts a password reset.
   *
   * Neutral by design, exactly like requestSignInCode: the response is the same
   * for a registered and an unregistered number, and the copy layer says "if
   * that number is registered with us" rather than "we have sent a code".
   */
  async requestPasswordReset(phone: string, ipAddress?: string): Promise<ChallengeIssued> {
    const user = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true } }),
    )

    return this.challenges.issue({
      purpose: ChallengePurpose.RESET_PASSWORD,
      identifier: phone,
      userId: user?.id ?? null,
      ipAddress,
    })
  }

  /**
   * Sets a new password against a reset code.
   *
   * Every existing session is revoked. If the reset was triggered because
   * someone else had the account, leaving their session alive would make the
   * new password pointless.
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await this.challenges.verify({
      purpose: ChallengePurpose.RESET_PASSWORD,
      identifier: input.phone,
      code: input.code,
    })

    const user = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({
        where: { phone: input.phone, deletedAt: null },
        select: { id: true, companyId: true },
      }),
    )
    // A correct code for a number with no account: nothing to do, and still
    // nothing said about whether the account exists.
    if (!user) return

    await this.applyNewPassword(user.id, user.companyId, input.newPassword, input.phone)
  }

  /** Changes the password of someone already signed in. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const identity = await this.db.runPreTenant((tx) =>
      tx.userIdentity.findFirst({
        where: { userId, method: AuthMethod.PASSWORD },
        select: { id: true, secretHash: true, identifier: true, user: { select: { companyId: true } } },
      }),
    )
    if (!identity?.secretHash) throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)

    const matches = await argon2.verify(identity.secretHash, currentPassword).catch(() => false)
    if (!matches) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [
          { field: 'currentPassword', message: 'That is not your current password.' },
        ],
      })
    }

    await this.applyNewPassword(
      userId,
      identity.user.companyId,
      newPassword,
      identity.identifier,
    )
  }

  private async applyNewPassword(
    userId: string,
    companyId: string | null,
    newPassword: string,
    identifier: string,
  ): Promise<void> {
    const passwordHash = await argon2.hash(newPassword)

    await this.db.runPreTenant(async (tx) => {
      await tx.userIdentity.updateMany({
        where: { userId, method: AuthMethod.PASSWORD },
        data: { secretHash: passwordHash },
      })
      // Legacy column, kept in step with the identity row until it is removed.
      await tx.user.update({ where: { id: userId }, data: { passwordHash } })

      // Every device, including this one. A password change is the moment to
      // start clean.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          companyId,
          actorId: userId,
          action: 'CHANGE_PASSWORD',
          entityType: 'User',
          entityId: userId,
        },
      })
    })

    this.logger.log(`Password changed and sessions revoked for ${identifier.slice(-4)}`)
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  /** Where this account is currently signed in. */
  async listSessions(userId: string, currentTokenHash?: string): Promise<SessionSummary[]> {
    const tokens = await this.db.runPreTenant((tx) =>
      tx.refreshToken.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    )

    return tokens.map((token) => ({
      id: token.id,
      device: describeDevice(token.userAgent),
      ipAddress: token.ipAddress,
      signedInAt: token.createdAt.toISOString(),
      lastSeenAt: token.createdAt.toISOString(),
      isCurrent: currentTokenHash !== undefined && token.tokenHash === currentTokenHash,
    }))
  }

  /** Signs one device out. */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.db.runPreTenant((tx) =>
      tx.refreshToken.updateMany({
        // Scoped to the owner, so a guessed id cannot sign someone else out.
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    )
    if (result.count === 0) throw new AppException(ApiErrorCode.NOT_FOUND)
  }

  /** Signs every other device out, keeping this one. */
  async revokeOtherSessions(userId: string, currentTokenHash?: string): Promise<{ revoked: number }> {
    const result = await this.db.runPreTenant((tx) =>
      tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
        },
        data: { revokedAt: new Date() },
      }),
    )
    return { revoked: result.count }
  }

  // -------------------------------------------------------------------------

  /**
   * Refuses a phone or email already in use.
   *
   * Sign-up can say so plainly: unlike sign-in, the person is claiming this
   * identifier is theirs, and "that number is already registered" is the only
   * useful answer. The unique constraints behind these are the real guard —
   * this exists to produce a sentence instead of a 500.
   */
  private async assertIdentifiersFree(phone: string, email: string): Promise<void> {
    const existing = await this.db.runPreTenant((tx) =>
      tx.user.findFirst({
        where: { OR: [{ phone }, { email }], deletedAt: null },
        select: { phone: true, email: true },
      }),
    )
    if (!existing) return

    if (existing.phone === phone) throw new AppException(ApiErrorCode.PHONE_ALREADY_REGISTERED)
    throw new AppException(ApiErrorCode.EMAIL_ALREADY_REGISTERED)
  }
}

/**
 * A user agent string, rendered as something a pharmacist recognises.
 *
 * "Chrome on Android" is what someone can match against the phone in their
 * hand. The raw string is not.
 */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'

  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Browser'

  const platform =
    /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent) ? 'iPhone or iPad'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'Mac'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'this device'

  return `${browser} on ${platform}`
}
