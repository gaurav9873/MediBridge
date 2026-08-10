import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode } from '@medibridge/types'
import { AppException } from '../common/errors/app-exception'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

/** How far ahead a licence counts as "expiring soon". */
export const LICENCE_WARNING_DAYS = 90

export interface DocumentReview {
  id: string
  userId: string
  applicantName: string
  businessName: string | null
  phone: string
  type: string
  number: string
  expiresOn: string | null
  fileName: string
  mimeType: string
  verificationStatus: string
  rejectionReason: string | null
  uploadedAt: string
  /** Days until it lapses. Negative when it already has. */
  daysUntilExpiry: number | null
}

/**
 * Reviewing what people upload, one document at a time.
 *
 * The existing approvals screen decides a whole application at once, which is
 * the right shape when both documents are fine. It is the wrong shape when one
 * is: rejecting the application to fix a blurry GST certificate also throws
 * away a perfectly good drug licence, and the applicant has to upload both
 * again.
 *
 * So a reviewer can accept or refuse each document on its own, and the account
 * becomes active only once every document it needs is approved — a rule stated
 * here rather than left to whoever clicks last.
 */
@Injectable()
export class LicenceService {
  private readonly logger = new Logger(LicenceService.name)

  constructor(private readonly db: TenantPrismaService) {}

  /** Everything waiting for a decision, oldest first. */
  async pending(): Promise<DocumentReview[]> {
    const documents = await this.db.runAsPlatform('licence review queue', (tx) =>
      tx.document.findMany({
        where: { verificationStatus: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { fullName: true, phone: true, customerProfile: true, companyRef: true } },
        },
      }),
    )
    return documents.map(toReview)
  }

  /**
   * Licences about to lapse, soonest first.
   *
   * Worth chasing rather than waiting for: the moment one expires, that
   * business stops being able to order, and the first they hear of it is a
   * blocked checkout.
   */
  async expiring(withinDays = LICENCE_WARNING_DAYS): Promise<DocumentReview[]> {
    const cutoff = new Date(Date.now() + withinDays * 86_400_000)

    const documents = await this.db.runAsPlatform('expiring licences', (tx) =>
      tx.document.findMany({
        where: {
          type: 'DRUG_LICENSE',
          verificationStatus: 'APPROVED',
          expiresOn: { lte: cutoff },
        },
        orderBy: { expiresOn: 'asc' },
        include: {
          user: { select: { fullName: true, phone: true, customerProfile: true, companyRef: true } },
        },
      }),
    )
    return documents.map(toReview)
  }

  /**
   * Accepts one document.
   *
   * A drug licence carries its number and expiry onto the record the ordering
   * guard reads — the Customer for a buyer, the Company for a seller — so that
   * check stays a single cheap read rather than a join on every checkout.
   *
   * The account only becomes active once nothing of theirs is still pending or
   * rejected.
   */
  async approveDocument(documentId: string, adminId: string): Promise<{ accountActivated: boolean }> {
    return this.db.runAsPlatform('approve document', async (tx) => {
      const document = await tx.document.findUnique({
        where: { id: documentId },
        include: { user: { select: { id: true, companyId: true, customerProfile: true } } },
      })
      if (!document) throw new AppException(ApiErrorCode.NOT_FOUND)

      if (document.type === 'DRUG_LICENSE' && document.expiresOn) {
        // Approving a lapsed licence would activate an account that instantly
        // fails the ordering guard, which reads as a bug to everyone involved.
        if (document.expiresOn.getTime() <= Date.now()) {
          throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
            fields: [
              {
                field: 'expiresOn',
                message:
                  'This licence has already expired. Ask them to upload a renewed one instead of approving this.',
              },
            ],
          })
        }
      }

      await tx.document.update({
        where: { id: documentId },
        data: {
          verificationStatus: 'APPROVED',
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      })

      if (document.type === 'DRUG_LICENSE') {
        const licence = { drugLicenseNumber: document.number, licenseExpiresOn: document.expiresOn }
        if (document.user.customerProfile) {
          await tx.customer.update({ where: { userId: document.user.id }, data: licence })
        } else if (document.user.companyId) {
          await tx.company.update({ where: { id: document.user.companyId }, data: licence })
        }
      }

      const accountActivated = await this.activateIfComplete(tx, document.user.id, adminId)

      await tx.auditLog.create({
        data: {
          companyId: document.companyId,
          actorId: adminId,
          action: 'APPROVE_DOCUMENT',
          entityType: 'Document',
          entityId: documentId,
          after: { type: document.type, number: document.number, accountActivated },
        },
      })

      this.logger.log(`${document.type} approved for ${document.user.id}`)
      return { accountActivated }
    })
  }

  /**
   * Refuses one document, with a reason the applicant will read verbatim.
   *
   * The account is NOT marked rejected: they can upload a replacement, and
   * re-uploading puts it straight back in this queue. Closing the account for
   * a blurry photograph would be a very expensive way to ask for a better one.
   */
  async rejectDocument(
    documentId: string,
    adminId: string,
    reason: string,
  ): Promise<{ documentId: string }> {
    return this.db.runAsPlatform('reject document', async (tx) => {
      const document = await tx.document.findUnique({ where: { id: documentId } })
      if (!document) throw new AppException(ApiErrorCode.NOT_FOUND)

      await tx.document.update({
        where: { id: documentId },
        data: {
          verificationStatus: 'REJECTED',
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId: document.companyId,
          actorId: adminId,
          action: 'REJECT_DOCUMENT',
          entityType: 'Document',
          entityId: documentId,
          after: { type: document.type, reason },
        },
      })

      this.logger.log(`${document.type} rejected for ${document.userId}`)
      return { documentId }
    })
  }

  /**
   * Activates an account once every document it holds is approved.
   *
   * Both are required: a drug licence says they may trade in medicines, a GST
   * certificate says they are a registered business. Approving one and
   * forgetting the other is exactly the mistake this prevents.
   */
  private async activateIfComplete(
    tx: {
      document: { findMany: (args: never) => Promise<Array<{ type: string; verificationStatus: string }>> }
      user: { update: (args: never) => Promise<unknown> }
    },
    userId: string,
    adminId: string,
  ): Promise<boolean> {
    const documents = await tx.document.findMany({
      where: { userId },
      select: { type: true, verificationStatus: true },
    } as never)

    const approved = new Set(
      documents.filter((d) => d.verificationStatus === 'APPROVED').map((d) => d.type),
    )
    if (!approved.has('DRUG_LICENSE') || !approved.has('GST_CERTIFICATE')) return false

    await tx.user.update({
      where: { id: userId },
      data: { accountStatus: 'ACTIVE' },
    } as never)

    this.logger.log(`Account activated: ${userId} by ${adminId}`)
    return true
  }
}

function toReview(document: {
  id: string
  userId: string
  type: string
  number: string
  expiresOn: Date | null
  fileName: string
  mimeType: string
  verificationStatus: string
  rejectionReason: string | null
  createdAt: Date
  user: {
    fullName: string
    phone: string
    customerProfile: { businessName: string } | null
    companyRef: { name: string } | null
  }
}): DocumentReview {
  return {
    id: document.id,
    userId: document.userId,
    applicantName: document.user.fullName,
    businessName: document.user.customerProfile?.businessName ?? document.user.companyRef?.name ?? null,
    phone: document.user.phone,
    type: document.type,
    number: document.number,
    expiresOn: document.expiresOn ? document.expiresOn.toISOString().slice(0, 10) : null,
    fileName: document.fileName,
    mimeType: document.mimeType,
    verificationStatus: document.verificationStatus,
    rejectionReason: document.rejectionReason,
    uploadedAt: document.createdAt.toISOString(),
    daysUntilExpiry: document.expiresOn
      ? Math.floor((document.expiresOn.getTime() - Date.now()) / 86_400_000)
      : null,
  }
}
