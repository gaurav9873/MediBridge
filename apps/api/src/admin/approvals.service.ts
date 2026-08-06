import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode, type PendingApplication } from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * The licence verification queue.
 *
 * Nobody can place or receive a single order until an admin has checked their
 * drug licence — Indian law only permits medicine sales between licensed
 * businesses. This is therefore the one manual gate in the whole product, and
 * every state change it makes is written to the audit log.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name)

  constructor(private readonly db: TenantPrismaService) {}

  async listPending(): Promise<PendingApplication[]> {
    // Verification spans every tenant — that is the platform owner's job.
    const users = await this.db.runAsPlatform('licence verification queue', (tx) =>
      tx.user.findMany({
        where: {
          accountStatus: { in: ['PENDING_VERIFICATION', 'REJECTED'] },
          role: { in: ['RETAILER', 'DISTRIBUTOR'] },
          deletedAt: null,
        },
        include: {
          customerProfile: true,
          companyRef: true,
          documents: { orderBy: { type: 'asc' } },
          addresses: { where: { deletedAt: null }, orderBy: { isDefault: 'desc' }, take: 1 },
        },
        // Longest wait first — those are the people we are holding up.
        orderBy: { createdAt: 'asc' },
      }),
    )

    return users.map((user) => {
      // A buyer applies as a Customer; a seller's staff apply on behalf of the
      // selling Company. Both carry a trading name and a GST number.
      const profile = user.customerProfile ?? user.companyRef
      const businessName = user.customerProfile?.businessName ?? user.companyRef?.name ?? null
      const address = user.addresses[0]

      return {
        userId: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role as 'RETAILER' | 'DISTRIBUTOR',
        businessName,
        gstNumber: profile?.gstNumber ?? null,
        city: address?.city ?? null,
        state: address?.state ?? null,
        submittedAt: user.createdAt.toISOString(),
        waitingDays: Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / MS_PER_DAY)),
        documents: user.documents.map((document) => ({
          id: document.id,
          type: document.type as 'DRUG_LICENSE' | 'GST_CERTIFICATE',
          number: document.number,
          expiresOn: document.expiresOn ? document.expiresOn.toISOString().slice(0, 10) : null,
          fileName: document.fileName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          verificationStatus: document.verificationStatus,
        })),
      }
    })
  }

  /**
   * Approves an application.
   *
   * The drug licence number and expiry are copied onto the profile so the
   * checkout guard is one cheap read rather than a join, and the whole thing
   * runs in a transaction — a half-approved account that can order without a
   * recorded licence would be a compliance problem, not just a bug.
   */
  async approve(userId: string, adminId: string): Promise<{ userId: string }> {
    return this.db.runAsPlatform('approve application', async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { documents: true, customerProfile: true, companyRef: true },
      })

      if (!user) throw new AppException(ApiErrorCode.NOT_FOUND)
      if (user.role === 'ADMIN') throw new AppException(ApiErrorCode.FORBIDDEN)

      const licence = user.documents.find((document) => document.type === 'DRUG_LICENSE')
      if (!licence) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'documents',
              message: 'This business has not uploaded a drug licence yet.',
            },
          ],
        })
      }

      // Refuse to approve a licence that has already lapsed — approving it would
      // immediately fail the ordering guard and confuse everyone.
      if (licence.expiresOn && licence.expiresOn.getTime() < Date.now()) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'documents',
              message:
                'This drug licence has already expired. Ask them to upload a renewed one instead.',
            },
          ],
        })
      }

      const now = new Date()

      await (async () => {
        await tx.document.updateMany({
          where: { userId, verificationStatus: { not: 'APPROVED' } },
          data: {
            verificationStatus: 'APPROVED',
            reviewedById: adminId,
            reviewedAt: now,
            rejectionReason: null,
          },
        })

        // Denormalise the approved licence onto whichever record the ordering
        // guard reads: the Customer for a buyer, the Company for a seller.
        const licenceData = {
          drugLicenseNumber: licence.number,
          licenseExpiresOn: licence.expiresOn,
        }

        if (user.customerProfile) {
          await tx.customer.update({ where: { userId }, data: licenceData })
        } else if (user.companyId) {
          await tx.company.update({ where: { id: user.companyId }, data: licenceData })
        }

        await tx.user.update({
          where: { id: userId },
          data: { accountStatus: 'ACTIVE' },
        })

        await tx.auditLog.create({
          data: {
            actorId: adminId,
            action: 'APPROVE_APPLICATION',
            entityType: 'User',
            entityId: userId,
            before: { accountStatus: user.accountStatus },
            after: { accountStatus: 'ACTIVE', licenseNumber: licence.number },
          },
        })
      })()

      this.logger.log(`Application approved: ${userId} by ${adminId}`)
      return { userId }
    })
  }

  async reject(userId: string, adminId: string, reason: string): Promise<{ userId: string }> {
    return this.db.runAsPlatform('reject application', async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
      })

      if (!user) throw new AppException(ApiErrorCode.NOT_FOUND)
      if (user.role === 'ADMIN') throw new AppException(ApiErrorCode.FORBIDDEN)

      const now = new Date()

      await (async () => {
        await tx.document.updateMany({
          where: { userId },
          data: {
            verificationStatus: 'REJECTED',
            reviewedById: adminId,
            reviewedAt: now,
            rejectionReason: reason,
          },
        })

        await tx.user.update({
          where: { id: userId },
          data: { accountStatus: 'REJECTED' },
        })

        await tx.auditLog.create({
          data: {
            actorId: adminId,
            action: 'REJECT_APPLICATION',
            entityType: 'User',
            entityId: userId,
            before: { accountStatus: user.accountStatus },
            after: { accountStatus: 'REJECTED', reason },
          },
        })
      })()

      this.logger.log(`Application rejected: ${userId} by ${adminId}`)
      return { userId }
    })
  }
}
