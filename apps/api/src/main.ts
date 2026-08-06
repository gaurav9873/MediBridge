// Must be first: populates process.env before any module validates it.
import './bootstrap-env'

import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { Logger as PinoLogger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { corsOrigins, loadEnv } from './config/env'

async function bootstrap(): Promise<void> {
  const env = loadEnv()

  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(PinoLogger))

  app.use(helmet())
  // The session lives in httpOnly cookies, so they have to be parsed before
  // AuthGuard can read them.
  app.use(cookieParser())
  app.enableCors({
    origin: corsOrigins(env),
    // Required for the browser to send and accept the session cookies.
    credentials: true,
  })

  app.setGlobalPrefix(env.API_PREFIX)

  // Envelope every success as { success: true, data }, every failure as
  // { success: false, error: { code, message } } with a user-safe message.
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  // Deliberately no global class-validator ValidationPipe. All validation goes
  // through ZodValidationPipe against the schemas in @medibridge/types, so the
  // browser and the server enforce identical rules with identical wording.
  // Two validation stacks would mean two sets of error messages to keep in step.

  app.enableShutdownHooks()

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('MediBridge B2B API')
      .setDescription('Medicine procurement platform — retailers, distributors and admin.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config))
  }

  await app.listen(env.API_PORT)

  const logger = new Logger('Bootstrap')
  logger.log(`API listening on http://localhost:${env.API_PORT}/${env.API_PREFIX}`)
  if (env.NODE_ENV !== 'production') {
    logger.log(`Swagger docs at http://localhost:${env.API_PORT}/docs`)
  }
}

void bootstrap()
