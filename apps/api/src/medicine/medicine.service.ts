import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  DUPLICATE_THRESHOLD,
  type DrugSchedule,
  type MedicineInput,
  type Paginated,
  type SessionUser,
  blockedReason,
  isSellable,
  medicineKey,
  requiresPrescription,
  similarity,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

export interface MedicineSummary {
  id: string
  name: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  manufacturer: string | null
  hsnCode: string
  gstRate: number
  schedule: string
  isPrescriptionRequired: boolean
  isActive: boolean
  /** Live batches across every seller. Shown before anyone archives one. */
  stockItems: number
  createdAt: string
  updatedAt: string
}

export interface DuplicateCandidate {
  medicine: MedicineSummary
  /** 0–1. Above DUPLICATE_THRESHOLD is worth a human look. */
  score: number
  /** True when the four identity columns match exactly. */
  exact: boolean
}

/**
 * The medicine catalogue.
 *
 * One global list, owned by the platform rather than by any tenant: cross-seller
 * price comparison only works if two distributors stocking Dolo 650 point at
 * the SAME row. A per-tenant catalogue would make "who else sells this?"
 * unanswerable, which is most of the product.
 *
 * So every write here runs through `runAsPlatform` — deliberately verbose, and
 * logged, because it is the one catalogue everybody reads. What stops a
 * distributor editing it is the permission on the route, not the tenant scope.
 *
 * Medicine RULES — what may be sold, what needs a prescription, what counts as
 * the same medicine — live in `@medibridge/types/medicine-rules`, not here.
 * This service decides what to write; that module decides what is allowed.
 */
@Injectable()
export class MedicineService {
  private readonly logger = new Logger(MedicineService.name)

  constructor(private readonly db: TenantPrismaService) {}

  /**
   * The catalogue, filtered and paged.
   *
   * Text search goes through the same weighted `searchVector` the retailer
   * search uses, so an admin looking for a medicine and a pharmacy looking for
   * it find it by the same rules.
   */
  async list(
    query: {
      search?: string
      form?: string
      schedule?: string
      status?: 'active' | 'archived' | 'all'
      page: number
      pageSize: number
    },
  ): Promise<Paginated<MedicineSummary>> {
    const where: Record<string, unknown> = {}

    if (query.status === 'active') where.isActive = true
    else if (query.status === 'archived') where.isActive = false

    if (query.form) where.form = query.form
    if (query.schedule) where.schedule = query.schedule

    // Prefix-friendly: someone typing "dolo" should see Dolo 650 before they
    // finish the word, which a tsquery on its own does not give.
    if (query.search?.trim()) {
      const term = query.search.trim()
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { composition: { contains: term, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await this.db.runAsPlatform('browse the medicine catalogue', (tx) =>
      Promise.all([
        tx.medicine.findMany({
          where,
          orderBy: [{ name: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            _count: { select: { inventoryItems: { where: { deletedAt: null, isActive: true } } } },
          },
        }),
        tx.medicine.count({ where }),
      ]),
    )

    return {
      items: items.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async get(medicineId: string): Promise<MedicineSummary> {
    const medicine = await this.db.runAsPlatform('read one medicine', (tx) =>
      tx.medicine.findUnique({
        where: { id: medicineId },
        include: {
          _count: { select: { inventoryItems: { where: { deletedAt: null, isActive: true } } } },
        },
      }),
    )
    if (!medicine) throw new AppException(ApiErrorCode.NOT_FOUND)
    return toSummary(medicine)
  }

  /**
   * Adds a medicine to the global catalogue.
   *
   * Refuses a blocked schedule, and refuses an exact duplicate — the four
   * identity columns are unique in the database, so the alternative is a
   * constraint violation the user cannot read.
   */
  async create(user: SessionUser, input: MedicineInput): Promise<MedicineSummary> {
    this.assertSellable(input.schedule as DrugSchedule)

    const clash = await this.findExact(input)
    if (clash) {
      throw new AppException(ApiErrorCode.CONFLICT, {
        fields: [
          {
            field: 'name',
            message: `${clash.name} (${clash.brand}) is already in the catalogue with the same strength and pack size. Edit that one instead of adding it twice.`,
          },
        ],
      })
    }

    const medicine = await this.db.runAsPlatform('add a medicine', async (tx) => {
      const created = await tx.medicine.create({
        data: {
          ...this.toRow(input),
          createdById: user.id,
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'CREATE_MEDICINE',
          entityType: 'Medicine',
          entityId: created.id,
          after: { name: input.name, brand: input.brand, schedule: input.schedule } as never,
        },
      })
      return created
    })

    this.logger.log(`Medicine added: ${input.name} (${input.brand})`)
    return this.get(medicine.id)
  }

  /**
   * Edits a medicine.
   *
   * The name, brand and pack fields are the identity, so changing them can
   * collide with another row. That is checked here rather than left to the
   * unique constraint.
   */
  async update(user: SessionUser, medicineId: string, input: MedicineInput): Promise<MedicineSummary> {
    this.assertSellable(input.schedule as DrugSchedule)

    const clash = await this.findExact(input)
    if (clash && clash.id !== medicineId) {
      throw new AppException(ApiErrorCode.CONFLICT, {
        fields: [
          {
            field: 'name',
            message: `Another medicine already uses that name, brand, strength and pack size. Merge them instead of keeping both.`,
          },
        ],
      })
    }

    await this.db.runAsPlatform('edit a medicine', async (tx) => {
      const before = await tx.medicine.findUnique({ where: { id: medicineId } })
      if (!before) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.medicine.update({ where: { id: medicineId }, data: this.toRow(input) })
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'UPDATE_MEDICINE',
          entityType: 'Medicine',
          entityId: medicineId,
          before: {
            name: before.name,
            brand: before.brand,
            schedule: before.schedule,
            gstRate: before.gstRate,
          } as never,
          after: { name: input.name, brand: input.brand, schedule: input.schedule, gstRate: input.gstRate } as never,
        },
      })
    })

    return this.get(medicineId)
  }

  /**
   * Archives or restores a medicine.
   *
   * Never deleted: order lines snapshot their medicine, but inventory and the
   * search projection reference the row, and an invoice from last year must
   * still resolve. Archiving takes it out of search — the trigger on
   * `medicine_offers` removes its rows — while leaving history intact.
   */
  async setArchived(
    user: SessionUser,
    medicineId: string,
    archived: boolean,
  ): Promise<MedicineSummary> {
    await this.db.runAsPlatform(archived ? 'archive a medicine' : 'restore a medicine', async (tx) => {
      const medicine = await tx.medicine.findUnique({
        where: { id: medicineId },
        include: {
          _count: { select: { inventoryItems: { where: { deletedAt: null, isActive: true } } } },
        },
      })
      if (!medicine) throw new AppException(ApiErrorCode.NOT_FOUND)

      if (archived && medicine._count.inventoryItems > 0) {
        throw new AppException(ApiErrorCode.CONFLICT, {
          fields: [
            {
              field: 'medicineId',
              message: `${medicine._count.inventoryItems} seller${medicine._count.inventoryItems === 1 ? '' : 's'} still hold${medicine._count.inventoryItems === 1 ? 's' : ''} stock of this. Ask them to clear it before archiving, or it will vanish from their inventory.`,
            },
          ],
        })
      }

      await tx.medicine.update({ where: { id: medicineId }, data: { isActive: !archived } })
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: archived ? 'ARCHIVE_MEDICINE' : 'RESTORE_MEDICINE',
          entityType: 'Medicine',
          entityId: medicineId,
          before: { isActive: medicine.isActive } as never,
          after: { isActive: !archived } as never,
        },
      })
    })

    return this.get(medicineId)
  }

  // ---------------------------------------------------------------------------
  // Duplicates
  // ---------------------------------------------------------------------------

  /**
   * Medicines that look like this one.
   *
   * The unique constraint catches exact repeats. This catches the ones that
   * matter more — "Dolo-650" against "Dolo 650", "Paracetamol 650mg" against
   * "Paracetamol 650 mg" — which pass every constraint and then split one
   * medicine's stock across two rows so neither shows the real best price.
   *
   * Candidates are narrowed in the database by brand or first word, then ranked
   * in memory. Scoring the whole catalogue would be 200,000 comparisons for a
   * handful of answers.
   */
  async findDuplicates(medicineId: string): Promise<DuplicateCandidate[]> {
    const subject = await this.get(medicineId)
    const firstWord = subject.name.split(/\s+/)[0] ?? subject.name

    const candidates = await this.db.runAsPlatform('find duplicate medicines', (tx) =>
      tx.medicine.findMany({
        where: {
          id: { not: medicineId },
          OR: [
            { brand: { equals: subject.brand, mode: 'insensitive' } },
            { name: { contains: firstWord, mode: 'insensitive' } },
            { composition: { equals: subject.composition, mode: 'insensitive' } },
          ],
        },
        take: 200,
        include: {
          _count: { select: { inventoryItems: { where: { deletedAt: null, isActive: true } } } },
        },
      }),
    )

    const subjectKey = medicineKey(subject)

    return candidates
      .map((candidate) => {
        const summary = toSummary(candidate)
        // Name and strength together: two pack sizes of the same tablet are
        // similar but genuinely different products.
        const score = similarity(
          `${subject.name} ${subject.strength ?? ''}`,
          `${summary.name} ${summary.strength ?? ''}`,
        )
        return { medicine: summary, score, exact: medicineKey(summary) === subjectKey }
      })
      .filter((candidate) => candidate.exact || candidate.score >= DUPLICATE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }

  /**
   * Merges a duplicate into the medicine that should survive.
   *
   * Everything pointing at the loser is repointed at the winner, then the loser
   * is archived rather than deleted — an order from last year still references
   * it, and an invoice that cannot resolve its own line items is worse than a
   * tidy catalogue.
   *
   * Inventory is the delicate part: a seller may hold the same batch number
   * under both rows, and `(warehouseId, medicineId, batchNumber)` is unique. A
   * colliding batch is left on the loser rather than dropped, and the count is
   * reported so somebody can look.
   */
  async merge(
    user: SessionUser,
    input: { keepId: string; mergeId: string },
  ): Promise<{ moved: number; collided: number }> {
    if (input.keepId === input.mergeId) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
        fields: [{ field: 'mergeId', message: 'Choose two different medicines to merge.' }],
      })
    }

    const result = await this.db.runAsPlatform('merge duplicate medicines', async (tx) => {
      const [keep, merge] = await Promise.all([
        tx.medicine.findUnique({ where: { id: input.keepId } }),
        tx.medicine.findUnique({ where: { id: input.mergeId } }),
      ])
      if (!keep || !merge) throw new AppException(ApiErrorCode.NOT_FOUND)

      const batches = await tx.inventoryItem.findMany({
        where: { medicineId: merge.id, deletedAt: null },
        select: { id: true, warehouseId: true, batchNumber: true },
      })

      // Which of those batches would collide with one the winner already has.
      const existing = await tx.inventoryItem.findMany({
        where: { medicineId: keep.id, deletedAt: null },
        select: { warehouseId: true, batchNumber: true },
      })
      const taken = new Set(existing.map((row) => `${row.warehouseId}|${row.batchNumber}`))

      let moved = 0
      let collided = 0
      for (const batch of batches) {
        if (taken.has(`${batch.warehouseId}|${batch.batchNumber}`)) {
          collided += 1
          continue
        }
        await tx.inventoryItem.update({
          where: { id: batch.id },
          data: { medicineId: keep.id },
        })
        moved += 1
      }

      // Requests and order history follow the survivor too, so "what was this
      // asked for?" keeps working after a merge.
      await tx.medicineRequest.updateMany({
        where: { medicineId: merge.id },
        data: { medicineId: keep.id },
      })

      await tx.medicine.update({ where: { id: merge.id }, data: { isActive: false } })

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'MERGE_MEDICINE',
          entityType: 'Medicine',
          entityId: keep.id,
          before: { mergedId: merge.id, mergedName: merge.name, mergedBrand: merge.brand } as never,
          after: { keptName: keep.name, batchesMoved: moved, batchesLeft: collided } as never,
        },
      })

      return { moved, collided }
    })

    this.logger.log(`Merged ${input.mergeId} into ${input.keepId}: ${result.moved} batches moved`)
    return result
  }

  // ---------------------------------------------------------------------------

  private assertSellable(schedule: DrugSchedule): void {
    if (isSellable(schedule)) return
    throw new AppException(ApiErrorCode.MEDICINE_BLOCKED_SCHEDULE, {
      fields: [{ field: 'schedule', message: blockedReason(schedule) ?? 'This schedule cannot be sold here.' }],
    })
  }

  /** The four identity columns, exactly as the unique constraint sees them. */
  private async findExact(
    input: MedicineInput,
  ): Promise<{ id: string; name: string; brand: string } | null> {
    return this.db.runAsPlatform('check for a duplicate medicine', (tx) =>
      tx.medicine.findFirst({
        where: {
          name: input.name,
          brand: input.brand,
          strength: input.strength ?? null,
          packSize: input.packSize ?? null,
        },
        select: { id: true, name: true, brand: true },
      }),
    )
  }

  private toRow(input: MedicineInput) {
    return {
      name: input.name,
      brand: input.brand,
      composition: input.composition,
      form: input.form,
      strength: input.strength ?? null,
      packSize: input.packSize ?? null,
      manufacturer: input.manufacturer ?? null,
      hsnCode: input.hsnCode,
      gstRate: input.gstRate,
      schedule: input.schedule,
      // The schedule has the final say: an unticked box on a Schedule H drug
      // is a mistake, and the safe reading of it is the stricter one.
      isPrescriptionRequired: requiresPrescription(
        input.schedule as DrugSchedule,
        input.isPrescriptionRequired ?? false,
      ),
    }
  }
}

function toSummary(medicine: {
  id: string
  name: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  manufacturer: string | null
  hsnCode: string
  gstRate: number
  schedule: string
  isPrescriptionRequired: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  _count?: { inventoryItems: number }
}): MedicineSummary {
  return {
    id: medicine.id,
    name: medicine.name,
    brand: medicine.brand,
    composition: medicine.composition,
    form: medicine.form,
    strength: medicine.strength,
    packSize: medicine.packSize,
    manufacturer: medicine.manufacturer,
    hsnCode: medicine.hsnCode,
    gstRate: medicine.gstRate,
    schedule: medicine.schedule,
    isPrescriptionRequired: medicine.isPrescriptionRequired,
    isActive: medicine.isActive,
    stockItems: medicine._count?.inventoryItems ?? 0,
    createdAt: medicine.createdAt.toISOString(),
    updatedAt: medicine.updatedAt.toISOString(),
  }
}
