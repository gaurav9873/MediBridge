import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/auth.guard'
import { PrismaService } from '../common/prisma/prisma.service'
import { RedisService } from '../common/redis/redis.service'

// Load balancers and uptime checks cannot sign in.
@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  liveness(): { status: string } {
    return { status: 'ok' }
  }

  /**
   * Readiness checks the dependencies a request actually needs. PostGIS is
   * included deliberately: without the extension the delivery-radius query
   * fails at request time rather than at boot, which is far harder to spot.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — database, PostGIS and Redis' })
  async readiness(): Promise<{
    status: string
    database: boolean
    postgis: string | null
    redis: boolean
  }> {
    const [database, postgis, redis] = await Promise.all([
      this.prisma.ping().catch(() => false),
      this.prisma.postgisVersion(),
      this.redis.ping(),
    ])

    const healthy = database && redis && postgis !== null
    return {
      status: healthy ? 'ok' : 'degraded',
      database,
      postgis,
      redis,
    }
  }
}
