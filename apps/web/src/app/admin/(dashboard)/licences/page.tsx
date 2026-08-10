'use client'

import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageShell,
  Skeleton,
  StatusBadge,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, FileCheck2 } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface DocumentReview {
  id: string
  userId: string
  applicantName: string
  businessName: string | null
  phone: string
  type: string
  number: string
  expiresOn: string | null
  fileName: string
  verificationStatus: string
  uploadedAt: string
  daysUntilExpiry: number | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1'

/**
 * The licence desk.
 *
 * Two lists, because they are two different jobs: things waiting for a
 * decision, and things about to lapse. The second is the one nobody asks for —
 * the day a licence expires, that business simply stops being able to order,
 * and the first they hear of it is a blocked checkout.
 *
 * Each document is decided on its own. Refusing a blurry GST certificate must
 * not throw away the perfectly good drug licence uploaded beside it.
 */
export default function LicencesPage(): React.JSX.Element {
  const queryClient = useQueryClient()

  const pending = useQuery({
    queryKey: ['admin', 'licences', 'pending'],
    queryFn: () => api.get<DocumentReview[]>('/admin/licences/pending'),
  })

  const expiring = useQuery({
    queryKey: ['admin', 'licences', 'expiring'],
    queryFn: () => api.get<DocumentReview[]>('/admin/licences/expiring'),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'licences'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] })
  }

  const approve = useMutation({
    mutationFn: (id: string) =>
      api.post<{ accountActivated: boolean }>(`/admin/licences/${id}/approve`, {}),
    onSuccess: (result) => {
      notify.success(
        result.accountActivated
          ? 'Approved. Every document is now accepted, so the account is active.'
          : 'Approved. The account activates once their other document is accepted too.',
      )
      refresh()
    },
    onError: (error) => {
      const message =
        error instanceof ApiClientError ? (error.fields?.[0]?.message ?? error.message) : undefined
      notify.error(message)
    },
  })

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/licences/${id}/reject`, { reason }),
    onSuccess: () => {
      notify.success('Sent back. They can upload a replacement straight away.')
      refresh()
    },
    onError: (error) => notify.error(error instanceof ApiClientError ? error.message : undefined),
  })

  const askAndReject = (document: DocumentReview) => {
    // The applicant reads this verbatim, so it has to be a sentence rather
    // than a code.
    const reason = window.prompt(
      `Why is this ${label(document.type)} not acceptable?\n\nThey will read this exactly as you write it.`,
      'The photo is too blurry to read. Please upload a clearer copy.',
    )
    if (reason && reason.trim().length >= 10) reject.mutate({ id: document.id, reason: reason.trim() })
    else if (reason !== null) notify.error('Please give a reason of at least 10 characters.')
  }

  return (
    <PageShell
      page={{
        title: 'Licences',
        subtitle: 'Check what people upload, and chase what is about to lapse.',
      }}
      help={{
        whatIsThis:
          'Every pharmacy and distributor must show a valid drug licence and GST certificate before they can buy or sell medicines. This is where you check them.',
        topics: [
          {
            question: 'Do I have to decide on both documents at once?',
            answer:
              'No. Accept or refuse each one on its own. The account only becomes active once both are accepted.',
          },
          {
            question: 'What happens if I refuse one?',
            answer:
              'The account is not closed. They see your reason, upload a replacement, and it comes straight back to this queue.',
          },
          {
            question: 'Why can I not approve an expired licence?',
            answer:
              'Approving it would activate an account that immediately fails the ordering check, which looks like a bug to everyone. Ask them for a renewed one.',
          },
          {
            question: 'What is the second list for?',
            answer:
              'Licences that are still valid but not for much longer. Chasing them now avoids a business being cut off without warning.',
          },
        ],
      }}
    >
      <Card>
        <CardHeader title="Waiting for a decision" description="Oldest first." />
        <CardBody>
          {pending.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (pending.data ?? []).length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 />}
              copy={{
                title: 'Nothing waiting',
                body: 'Every uploaded document has been checked. New ones appear here as they arrive.',
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {(pending.data ?? []).map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 rounded-[--radius-lg] border border-border-default p-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-content-primary">
                      {document.businessName ?? document.applicantName} · {label(document.type)}
                    </span>
                    <span className="text-xs text-content-secondary">
                      {document.number}
                      {document.expiresOn ? ` · valid until ${document.expiresOn}` : ''} ·{' '}
                      {document.applicantName} · {document.phone}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {/* Opens through the API, which checks who is asking —
                        these files are not on a public path. */}
                    <Button
                      variant="secondary"
                      size="md"
                      icon={<ExternalLink />}
                      onClick={() =>
                        window.open(
                          `${API_BASE}/onboarding/documents/${document.id}/file`,
                          '_blank',
                          'noopener',
                        )
                      }
                    >
                      View
                    </Button>
                    <Button
                      size="md"
                      loading={approve.isPending && approve.variables === document.id}
                      onClick={() => approve.mutate(document.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      loading={reject.isPending && reject.variables?.id === document.id}
                      onClick={() => askAndReject(document)}
                    >
                      Send back
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Expiring soon"
          description="Approved licences with 90 days or less to run."
        />
        <CardBody>
          {expiring.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (expiring.data ?? []).length === 0 ? (
            <EmptyState
              icon={<FileCheck2 />}
              copy={{
                title: 'Nothing expiring',
                body: 'No approved licence lapses in the next 90 days.',
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {(expiring.data ?? []).map((document) => {
                const days = document.daysUntilExpiry ?? 0
                return (
                  <div
                    key={document.id}
                    className="flex flex-col gap-2 rounded-[--radius-lg] border border-border-default p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-content-primary">
                        {document.businessName ?? document.applicantName}
                      </span>
                      <span className="text-xs text-content-secondary">
                        {document.number} · {document.phone}
                      </span>
                    </div>
                    <StatusBadge
                      tone={days < 0 ? 'danger' : days <= 30 ? 'warning' : 'neutral'}
                      label={
                        days < 0
                          ? `Expired ${Math.abs(days)} days ago`
                          : `${days} days left · ${document.expiresOn}`
                      }
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Alert tone="info" title="Refusing a document does not close an account">
        They keep their sign-in, see your reason, and can upload a replacement. Only suspend an
        account when you actually mean to stop them using MediBridge.
      </Alert>
    </PageShell>
  )
}

function label(type: string): string {
  return type === 'DRUG_LICENSE' ? 'drug licence' : 'GST certificate'
}
