import { Injectable, Logger } from '@nestjs/common'
import {
  ApiErrorCode,
  type MedicineInput,
  type SessionUser,
  medicineKey,
  similarity,
} from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'
import { MedicineService } from './medicine.service'

export interface MedicineRequestSummary {
  id: string
  name: string
  brand: string
  composition: string | null
  form: string | null
  strength: string | null
  notes: string | null
  status: string
  rejectionReason: string | null
  requestedBy: string
  requestedByCompany: string | null
  medicineId: string | null
  createdAt: string
}

/**
 * "This medicine is missing from your list."
 *
 * The catalogue is admin-owned, which is what makes cross-seller price
 * comparison possible — but a distributor holding stock of something we do not
 * list has a real problem and no way to solve it alone. This is that way.
 *
 * A request is not a medicine. Approving one creates the catalogue row, and
 * the request keeps a pointer to it so the asker can see what happened.
 */
@Injectable()
export class MedicineRequestService {
  private readonly logger = new Logger(MedicineRequestService.name)

  constructor(
    private readonly db: TenantPrismaService,
    private readonly medicines: MedicineService,
  ) {}

  /** What this company has asked for. Scoped by RLS to their own requests. */
  async listMine(_user: SessionUser): Promise<MedicineRequestSummary[]> {
    const requests = await this.db.run((tx) =>
      tx.medicineRequest.findMany({
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: { select: { fullName: true } }, companyRef: { select: { name: true } } },
      }),
    )
    return requests.map(toSummary)
  }

  /** Everything waiting for a decision, across every tenant. */
  async listPending(): Promise<MedicineRequestSummary[]> {
    const requests = await this.db.runAsPlatform('medicine request queue', (tx) =>
      tx.medicineRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        include: { requestedBy: { select: { fullName: true } }, companyRef: { select: { name: true } } },
      }),
    )
    return requests.map(toSummary)
  }

  /**
   * Asks for a medicine.
   *
   * Checks the catalogue first and says so if it is already there — most
   * requests are somebody not finding a row that exists, and answering that
   * instantly is better than queueing it behind a review.
   */
  async request(
    user: SessionUser,
    input: { name: string; brand: string; composition?: string; form?: string; strength?: string; notes?: string },
  ): Promise<MedicineRequestSummary | { alreadyExists: true; medicineId: string; name: string }> {
    const companyId = user.companyId
    if (!companyId) throw new AppException(ApiErrorCode.FORBIDDEN)

    const existing = await this.db.runAsPlatform('check the catalogue before requesting', (tx) =>
      tx.medicine.findMany({
        where: {
          isActive: true,
          OR: [
            { brand: { equals: input.brand, mode: 'insensitive' } },
            { name: { contains: input.name.split(/\s+/)[0] ?? input.name, mode: 'insensitive' } },
          ],
        },
        take: 50,
        select: { id: true, name: true, brand: true, strength: true, packSize: true },
      }),
    )

    const match = existing.find(
      (candidate) =>
        medicineKey(candidate) === medicineKey({ ...input, packSize: null }) ||
        similarity(`${candidate.name} ${candidate.strength ?? ''}`, `${input.name} ${input.strength ?? ''}`) > 0.85,
    )
    if (match) return { alreadyExists: true, medicineId: match.id, name: match.name }

    const created = await this.db.run(async (tx) => {
      const request = await tx.medicineRequest.create({
        data: {
          companyId,
          requestedById: user.id,
          name: input.name,
          brand: input.brand,
          composition: input.composition ?? null,
          form: (input.form as never) ?? null,
          strength: input.strength ?? null,
          notes: input.notes ?? null,
        },
      })
      await tx.auditLog.create({
        data: {
          companyId,
          actorId: user.id,
          action: 'REQUEST_MEDICINE',
          entityType: 'MedicineRequest',
          entityId: request.id,
          after: { name: input.name, brand: input.brand } as never,
        },
      })
      return request
    })

    this.logger.log(`Medicine requested: ${input.name} (${input.brand})`)
    const mine = await this.listMine(user)
    return mine.find((request) => request.id === created.id)!
  }

  /**
   * Approves a request by creating the catalogue row.
   *
   * The reviewer supplies the full medicine — a request carries a name and a
   * brand, but the catalogue needs an HSN code, a GST rate and a schedule, and
   * those are the reviewer's judgement rather than the asker's.
   */
  async approve(
    admin: SessionUser,
    requestId: string,
    medicine: MedicineInput,
  ): Promise<{ medicineId: string }> {
    const created = await this.medicines.create(admin, medicine)

    await this.db.runAsPlatform('approve a medicine request', async (tx) => {
      const request = await tx.medicineRequest.findUnique({ where: { id: requestId } })
      if (!request) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.medicineRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
          medicineId: created.id,
          rejectionReason: null,
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorId: admin.id,
          action: 'APPROVE_MEDICINE_REQUEST',
          entityType: 'MedicineRequest',
          entityId: requestId,
          after: { medicineId: created.id, name: created.name } as never,
        },
      })
    })

    return { medicineId: created.id }
  }

  /** Refuses a request, with a reason the asker reads verbatim. */
  async reject(admin: SessionUser, requestId: string, reason: string): Promise<void> {
    await this.db.runAsPlatform('reject a medicine request', async (tx) => {
      const request = await tx.medicineRequest.findUnique({ where: { id: requestId } })
      if (!request) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.medicineRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorId: admin.id,
          action: 'REJECT_MEDICINE_REQUEST',
          entityType: 'MedicineRequest',
          entityId: requestId,
          after: { reason } as never,
        },
      })
    })
  }
}

function toSummary(request: {
  id: string
  name: string
  brand: string
  composition: string | null
  form: string | null
  strength: string | null
  notes: string | null
  status: string
  rejectionReason: string | null
  medicineId: string | null
  createdAt: Date
  requestedBy: { fullName: string }
  companyRef?: { name: string } | null
}): MedicineRequestSummary {
  return {
    id: request.id,
    name: request.name,
    brand: request.brand,
    composition: request.composition,
    form: request.form,
    strength: request.strength,
    notes: request.notes,
    status: request.status,
    rejectionReason: request.rejectionReason,
    requestedBy: request.requestedBy.fullName,
    requestedByCompany: request.companyRef?.name ?? null,
    medicineId: request.medicineId,
    createdAt: request.createdAt.toISOString(),
  }
}
