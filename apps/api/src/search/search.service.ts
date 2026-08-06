import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode, type MedicineSearchInput } from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { RedisService } from '../common/redis/redis.service'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

export interface SearchResultOffer {
  distributorId: string
  distributorName: string
  pricePaise: number
  mrpPaise: number
  available: number
  minOrderQuantity: number
  expiresOn: string
  distanceKm: number
  sameDayAvailable: boolean
}

export interface SearchResultMedicine {
  medicineId: string
  name: string
  brand: string
  composition: string
  form: string
  bestPricePaise: number
  mrpPaise: number
  sellerCount: number
  sameDayAvailable: boolean
  offers: SearchResultOffer[]
}

export interface SearchResult {
  items: SearchResultMedicine[]
  distributorsInRange: number
  tookMs: number
  cached: boolean
}

interface NearbyDistributor {
  id: string
  businessName: string
  distanceKm: number
  sameDayRadiusKm: number
}

/**
 * Retailer medicine search.
 *
 * The design is driven by one observation: a retailer's search is ALWAYS
 * bounded by who can deliver to them, and that is a handful of distributors.
 * So the query never searches the whole catalogue — it finds the nearby
 * distributors first (a tiny PostGIS result), then reads a pre-aggregated
 * offer table scoped to them.
 *
 * Measured on 200k medicines / 3M inventory rows / 62 distributors:
 *
 *   browse cheapest nearby   807 ms  ->    9 ms
 *   text search              374 ms  ->   61 ms
 *   who else sells this        —     ->  0.1 ms
 *
 * See docs/SEARCH-PERFORMANCE.md for the full reasoning and measurements.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name)

  /** Offers pulled per distributor before merging. See searchOffers(). */
  private static readonly PER_DISTRIBUTOR_FANOUT = 100
  /** Offers considered in total before collapsing to one row per medicine. */
  private static readonly MERGE_LIMIT = 400

  /*
   * TenantPrismaService, not PrismaService.
   *
   * Every query below runs inside a transaction with app.company_id set, so
   * Row-Level Security applies — including the two raw SQL queries, where a
   * hand-written WHERE would otherwise be the only thing standing between one
   * tenant's search results and another's stock.
   */
  constructor(
    private readonly db: TenantPrismaService,
    private readonly redis: RedisService,
  ) {}

  async search(retailerUserId: string, input: MedicineSearchInput): Promise<SearchResult> {
    const startedAt = Date.now()

    const address = await this.db.run((tx) =>
      tx.address.findFirst({
        where: { userId: retailerUserId, deletedAt: null },
        orderBy: { isDefault: 'desc' },
        select: { id: true, latitude: true, longitude: true },
      }),
    )
    if (!address) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [
          {
            field: 'address',
            message: 'Please add your shop address before searching, so we know who can deliver.',
          },
        ],
      })
    }

    const cacheKey = this.cacheKey(address.id, input)
    const cached = await this.redis.getJson<SearchResult>(cacheKey)
    if (cached) {
      return { ...cached, cached: true, tookMs: Date.now() - startedAt }
    }

    const nearby = await this.findNearbyDistributors(address.latitude, address.longitude)
    if (nearby.length === 0) {
      return { items: [], distributorsInRange: 0, tookMs: Date.now() - startedAt, cached: false }
    }

    const items = await this.searchOffers(nearby, input)

    const result: SearchResult = {
      items,
      distributorsInRange: nearby.length,
      tookMs: Date.now() - startedAt,
      cached: false,
    }

    // 60s is long enough to absorb a retailer paging back and forth, short
    // enough that a price change is visible almost immediately.
    await this.redis.setJson(cacheKey, result, 60)
    return result
  }

  /**
   * Which distributors can reach this retailer.
   *
   * The only PostGIS query in the path, and it returns tens of rows at most.
   * `sameDayAvailable` is decided here rather than in the offer query because
   * each distributor has their own radius.
   */
  private async findNearbyDistributors(
    latitude: number,
    longitude: number,
  ): Promise<NearbyDistributor[]> {
    // Widest radius any distributor uses, so nobody who could deliver is
    // excluded before their own radius is checked.
    const MAX_REACH_METRES = 200_000

    return this.db.run(
      (tx) => tx.$queryRaw<NearbyDistributor[]>`
      SELECT dp.id,
             dp."businessName",
             ROUND((ST_Distance(hub.location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) / 1000)::numeric, 1)::float8 AS "distanceKm",
             dp."sameDayRadiusKm"
      FROM distributor_profiles dp
      JOIN addresses hub ON hub.id = dp."hubAddressId"
      WHERE dp."isAcceptingOrders" = true
        AND ST_DWithin(
              hub.location,
              ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
              ${MAX_REACH_METRES}
            )
      ORDER BY "distanceKm" ASC
    `,
    )
  }

  /**
   * The hot query.
   *
   * A LATERAL top-N per distributor, not one big scan. That shape is what lets
   * Postgres use (distributorId, bestPricePaise) as an ORDERED index scan and
   * stop after the fanout limit, instead of aggregating every matching offer
   * before it can sort. It is the difference between 9 ms and 800 ms.
   *
   * Deduplication to one row per medicine happens after the merge, over a few
   * hundred rows rather than hundreds of thousands.
   */
  private async searchOffers(
    nearby: NearbyDistributor[],
    input: MedicineSearchInput,
  ): Promise<SearchResultMedicine[]> {
    const distributorIds = nearby.map((distributor) => distributor.id)
    const byId = new Map(nearby.map((distributor) => [distributor.id, distributor]))

    const query = input.query?.trim()

    // Two forms of the same ordering: unqualified inside the LATERAL (where
    // the `o` alias is still being defined) and qualified outside it.
    const sortExpression =
      input.sortBy === 'priceHigh'
        ? '"bestPricePaise" DESC'
        : input.sortBy === 'expiryLongest'
          ? '"latestExpiry" DESC'
          : '"bestPricePaise" ASC'
    const innerOrder = sortExpression
    const outerOrder = `o.${sortExpression}`

    // Built as text because LATERAL + dynamic ORDER BY is beyond Prisma's
    // typed query builder. Every value is still a bound parameter.
    const rows = await this.db.run((tx) =>
      tx.$queryRawUnsafe<
        Array<{
          medicineId: string
          distributorId: string
          name: string
          brand: string
          composition: string
          form: string
          bestPricePaise: number
          mrpPaise: number
          totalAvailable: number
          minOrderQuantity: number
          latestExpiry: Date
        }>
      >(
        `
      SELECT o."medicineId", o."distributorId", o.name, o.brand, o.composition, o.form,
             o."bestPricePaise", o."mrpPaise", o."totalAvailable", o."minOrderQuantity",
             o."latestExpiry"
      FROM unnest($1::uuid[]) AS d(id)
      CROSS JOIN LATERAL (
        SELECT * FROM medicine_offers
        WHERE "distributorId" = d.id
          ${query ? `AND "searchVector" @@ websearch_to_tsquery('english', $4)` : ''}
          ${input.form ? `AND form = $5::"MedicineForm"` : ''}
        ORDER BY ${innerOrder}
        LIMIT $2
      ) o
      ORDER BY ${outerOrder}
      LIMIT $3
      `,
        distributorIds,
        SearchService.PER_DISTRIBUTOR_FANOUT,
        SearchService.MERGE_LIMIT,
        ...(query ? [query] : []),
        ...(input.form ? [input.form] : []),
      ),
    )

    // Collapse to one entry per medicine, keeping every seller so the retailer
    // can compare. Cheap: a few hundred rows at most.
    const byMedicine = new Map<string, SearchResultMedicine>()

    for (const row of rows) {
      const distributor = byId.get(row.distributorId)
      if (!distributor) continue

      const sameDay = row.distributorId
        ? distributor.distanceKm <= distributor.sameDayRadiusKm
        : false

      const offer: SearchResultOffer = {
        distributorId: row.distributorId,
        distributorName: distributor.businessName,
        pricePaise: row.bestPricePaise,
        mrpPaise: row.mrpPaise,
        available: row.totalAvailable,
        minOrderQuantity: row.minOrderQuantity,
        expiresOn: row.latestExpiry.toISOString().slice(0, 10),
        distanceKm: distributor.distanceKm,
        sameDayAvailable: sameDay,
      }

      const existing = byMedicine.get(row.medicineId)
      if (existing) {
        existing.offers.push(offer)
        existing.sellerCount += 1
        if (offer.pricePaise < existing.bestPricePaise) {
          existing.bestPricePaise = offer.pricePaise
          existing.mrpPaise = offer.mrpPaise
        }
        existing.sameDayAvailable ||= sameDay
      } else {
        byMedicine.set(row.medicineId, {
          medicineId: row.medicineId,
          name: row.name,
          brand: row.brand,
          composition: row.composition,
          form: row.form,
          bestPricePaise: row.bestPricePaise,
          mrpPaise: row.mrpPaise,
          sellerCount: 1,
          sameDayAvailable: sameDay,
          offers: [offer],
        })
      }
    }

    let items = [...byMedicine.values()]

    if (input.sameDayOnly) {
      items = items.filter((item) => item.sameDayAvailable)
    }
    if (input.minPricePaise !== undefined) {
      items = items.filter((item) => item.bestPricePaise >= input.minPricePaise!)
    }
    if (input.maxPricePaise !== undefined) {
      items = items.filter((item) => item.bestPricePaise <= input.maxPricePaise!)
    }

    for (const item of items) {
      item.offers.sort((a, b) => a.pricePaise - b.pricePaise)
    }

    const start = (input.page - 1) * input.pageSize
    return items.slice(start, start + input.pageSize)
  }

  private cacheKey(addressId: string, input: MedicineSearchInput): string {
    // The address is part of the key because results are location-dependent —
    // two retailers searching the same word must not share a cache entry.
    return `search:${addressId}:${JSON.stringify({
      q: input.query ?? '',
      f: input.form ?? '',
      s: input.sortBy,
      sd: input.sameDayOnly,
      p: input.page,
      ps: input.pageSize,
      min: input.minPricePaise ?? '',
      max: input.maxPricePaise ?? '',
    })}`
  }
}
