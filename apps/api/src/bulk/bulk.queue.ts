import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { Queue, Worker } from 'bullmq'
import { loadEnv } from '../config/env'
import { BulkProcessor } from './bulk.processor'

export const BULK_QUEUE = 'bulk-jobs'

export type BulkTask = { jobId: string; pass: 'validate' | 'apply' }

function connectionFromUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  }
}

/**
 * Producer side — the API only ever enqueues.
 *
 * The actual work happens in the worker process (`npm run worker`), so a
 * 50,000-row parse never blocks an HTTP request. Both share this queue name
 * and the Redis instance.
 */
@Injectable()
export class BulkQueue implements OnModuleDestroy {
  private readonly queue: Queue<BulkTask>

  constructor() {
    const env = loadEnv()
    this.queue = new Queue<BulkTask>(BULK_QUEUE, {
      connection: connectionFromUrl(env.REDIS_URL),
      defaultJobOptions: {
        // No automatic retries: a half-applied import re-run from the start
        // would double-create rows. Resume is explicit and checkpointed.
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    })
  }

  /**
   * No custom job id, deliberately.
   *
   * Keying the BullMQ job on `<jobId>-<pass>` looked like useful deduplication,
   * but BullMQ silently ignores an add whose id already exists — which made
   * RESUME a no-op, because the original apply job was still in the completed
   * set under that same id.
   *
   * Duplicate work is prevented by the database instead: confirm/pause/resume
   * all check the job's status first, and the processor re-reads it between
   * batches. That guard is authoritative anyway, since it survives a Redis flush.
   */
  async enqueue(task: BulkTask): Promise<void> {
    await this.queue.add(task.pass, task)
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
  }
}

/**
 * Consumer side — instantiated only by the worker entrypoint.
 *
 * Concurrency is 2: imports are I/O-bound on the database, and running more in
 * parallel mostly buys lock contention on the same tables.
 */
@Injectable()
export class BulkWorker implements OnModuleDestroy {
  private readonly logger = new Logger(BulkWorker.name)
  private worker?: Worker<BulkTask>

  constructor(private readonly processor: BulkProcessor) {}

  start(): void {
    const env = loadEnv()

    this.worker = new Worker<BulkTask>(
      BULK_QUEUE,
      async (job) => {
        const { jobId, pass } = job.data
        this.logger.log(`Starting ${pass} for job ${jobId}`)
        if (pass === 'validate') await this.processor.validate(jobId)
        else await this.processor.apply(jobId)
      },
      {
        connection: connectionFromUrl(env.REDIS_URL),
        concurrency: 2,
      },
    )

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.data.jobId} failed: ${error.message}`)
    })

    this.logger.log(`Listening on "${BULK_QUEUE}"`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close()
  }
}
