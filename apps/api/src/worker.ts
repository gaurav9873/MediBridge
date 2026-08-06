// Must be first: populates process.env before any module validates it.
import './bootstrap-env'

import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Logger as PinoLogger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { BulkWorker } from './bulk/bulk.queue'

/**
 * The background worker.
 *
 * A second entrypoint into the same NestJS application, deployed as its own
 * process. Parsing 50,000 spreadsheet rows is CPU work — doing it inside the
 * API process would stall every other request on the event loop.
 *
 * Same image, same code, different command:
 *   node dist/main.js     the HTTP API
 *   node dist/worker.js   this
 */
async function bootstrap(): Promise<void> {
  // No HTTP server: this process only consumes the queue.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true })
  app.useLogger(app.get(PinoLogger))
  app.enableShutdownHooks()

  app.get(BulkWorker).start()

  new Logger('Worker').log('Bulk worker started and waiting for jobs')
}

void bootstrap()
