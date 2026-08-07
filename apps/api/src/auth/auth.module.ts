import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { APP_GUARD } from '@nestjs/core'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { OTP_SENDER, ChallengeService } from './challenge.service'
import { PermissionGuard } from './permission.guard'
import { AuthProviderRegistry } from './providers/auth-provider.registry'
import { OtpProvider } from './providers/otp.provider'
import { PasswordProvider } from './providers/password.provider'
import { ConsoleOtpSender } from './senders/console-otp.sender'
import { TokenService } from './token.service'

/**
 * AuthGuard is registered globally, so every route is protected by default and
 * must opt out with @Public(). Getting that the wrong way round — protecting
 * routes one by one — is how endpoints end up accidentally open.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    ChallengeService,
    TokenService,
    PasswordProvider,
    OtpProvider,
    AuthProviderRegistry,
    PermissionGuard,
    // Swapping in a real SMS gateway is this one line: a class implementing
    // OtpSenderContract, bound to the same token. Nothing about how codes are
    // generated, expired, counted or spent changes with it.
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
    { provide: APP_GUARD, useClass: AuthGuard },
    // Runs after AuthGuard, so request.user is populated by the time it checks.
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, AccountService, ChallengeService, TokenService, AuthProviderRegistry],
})
export class AuthModule {}
