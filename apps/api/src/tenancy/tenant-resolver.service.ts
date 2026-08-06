import { Injectable, Logger } from '@nestjs/common'
import {
  type ResolvedTenant,
  TenantResolutionSource,
  type TenantResolutionRequest,
  type TenantResolutionStrategyContract,
} from '@medibridge/types'
import { TenantPrismaService } from './tenant-prisma.service'
import { RedisService } from '../common/redis/redis.service'
import { loadEnv } from '../config/env'

/**
 * Works out which tenant a request belongs to.
 *
 * Strategies run in priority order and the first non-null answer wins. Nothing
 * downstream learns which one produced the answer — so the same build serves
 * subdomains in production, a path prefix in a demo, and a gateway header
 * behind an API gateway, with no code change.
 *
 * Adding a strategy is one class and one line in the constructor.
 */
@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name)
  private readonly strategies: TenantResolutionStrategyContract[]
  private static readonly CACHE_TTL_SECONDS = 300

  constructor(
    private readonly db: TenantPrismaService,
    private readonly redis: RedisService,
  ) {
    const env = loadEnv()
    this.strategies = [
      new HeaderStrategy(this),
      new CustomDomainStrategy(this),
      new SubdomainStrategy(this, env.TENANT_BASE_DOMAIN),
      new PathStrategy(this),
      new SessionStrategy(this),
      new DefaultTenantStrategy(this, env.DEFAULT_TENANT_SLUG),
    ].sort((a, b) => a.priority - b.priority)
  }

  async resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null> {
    for (const strategy of this.strategies) {
      const resolved = await strategy.resolve(request)
      if (resolved) return resolved
    }
    return null
  }

  /**
   * Slug or id to a tenant. Cached, because it runs on literally every request
   * and a company's identity changes about never.
   */
  async lookup(
    value: string,
    by: 'slug' | 'id' | 'domain',
    source: TenantResolutionSource,
  ): Promise<ResolvedTenant | null> {
    const cacheKey = `tenant:${by}:${value.toLowerCase()}`
    const cached = await this.redis.getJson<{ companyId: string; slug: string } | null>(cacheKey)
    if (cached) return { ...cached, source }

    const where =
      by === 'slug'
        ? { slug: value.toLowerCase() }
        : by === 'domain'
          ? { customDomain: value.toLowerCase() }
          : { id: value }

    const company = await this.db.runPreTenant((tx) =>
      tx.company.findFirst({
        // A suspended tenant resolves to nothing, so its portal stops serving
        // rather than serving a broken half-session.
        where: { ...where, deletedAt: null, status: { in: ['TRIAL', 'ACTIVE'] } },
        select: { id: true, slug: true },
      }),
    )
    if (!company) return null

    const value_ = { companyId: company.id, slug: company.slug }
    await this.redis.setJson(cacheKey, value_, TenantResolverService.CACHE_TTL_SECONDS)
    return { ...value_, source }
  }

  async invalidate(slug: string, id: string, domain?: string | null): Promise<void> {
    const keys = [`tenant:slug:${slug}`, `tenant:id:${id}`]
    if (domain) keys.push(`tenant:domain:${domain.toLowerCase()}`)
    await this.redis.client.del(...keys)
  }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

/**
 * A gateway or service mesh already decided. Highest priority, and trusted
 * only because the header is stripped at the edge — see docs/MULTI-TENANCY.md.
 */
class HeaderStrategy implements TenantResolutionStrategyContract {
  readonly source = TenantResolutionSource.HEADER
  readonly priority = 10
  constructor(private readonly resolver: TenantResolverService) {}

  async resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null> {
    const raw = request.headers['x-tenant-id'] ?? request.headers['x-company-id']
    const value = Array.isArray(raw) ? raw[0] : raw
    if (!value) return null
    return this.resolver.lookup(value, isUuid(value) ? 'id' : 'slug', this.source)
  }
}

/** app.abcpharma.com — the tenant's own domain. */
class CustomDomainStrategy implements TenantResolutionStrategyContract {
  readonly source = TenantResolutionSource.CUSTOM_DOMAIN
  readonly priority = 20
  constructor(private readonly resolver: TenantResolverService) {}

  async resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null> {
    const host = hostname(request.host)
    if (!host) return null
    return this.resolver.lookup(host, 'domain', this.source)
  }
}

/** abcpharma.medibridge.in */
class SubdomainStrategy implements TenantResolutionStrategyContract {
  readonly source = TenantResolutionSource.SUBDOMAIN
  readonly priority = 30
  constructor(
    private readonly resolver: TenantResolverService,
    private readonly baseDomain: string,
  ) {}

  async resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null> {
    const host = hostname(request.host)
    if (!host || !this.baseDomain || !host.endsWith(this.baseDomain)) return null

    const label = host.slice(0, -this.baseDomain.length).replace(/\.$/, '')
    // "www" and "app" are the platform's own front door, not a tenant.
    if (!label || ['www', 'app', 'api'].includes(label)) return null

    return this.resolver.lookup(label, 'slug', this.source)
  }
}

/**
 * medibridge.in/abcpharma
 *
 * Useful for local development and single-domain deployments where wildcard
 * DNS or per-tenant TLS is not available.
 */
class PathStrategy implements TenantResolutionStrategyContract {
  readonly source = TenantResolutionSource.PATH
  readonly priority = 40
  constructor(private readonly resolver: TenantResolverService) {}

  async resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null> {
    const match = /^\/t\/([a-z0-9-]{2,63})(\/|$)/i.exec(request.path)
    if (!match?.[1]) return null
    return this.resolver.lookup(match[1], 'slug', this.source)
  }
}

/** The signed-in user's own company. The common case for API calls. */
class SessionStrategy implements TenantResolutionStrategyContract {
  readonly source = TenantResolutionSource.SESSION
  readonly priority = 50
  constructor(private readonly resolver: TenantResolverService) {}

  async resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null> {
    if (!request.sessionCompanyId) return null
    return this.resolver.lookup(request.sessionCompanyId, 'id', this.source)
  }
}

/** Single-tenant deployment: one company, named in configuration. */
class DefaultTenantStrategy implements TenantResolutionStrategyContract {
  readonly source = TenantResolutionSource.DEFAULT
  readonly priority = 90
  constructor(
    private readonly resolver: TenantResolverService,
    private readonly defaultSlug: string,
  ) {}

  async resolve(): Promise<ResolvedTenant | null> {
    if (!this.defaultSlug) return null
    return this.resolver.lookup(this.defaultSlug, 'slug', this.source)
  }
}

function hostname(host: string): string | null {
  if (!host) return null
  return host.split(':')[0]?.toLowerCase() ?? null
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
