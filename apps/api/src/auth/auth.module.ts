import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'

/**
 * AuthGuard is registered globally, so every route is protected by default and
 * must opt out with @Public(). Getting that the wrong way round — protecting
 * routes one by one — is how endpoints end up accidentally open.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
