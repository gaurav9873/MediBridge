import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import path from 'node:path'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { BulkModule } from './bulk/bulk.module'
import { PrismaModule } from './common/prisma/prisma.module'
import { RedisModule } from './common/redis/redis.module'
import { HealthModule } from './health/health.module'
import { SearchModule } from './search/search.module'
import { loadEnv } from './config/env'

const env = loadEnv()

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Single .env at the repo root, shared by both apps.
      envFilePath: path.resolve(__dirname, '../../../.env'),
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // Never log credentials or tokens, in any environment.
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.confirmPassword',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.otp',
          'req.body.code',
        ],
        autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
      },
    }),

    // A blunt global cap. Auth and payment endpoints get tighter limits of
    // their own in Phase 2 and Phase 5.
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 120 }]),

    PrismaModule,
    RedisModule,
    AuthModule,
    BulkModule,
    HealthModule,
    AdminModule,
    SearchModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
