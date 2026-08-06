import { copy } from '@medibridge/copy'
import { z } from 'zod'

const v = copy.validation

/**
 * The reason shown verbatim to the business whose documents were rejected, so
 * it has to be long enough to actually explain the problem. "no" is not a
 * reason someone can act on.
 */
export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(10, v.text.tooShort(10)).max(500, v.text.tooLong(500)),
})
export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>

export interface PendingDocument {
  id: string
  type: 'DRUG_LICENSE' | 'GST_CERTIFICATE'
  number: string
  expiresOn: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  verificationStatus: string
}

export interface PendingApplication {
  userId: string
  fullName: string
  phone: string
  email: string
  role: 'RETAILER' | 'DISTRIBUTOR'
  businessName: string | null
  gstNumber: string | null
  city: string | null
  state: string | null
  submittedAt: string
  /** How long they have been waiting, so the queue can be sorted by urgency. */
  waitingDays: number
  documents: PendingDocument[]
}
