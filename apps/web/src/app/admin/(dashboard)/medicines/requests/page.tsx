'use client'

import { copy } from '@medibridge/copy'
import { rejectApplicationSchema } from '@medibridge/types'
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  DataView,
  PageShell,
  TextAreaField,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Inbox, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { formLabel } from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import { type MedicineRequestSummary, medicineKeys, medicinesApi } from '@/lib/medicines'

const c = copy.admin.medicines.requests.review

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Medicine requests waiting for a decision.
 *
 * Approving is not a button: a request carries a name and a brand, and the
 * catalogue needs an HSN code, a GST rate and a schedule that the person who
 * asked has no way of knowing. So "approve" opens the full add form with what
 * they told us already filled in, and the reviewer supplies the rest.
 *
 * Refusing IS a button, but never a silent one — the reason is typed here and
 * the distributor reads it verbatim, so it is validated against the same Zod
 * schema the server uses.
 */
export default function MedicineRequestsPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [rejecting, setRejecting] = React.useState<MedicineRequestSummary | null>(null)
  const [reason, setReason] = React.useState('')
  const [reasonError, setReasonError] = React.useState<string>()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: medicineKeys.pendingRequests,
    queryFn: () => medicinesApi.pendingRequests(),
  })

  const reject = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => medicinesApi.rejectRequest(id, why),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: medicineKeys.all })
      notify.success(copy.admin.medicines.success.requestRejected)
      closeReject()
    },
    onError: (rejectError) => {
      notify.error(rejectError instanceof ApiClientError ? rejectError.message : undefined)
    },
  })

  const closeReject = (): void => {
    setRejecting(null)
    setReason('')
    setReasonError(undefined)
  }

  const submitReject = (): void => {
    const parsed = rejectApplicationSchema.safeParse({ reason })
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message)
      return
    }
    setReasonError(undefined)
    if (rejecting) reject.mutate({ id: rejecting.id, why: parsed.data.reason })
  }

  return (
    <PageShell
      page={c.page}
      help={c.help}
      secondaryAction={{
        label: copy.admin.medicines.page.title,
        onClick: () => router.push('/admin/medicines'),
      }}
    >
      {data && data.length > 0 && (
        <p className="text-base text-content-secondary">{c.waitingCount(data.length)}</p>
      )}

      <DataView
        data={data}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={c.empty}
        emptyIcon={<Inbox />}
        onRetry={() => void refetch()}
      >
        {(requests) => (
          <div className="flex flex-col gap-3">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-content-primary">{request.name}</h2>
                    <p className="text-sm text-content-secondary">
                      {[request.brand, request.strength, request.form && formLabel(request.form)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {request.composition && (
                      <p className="text-sm text-content-secondary">{request.composition}</p>
                    )}
                  </div>

                  <dl className="flex flex-col gap-1.5 border-t border-border-default pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-sm text-content-secondary">{c.labels.askedBy}</dt>
                      <dd className="text-right text-sm font-medium text-content-primary">
                        {c.askedBy(request.requestedBy, request.requestedByCompany ?? '—')}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-sm text-content-secondary">{c.labels.when}</dt>
                      <dd className="text-right text-sm font-medium text-content-primary">
                        {c.askedOn(formatDate(request.createdAt))}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-col gap-1 border-t border-border-default pt-3">
                    <h3 className="text-sm font-medium text-content-primary">{c.notesHeading}</h3>
                    <p className="text-sm text-content-secondary">
                      {request.notes ?? c.noNotes}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      icon={<Check />}
                      onClick={() =>
                        router.push(`/admin/medicines/requests/${request.id}/approve`)
                      }
                    >
                      {c.approveCta}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<X />}
                      onClick={() => {
                        setRejecting(request)
                        setReason('')
                        setReasonError(undefined)
                      }}
                    >
                      {c.rejectCta}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </DataView>

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && closeReject()}
        title={c.rejectConfirm.title}
        body={rejecting ? `${rejecting.name} · ${rejecting.brand}` : ''}
        confirmLabel={c.rejectConfirm.confirmLabel}
        tone="danger"
        loading={reject.isPending}
        onConfirm={submitReject}
      >
        <TextAreaField
          field={c.rejectField}
          error={reasonError}
          required
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </ConfirmDialog>
    </PageShell>
  )
}
