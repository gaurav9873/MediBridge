import { Injectable, Logger } from '@nestjs/common'
import { ApiErrorCode, type SessionUser } from '@medibridge/types'
import type { Readable } from 'node:stream'
import { AppException } from '../common/errors/app-exception'
import { FileStorage } from '../common/storage/file-storage'
import { TenantPrismaService } from '../tenancy/tenant-prisma.service'

/** What a licence or GST certificate may be uploaded as. */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/** 5 MB, as the copy layer promises. A phone photo of a licence is under 3. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

export interface DocumentSummary {
  id: string
  type: 'DRUG_LICENSE' | 'GST_CERTIFICATE'
  number: string
  expiresOn: string | null
  fileName: string
  sizeBytes: number
  verificationStatus: string
  rejectionReason: string | null
  uploadedAt: string
}

/**
 * Drug licences and GST certificates.
 *
 * These are the documents an admin looks at before an account may buy
 * medicines, so two things matter more than convenience:
 *
 *   - the file is never served from a public path; it is streamed through an
 *     endpoint that checks who is asking
 *   - the storage key is derived from ids we generate, never from the uploaded
 *     file name, so an uploader cannot choose where their file lands
 *
 * Re-uploading replaces the previous file of the same type and sends it back
 * for review. Someone whose licence was rejected for being blurry should be
 * able to fix it without an admin deleting anything first.
 */
@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name)

  constructor(
    private readonly db: TenantPrismaService,
    private readonly storage: FileStorage,
  ) {}

  async list(user: SessionUser): Promise<DocumentSummary[]> {
    const documents = await this.db.run((tx) =>
      tx.document.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } }),
    )
    return documents.map(toSummary)
  }

  async upload(
    user: SessionUser,
    input: {
      type: 'DRUG_LICENSE' | 'GST_CERTIFICATE'
      number: string
      expiresOn?: Date
      file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
    },
  ): Promise<DocumentSummary> {
    if (input.file.size > MAX_DOCUMENT_BYTES) throw new AppException(ApiErrorCode.FILE_TOO_LARGE)

    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(input.file.mimetype)) {
      throw new AppException(ApiErrorCode.FILE_TYPE_NOT_ALLOWED)
    }

    // A drug licence that has already lapsed is refused now rather than at
    // review, so the person finds out while they are still on the page.
    if (input.type === 'DRUG_LICENSE') {
      if (!input.expiresOn) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [{ field: 'expiresOn', message: 'Please enter the expiry date on your licence.' }],
        })
      }
      if (input.expiresOn.getTime() <= Date.now()) {
        throw new AppException(ApiErrorCode.VALIDATION_FAILED, {
          fields: [
            {
              field: 'expiresOn',
              message: 'That licence has already expired. Please upload a renewed one.',
            },
          ],
        })
      }
    }

    await this.assertNumberFree(input.type, input.number, user.id)

    const document = await this.db.runPreTenant(async (tx) => {
      const existing = await tx.document.findFirst({
        where: { userId: user.id, type: input.type },
        select: { id: true, fileKey: true },
      })

      const data = {
        companyId: user.companyId,
        userId: user.id,
        type: input.type,
        number: input.number,
        expiresOn: input.expiresOn ?? null,
        fileKey: 'pending',
        fileName: input.file.originalname.slice(0, 255),
        mimeType: input.file.mimetype,
        sizeBytes: input.file.size,
        // Replacing a rejected document puts it back in the queue, and clears
        // the old reason so nobody reads yesterday's verdict as today's.
        verificationStatus: 'PENDING' as const,
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
      }

      if (existing) {
        await this.storage.remove(existing.fileKey).catch(() => undefined)
        return tx.document.update({ where: { id: existing.id }, data })
      }
      return tx.document.create({ data })
    })

    // The key is built from ids we control, never from the uploaded name.
    const fileKey = this.storage.buildKey({
      scope: 'documents',
      id: document.id,
      name: `${input.type.toLowerCase()}${extensionOf(input.file.originalname)}`,
    })
    await this.storage.write(fileKey, input.file.buffer)
    const saved = await this.db.runPreTenant((tx) =>
      tx.document.update({ where: { id: document.id }, data: { fileKey } }),
    )

    await this.db.runPreTenant((tx) =>
      tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: 'UPLOAD_DOCUMENT',
          entityType: 'Document',
          entityId: document.id,
          after: {
            type: input.type,
            number: input.number,
            fileName: input.file.originalname.slice(0, 255),
          },
        },
      }),
    )

    this.logger.log(`${input.type} uploaded for ${user.id}`)
    return toSummary(saved)
  }

  /**
   * Streams a document to whoever is allowed to see it.
   *
   * Its owner, or an admin reviewing it. Nobody else, and never by guessing a
   * URL — which is why the file is not on a public path in the first place.
   */
  async openFile(
    documentId: string,
    user: SessionUser,
  ): Promise<{ stream: Readable; fileName: string; mimeType: string }> {
    const document = await this.db.runPreTenant((tx) =>
      tx.document.findUnique({ where: { id: documentId } }),
    )
    if (!document) throw new AppException(ApiErrorCode.NOT_FOUND)

    const isOwner = document.userId === user.id
    const isReviewer = user.role === 'ADMIN'
    if (!isOwner && !isReviewer) throw new AppException(ApiErrorCode.FORBIDDEN)

    if (!(await this.storage.exists(document.fileKey))) {
      throw new AppException(ApiErrorCode.NOT_FOUND)
    }

    return {
      stream: this.storage.createReadStream(document.fileKey),
      fileName: document.fileName,
      mimeType: document.mimeType,
    }
  }

  /**
   * One licence number, one account.
   *
   * The database has a unique constraint on (type, number); this exists to
   * turn that into a sentence rather than a 500, and to say which of the two
   * numbers is the problem.
   */
  private async assertNumberFree(type: string, number: string, userId: string): Promise<void> {
    const clash = await this.db.runPreTenant((tx) =>
      tx.document.findFirst({
        where: { type: type as never, number, userId: { not: userId } },
        select: { id: true },
      }),
    )
    if (!clash) return
    throw new AppException(
      type === 'DRUG_LICENSE'
        ? ApiErrorCode.LICENSE_ALREADY_REGISTERED
        : ApiErrorCode.GST_ALREADY_REGISTERED,
    )
  }
}

function toSummary(document: {
  id: string
  type: string
  number: string
  expiresOn: Date | null
  fileName: string
  sizeBytes: number
  verificationStatus: string
  rejectionReason: string | null
  createdAt: Date
}): DocumentSummary {
  return {
    id: document.id,
    type: document.type as DocumentSummary['type'],
    number: document.number,
    expiresOn: document.expiresOn ? document.expiresOn.toISOString().slice(0, 10) : null,
    fileName: document.fileName,
    sizeBytes: document.sizeBytes,
    verificationStatus: document.verificationStatus,
    rejectionReason: document.rejectionReason,
    uploadedAt: document.createdAt.toISOString(),
  }
}

function extensionOf(fileName: string): string {
  const match = /\.[a-zA-Z0-9]+$/.exec(fileName)
  return match ? match[0].toLowerCase() : ''
}
