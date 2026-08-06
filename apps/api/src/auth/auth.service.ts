import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode, type SessionUser, type SignInInput, UserRole } from '@medibridge/types'
import argon2 from 'argon2'
import { AppException } from '../common/errors/app-exception'
import { PrismaService } from '../common/prisma/prisma.service'
import { TokenService } from './token.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Verifies credentials and returns the session.
   *
   * Deliberately gives the same INVALID_CREDENTIALS error for an unknown phone
   * number and a wrong password. Distinguishing them would let anyone probe
   * which pharmacies are registered on the platform.
   */
  async signIn(
    input: SignInInput,
    context: { userAgent?: string; ipAddress?: string; requiredRole?: UserRole },
  ): Promise<{ user: SessionUser; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findFirst({
      where: { phone: input.phone, deletedAt: null },
      include: { retailerProfile: true, distributorProfile: true },
    })

    if (!user) {
      // Hash anyway so a missing account does not answer measurably faster
      // than a wrong password.
      await argon2.hash(input.password).catch(() => undefined)
      throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)
    }

    const passwordMatches = await argon2
      .verify(user.passwordHash, input.password)
      .catch(() => false)
    if (!passwordMatches) {
      throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)
    }

    if (user.accountStatus === 'SUSPENDED') {
      throw new AppException(ApiErrorCode.ACCOUNT_SUSPENDED)
    }

    /*
     * Role gate for the admin sign-in page. A retailer typing their details
     * into /admin/login gets the same generic error rather than "wrong portal",
     * which would confirm their account exists.
     */
    if (context.requiredRole && user.role !== context.requiredRole) {
      this.logger.warn(
        `Role mismatch on sign-in: ${user.id} tried a ${context.requiredRole} portal`,
      )
      throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)
    }

    const accessToken = this.tokens.signAccessToken({ sub: user.id, role: user.role, tv: 0 })
    const refreshToken = await this.tokens.issueRefreshToken(user.id, context)

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    return { user: this.toSessionUser(user), accessToken, refreshToken }
  }

  async refresh(
    rawRefreshToken: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<{ user: SessionUser; accessToken: string; refreshToken: string }> {
    const rotated = await this.tokens.rotateRefreshToken(rawRefreshToken, context)
    if (!rotated) throw new AppException(ApiErrorCode.SESSION_EXPIRED)

    const user = await this.findSessionUser(rotated.userId)
    if (!user) throw new AppException(ApiErrorCode.SESSION_EXPIRED)

    const accessToken = this.tokens.signAccessToken({
      sub: rotated.userId,
      role: user.role,
      tv: 0,
    })

    return { user, accessToken, refreshToken: rotated.refreshToken }
  }

  async signOut(rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) await this.tokens.revokeRefreshToken(rawRefreshToken)
  }

  async findSessionUser(userId: string): Promise<SessionUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { retailerProfile: true, distributorProfile: true },
    })
    if (!user) return null
    if (user.accountStatus === 'SUSPENDED') return null
    return this.toSessionUser(user)
  }

  /**
   * Maps a database row to what the browser is allowed to know.
   *
   * `canPlaceOrders` is computed here rather than in the UI so the rule lives
   * in exactly one place: the account must be active AND hold a licence that
   * has not expired. Admins are never order-placers.
   */
  private toSessionUser(user: {
    id: string
    companyId: string | null
    fullName: string
    phone: string
    email: string
    role: string
    accountStatus: string
    retailerProfile: { businessName: string; licenseExpiresOn: Date | null } | null
    distributorProfile: { businessName: string; licenseExpiresOn: Date | null } | null
  }): SessionUser {
    const profile = user.retailerProfile ?? user.distributorProfile
    const licenseExpiresOn = profile?.licenseExpiresOn ?? null

    const licenceValid = licenseExpiresOn !== null && licenseExpiresOn.getTime() > Date.now()

    const canPlaceOrders =
      user.accountStatus === 'ACTIVE' &&
      (user.role === UserRole.RETAILER || user.role === UserRole.DISTRIBUTOR) &&
      licenceValid

    return {
      id: user.id,
      companyId: user.companyId ?? null,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role as UserRole,
      accountStatus: user.accountStatus,
      businessName: profile?.businessName ?? null,
      canPlaceOrders,
      licenseExpiresOn: licenseExpiresOn ? licenseExpiresOn.toISOString().slice(0, 10) : null,
    }
  }
}
