import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'
import { loadEnv } from '../../config/env'

/**
 * Redis, used for the things Postgres is the wrong tool for:
 *   - OTP challenges, which want a TTL rather than a cleanup job
 *   - search result caching
 *   - rate limiting counters
 *   - the BullMQ notification queue (Phase 7)
 *
 * Note this connects to port 6380 in development — the Homebrew Redis already
 * running on this machine owns 6379.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  readonly client: Redis

  constructor() {
    const env = loadEnv()
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    })

    this.client.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`)
    })
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit()
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  /** Convenience wrapper — JSON in, JSON out, with a TTL in seconds. */
  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value)
    if (ttlSeconds) {
      await this.client.set(key, payload, 'EX', ttlSeconds)
    } else {
      await this.client.set(key, payload)
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      // A malformed cache entry should never take down a request.
      await this.client.del(key)
      return null
    }
  }
}
