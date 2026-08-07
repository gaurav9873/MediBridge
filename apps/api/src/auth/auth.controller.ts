import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  ApiErrorCode,
  type SessionUser,
  type SignInInput,
  UserRole,
  signInSchema,
} from '@medibridge/types'
import type { Response } from 'express'
import { AppException } from '../common/errors/app-exception'
import { validate } from '../common/pipes/zod-validation.pipe'
import { loadEnv } from '../config/env'
import { AuthService } from './auth.service'
import { type AuthenticatedRequest, CurrentUser, Public, REFRESH_COOKIE } from './auth.guard'
import { TenantContextService } from '../tenancy/tenant-context'
import { clearSessionCookies, writeSessionCookies } from './session-cookies'
import { TokenService } from './token.service'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly env = loadEnv()

  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly tenant: TenantContextService,
  ) {}

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  // Tighter than the global limit: sign-in is the endpoint worth brute-forcing.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with mobile number and password' })
  async signIn(
    @Body(validate(signInSchema)) body: SignInInput,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const { user, accessToken, refreshToken } = await this.auth.signIn(body, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
      // Which portal this arrived on. AuthService refuses a credential that
      // belongs to a different company; omitting it silently disabled that.
      companyId: this.tenant.companyId(),
    })
    writeSessionCookies(res, accessToken, refreshToken, {
      accessMs: this.tokens.accessTtlMs(),
      refreshMs: this.tokens.refreshTtlMs(),
    })
    return { user }
  }

  /**
   * Admin portal sign-in.
   *
   * Same credentials check, but rejects anyone who is not an ADMIN — so the
   * admin panel cannot be entered with a retailer's password.
   */
  @Public()
  @Post('admin/sign-in')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in to the admin panel' })
  async adminSignIn(
    @Body(validate(signInSchema)) body: SignInInput,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const { user, accessToken, refreshToken } = await this.auth.signIn(body, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
      requiredRole: UserRole.ADMIN,
      companyId: this.tenant.companyId(),
    })
    writeSessionCookies(res, accessToken, refreshToken, {
      accessMs: this.tokens.accessTtlMs(),
      refreshMs: this.tokens.refreshTtlMs(),
    })
    return { user }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new session' })
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const raw = req.cookies?.[REFRESH_COOKIE]
    if (!raw) {
      clearSessionCookies(res)
      throw new AppException(ApiErrorCode.SESSION_EXPIRED)
    }

    try {
      const { user, accessToken, refreshToken } = await this.auth.refresh(raw, {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
      })
      writeSessionCookies(res, accessToken, refreshToken, {
      accessMs: this.tokens.accessTtlMs(),
      refreshMs: this.tokens.refreshTtlMs(),
    })
      return { user }
    } catch (error) {
      // A dead refresh token should not leave stale cookies behind.
      clearSessionCookies(res)
      throw error
    }
  }

  @Get('me')
  @ApiOperation({ summary: 'The currently signed-in user' })
  me(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user }
  }

  @Public()
  @Post('sign-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out and clear the session' })
  async signOut(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ signedOut: true }> {
    await this.auth.signOut(req.cookies?.[REFRESH_COOKIE])
    clearSessionCookies(res)
    return { signedOut: true }
  }
}
