import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  AuthMethod,
  type ChallengeIssued,
  type SessionUser,
  changePasswordSchema,
  forgotPasswordSchema,
  requestOtpSchema,
  resetPasswordSchema,
  signUpAccountSchema,
  verifyOtpSchema,
} from '@medibridge/types'
import type { Response } from 'express'
import { validate } from '../common/pipes/zod-validation.pipe'
import { TenantContextService } from '../tenancy/tenant-context'
import { AccountService, type SessionSummary } from './account.service'
import { type AuthenticatedRequest, CurrentUser, Public, REFRESH_COOKIE } from './auth.guard'
import { AuthService } from './auth.service'
import { clearSessionCookies, writeSessionCookies } from './session-cookies'
import { TokenService } from './token.service'

/**
 * Creating and looking after an account, as opposed to proving who you are.
 *
 * Every route here is deliberately rate-limited harder than the global default:
 * each one either sends an SMS we pay for, or is worth guessing at.
 */
@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly tenant: TenantContextService,
  ) {}

  // -------------------------------------------------------------------------
  // Signing up
  // -------------------------------------------------------------------------

  @Public()
  @Post('sign-up')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account and send a confirmation code' })
  async signUp(
    @Body(validate(signUpAccountSchema)) body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ challenge: ChallengeIssued }> {
    const input = body as Parameters<AccountService['signUp']>[0]
    const { challenge } = await this.accounts.signUp(input, {
      companyId: this.tenant.companyId(),
      ipAddress: req.ip,
    })
    return { challenge }
  }

  @Public()
  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm the mobile number given at sign-up' })
  async verifyPhone(
    @Body(validate(verifyOtpSchema)) body: { phone: string; code: string },
  ): Promise<{ verified: true }> {
    await this.accounts.verifyPhone(body.phone, body.code)
    return { verified: true }
  }

  @Public()
  @Post('resend-phone-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send the sign-up confirmation code again' })
  async resendPhoneCode(
    @Body(validate(requestOtpSchema)) body: { phone: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ challenge: ChallengeIssued }> {
    return { challenge: await this.accounts.resendPhoneCode(body.phone, req.ip) }
  }

  // -------------------------------------------------------------------------
  // Signing in with a code
  // -------------------------------------------------------------------------

  @Public()
  @Post('request-sign-in-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a one-time sign-in code' })
  async requestSignInCode(
    @Body(validate(requestOtpSchema)) body: { phone: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ challenge: ChallengeIssued }> {
    return { challenge: await this.accounts.requestSignInCode(body.phone, req.ip) }
  }

  /**
   * Signs in with a code instead of a password.
   *
   * Goes through the same AuthService.signIn as a password does, so the
   * suspension, tenant and role checks cannot be skipped by choosing a
   * different login method.
   */
  @Public()
  @Post('sign-in-with-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with a one-time code' })
  async signInWithCode(
    @Body(validate(verifyOtpSchema)) body: { phone: string; code: string },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const { user, accessToken, refreshToken } = await this.auth.signIn(
      { phone: body.phone, password: body.code },
      {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
        companyId: this.tenant.companyId(),
        method: AuthMethod.OTP,
      },
    )
    writeSessionCookies(res, accessToken, refreshToken, {
      accessMs: this.tokens.accessTtlMs(),
      refreshMs: this.tokens.refreshTtlMs(),
    })
    return { user }
  }

  // -------------------------------------------------------------------------
  // Passwords
  // -------------------------------------------------------------------------

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a password reset code' })
  async forgotPassword(
    @Body(validate(forgotPasswordSchema)) body: { phone: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ challenge: ChallengeIssued }> {
    return { challenge: await this.accounts.requestPasswordReset(body.phone, req.ip) }
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Set a new password using a reset code' })
  async resetPassword(
    @Body(validate(resetPasswordSchema)) body: Parameters<AccountService['resetPassword']>[0],
  ): Promise<{ reset: true }> {
    await this.accounts.resetPassword(body)
    return { reset: true }
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the password of the signed-in account' })
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body(validate(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ changed: true }> {
    await this.accounts.changePassword(user.id, body.currentPassword, body.newPassword)
    // Changing the password revokes every session, including this one, so the
    // cookies have to go with it or the browser holds a token the server
    // already refuses.
    clearSessionCookies(res)
    return { changed: true }
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  @Get('sessions')
  @ApiOperation({ summary: 'Devices this account is signed in on' })
  async sessions(
    @CurrentUser() user: SessionUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<SessionSummary[]> {
    return this.accounts.listSessions(user.id, this.currentTokenHash(req))
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign one device out' })
  async revokeSession(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<{ revoked: true }> {
    await this.accounts.revokeSession(user.id, id)
    return { revoked: true }
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign every other device out' })
  async revokeOtherSessions(
    @CurrentUser() user: SessionUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ revoked: number }> {
    return this.accounts.revokeOtherSessions(user.id, this.currentTokenHash(req))
  }

  private currentTokenHash(req: AuthenticatedRequest): string | undefined {
    const raw = req.cookies?.[REFRESH_COOKIE]
    return raw ? this.tokens.hashToken(raw) : undefined
  }
}
