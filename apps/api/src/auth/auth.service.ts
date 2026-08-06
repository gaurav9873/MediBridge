import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode, type SessionUser, type SignInInput, UserRole } from '@medibridge/types'
import { AuthMethod } from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { PrismaService } from '../common/prisma/prisma.service'
import { AuthProviderRegistry } from './providers/auth-provider.registry'
import { TokenService } from './token.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly providers: AuthProviderRegistry,
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
    context: {
      userAgent?: string
      ipAddress?: string
      requiredRole?: UserRole
      companyId?: string | null
      /** Defaults to PASSWORD, so existing callers are unaffected. */
      method?: AuthMethod
    },
  ): Promise<{ user: SessionUser; accessToken: string; refreshToken: string }> {
    /*
     * Three steps, the same for every login method:
     *   1. a provider says WHICH user this is
     *   2. the access rules below decide whether they may sign in
     *   3. a session is issued
     *
     * Adding Google or SSO changes only step 1. The rules in step 2 are
     * written once here rather than once per provider, which is what stops a
     * new login method quietly skipping the suspension or tenant check.
     */
    const identity = await this.providers.identify(
      {
        method: context.method ?? AuthMethod.PASSWORD,
        identifier: input.phone,
        secret: input.password,
      },
      context.companyId ?? null,
    )

    const user = await this.prisma.user.findFirst({
      where: { id: identity.userId, deletedAt: null },
      include: { customerProfile: true, companyRef: true },
    })
    if (!user) throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)

    if (user.accountStatus === 'SUSPENDED') {
      throw new AppException(ApiErrorCode.ACCOUNT_SUSPENDED)
    }

    /*
     * Tenant check. Signing in on one company's portal with another company's
     * account gives the same generic error as a wrong password — otherwise the
     * login page becomes a way to discover which accounts exist where.
     */
    if (context.companyId && user.companyId && user.companyId !== context.companyId) {
      this.logger.warn(`Cross-tenant sign-in blocked: ${user.id} on ${context.companyId}`)
      throw new AppException(ApiErrorCode.INVALID_CREDENTIALS)
    }

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
      include: { customerProfile: true, companyRef: true },
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
   *
   * Buyers and sellers no longer share a shape. A buyer is a Customer of some
   * company; a seller's staff belong to the selling Company itself. Both carry
   * a trading name and a licence expiry, so the session looks the same either
   * way — but they are read from different places.
   */
  private toSessionUser(user: {
    id: string
    companyId: string | null
    fullName: string
    phone: string
    email: string
    role: string
    accountStatus: string
    customerProfile: { businessName: string; licenseExpiresOn: Date | null } | null
    companyRef: { name: string; licenseExpiresOn: Date | null } | null
  }): SessionUser {
    const businessName = user.customerProfile?.businessName ?? user.companyRef?.name ?? null
    const licenseExpiresOn =
      user.customerProfile?.licenseExpiresOn ?? user.companyRef?.licenseExpiresOn ?? null

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
      businessName,
      canPlaceOrders,
      licenseExpiresOn: licenseExpiresOn ? licenseExpiresOn.toISOString().slice(0, 10) : null,
    }
  }
}
