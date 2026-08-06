import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  type BusinessMode,
  type Capability,
  type CompanyCapabilities,
  MODE_CAPABILITIES,
  MODE_FORBIDDEN_CAPABILITIES,
  type PaymentTerms,
  type PaymentTermType,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from './tenant-prisma.service'
import { RedisService } from '../common/redis/redis.service'

/**
 * Resolves what a company is allowed to do.
 *
 * No feature is ever written as `if (mode === MARKETPLACE)`. Code asks
 * "is this capability on for this company?" — which is what lets a
 * marketplace-only feature be granted to a private tenant later, or a
 * capability be sold as a plan upgrade, without touching the feature's code.
 *
 * Three layers, in order:
 *
 *   1. Business mode      what the model implies (a one-seller portal has no
 *                         price comparison; that is not an upsell)
 *   2. Plan               what they pay for
 *   3. Company override   a deliberate exception for one customer
 *
 * A mode-forbidden capability can never be switched on by a plan or an
 * override, because granting MULTI_SELLER_CART to a single-seller portal is
 * not a feature — it is a bug report waiting to happen.
 */
@Injectable()
export class CapabilityService {
  private readonly logger = new Logger(CapabilityService.name)
  private static readonly CACHE_TTL_SECONDS = 300

  constructor(
    private readonly db: TenantPrismaService,
    private readonly redis: RedisService,
  ) {}

  async forCompany(companyId: string): Promise<CompanyCapabilities> {
    const cacheKey = `capabilities:${companyId}`
    const cached = await this.redis.getJson<{
      mode: BusinessMode
      enabled: Capability[]
      limits: Record<string, number>
    }>(cacheKey)

    if (cached) {
      return {
        companyId,
        mode: cached.mode,
        enabled: new Set(cached.enabled),
        limits: cached.limits,
      }
    }

    const company = await this.db.runPreTenant((tx) =>
      tx.company.findUnique({
        where: { id: companyId },
        include: {
          plan: { include: { features: true } },
          overrides: true,
        },
      }),
    )
    if (!company) throw new AppException(ApiErrorCode.NOT_FOUND)

    const mode = company.businessMode as BusinessMode
    const forbidden = new Set<string>(MODE_FORBIDDEN_CAPABILITIES[mode])

    // 1. What the mode implies.
    const enabled = new Set<Capability>(MODE_CAPABILITIES[mode])
    const limits: Record<string, number> = {}

    // 2. What the plan adds.
    for (const feature of company.plan?.features ?? []) {
      if (forbidden.has(feature.capability)) continue
      enabled.add(feature.capability as Capability)
      if (feature.limit !== null) limits[feature.capability] = feature.limit
    }

    // 3. Per-company exceptions, which can also revoke.
    for (const override of company.overrides) {
      if (override.enabled && forbidden.has(override.capability)) {
        this.logger.warn(
          `Ignoring override ${override.capability} for ${companyId}: forbidden in ${mode} mode`,
        )
        continue
      }
      if (override.enabled) {
        enabled.add(override.capability as Capability)
        if (override.limit !== null) limits[override.capability] = override.limit
      } else {
        enabled.delete(override.capability as Capability)
      }
    }

    await this.redis.setJson(
      cacheKey,
      { mode, enabled: [...enabled], limits },
      CapabilityService.CACHE_TTL_SECONDS,
    )

    return { companyId, mode, enabled, limits }
  }

  async has(companyId: string, capability: Capability): Promise<boolean> {
    const capabilities = await this.forCompany(companyId)
    return capabilities.enabled.has(capability)
  }

  /** Throws a friendly error rather than letting a disabled feature half-work. */
  async require(companyId: string, capability: Capability): Promise<void> {
    if (!(await this.has(companyId, capability))) {
      throw new AppException(ApiErrorCode.FORBIDDEN, {
        fields: [
          {
            field: 'capability',
            message: 'This feature is not part of your plan. Please contact us to enable it.',
          },
        ],
      })
    }
  }

  /** Numeric ceiling, e.g. how many warehouses. Infinity when uncapped. */
  async limit(companyId: string, capability: Capability): Promise<number> {
    const capabilities = await this.forCompany(companyId)
    return capabilities.limits[capability] ?? Number.POSITIVE_INFINITY
  }

  /**
   * The payment terms for an order.
   *
   * Customer-level terms win over the company default, because a distributor
   * routinely gives one large buyer credit while everyone else pays a token.
   */
  async paymentTerms(companyId: string, customerId?: string): Promise<PaymentTerms> {
    const company = await this.db.runPreTenant((tx) =>
      tx.company.findUnique({
        where: { id: companyId },
        select: { paymentTermType: true, tokenPercent: true, creditDays: true },
      }),
    )
    if (!company) throw new AppException(ApiErrorCode.NOT_FOUND)

    let type = company.paymentTermType as PaymentTermType

    if (customerId) {
      const customer = await this.db.runPreTenant((tx) =>
        tx.customer.findUnique({
          where: { id: customerId },
          select: { paymentTermType: true },
        }),
      )
      if (customer?.paymentTermType) type = customer.paymentTermType as PaymentTermType
    }

    return {
      type,
      tokenPercent: company.tokenPercent,
      creditDays: company.creditDays,
    }
  }

  /** Called whenever a plan, override or mode changes. */
  async invalidate(companyId: string): Promise<void> {
    await this.redis.client.del(`capabilities:${companyId}`)
  }
}
