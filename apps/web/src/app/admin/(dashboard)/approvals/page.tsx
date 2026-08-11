'use client'

import { copy } from '@medibridge/copy'
import type { PendingApplication } from '@medibridge/types'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataView,
  PageShell,
  StatusBadge,
  TextAreaField,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, FileText, Mail, MapPin, Phone, ShieldCheck, X } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

/**
 * The licence verification queue.
 *
 * The one manual gate in the product: nobody can buy or sell a single medicine
 * until an admin has checked their drug licence. The checklist is rendered
 * beside every application rather than kept in a training document, because
 * the cost of approving a bad licence is regulatory, not cosmetic.
 */
export default function ApprovalsPage(): React.JSX.Element {
  const c = copy.admin.verification
  const queryClient = useQueryClient()

  const [rejecting, setRejecting] = React.useState<PendingApplication | null>(null)
  const [reason, setReason] = React.useState('')
  const [reasonError, setReasonError] = React.useState<string | undefined>()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'approvals'],
    queryFn: () => api.get<PendingApplication[]>('/admin/approvals'),
  })

  function afterDecision(): void {
    // The dashboard tiles count the same rows, so both go stale together.
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const approve = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/approvals/${userId}/approve`),
    onSuccess: () => {
      notify.success(c.success.approved)
      afterDecision()
    },
    onError: (err) => notify.error(err instanceof ApiClientError ? err.message : undefined),
  })

  const reject = useMutation({
    mutationFn: ({ userId, reason: why }: { userId: string; reason: string }) =>
      api.post(`/admin/approvals/${userId}/reject`, { reason: why }),
    onSuccess: () => {
      notify.success(c.success.rejected)
      setRejecting(null)
      setReason('')
      afterDecision()
    },
    onError: (err) => {
      // A too-short reason comes back as a field error; show it on the field.
      if (err instanceof ApiClientError && err.fields?.length) {
        setReasonError(err.fields[0]?.message)
      } else {
        notify.error(err instanceof ApiClientError ? err.message : undefined)
      }
    },
  })

  const waiting = data?.filter((a) => a.documents.some((d) => d.verificationStatus === 'PENDING'))

  return (
    <PageShell
      page={c.page}
      help={c.help}
      toolbar={
        data && data.length > 0 ? (
          <p className="text-base font-medium text-content-secondary">
            {c.queueCount(waiting?.length ?? 0)}
          </p>
        ) : undefined
      }
    >
      <DataView
        data={data}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={c.empty}
        emptyIcon={<ShieldCheck />}
        onRetry={() => void refetch()}
      >
        {(applications) => (
          <div className="flex flex-col gap-4">
            {applications.map((application) => {
              const isPending = application.documents.some(
                (d) => d.verificationStatus === 'PENDING',
              )
              const busy =
                (approve.isPending && approve.variables === application.userId) ||
                (reject.isPending && reject.variables?.userId === application.userId)

              return (
                <Card key={application.userId}>
                  <CardHeader
                    title={application.businessName ?? application.fullName}
                    description={`${copy.admin.users.role[application.role]} · ${c.waitingDays(application.waitingDays)}`}
                    action={
                      <StatusBadge
                        label={
                          isPending
                            ? copy.admin.users.accountStatus.PENDING_VERIFICATION
                            : copy.admin.users.accountStatus.REJECTED
                        }
                        tone={isPending ? 'warning' : 'danger'}
                      />
                    }
                  />

                  <CardBody className="flex flex-col gap-5">
                    {/* --- who they are --- */}
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Detail
                        icon={<Building2 />}
                        label="Contact person"
                        value={application.fullName}
                      />
                      <Detail icon={<Phone />} label="Mobile" value={application.phone} />
                      <Detail icon={<Mail />} label="Email" value={application.email} />
                      <Detail
                        icon={<MapPin />}
                        label="Location"
                        value={
                          [application.city, application.state].filter(Boolean).join(', ') || '—'
                        }
                      />
                    </dl>

                    {/* --- their documents --- */}
                    <section className="flex flex-col gap-2">
                      <h3 className="text-sm font-semibold text-content-secondary">Documents</h3>
                      <ul className="flex flex-col gap-2">
                        {application.documents.map((document) => {
                          const expired =
                            document.expiresOn !== null &&
                            new Date(document.expiresOn).getTime() < Date.now()

                          return (
                            <li
                              key={document.id}
                              className="flex flex-wrap items-center gap-3 rounded-(--radius-md) border border-border-default bg-surface-sunken p-3"
                            >
                              <FileText
                                className="size-5 shrink-0 text-content-muted"
                                aria-hidden
                              />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="text-base font-medium text-content-primary">
                                  {document.type === 'DRUG_LICENSE'
                                    ? 'Drug License'
                                    : 'GST Certificate'}
                                </span>
                                <span className="text-sm text-content-secondary">
                                  {document.number}
                                  {document.expiresOn && ` · valid until ${document.expiresOn}`}
                                </span>
                              </div>
                              {expired && (
                                <StatusBadge label={copy.common.status.expired} tone="danger" />
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>

                    {/* --- the checklist, in front of the person deciding --- */}
                    {isPending && (
                      <section className="flex flex-col gap-2 rounded-(--radius-md) bg-info-50 p-4">
                        <h3 className="text-sm font-semibold text-info-900">
                          {c.checklistHeading}
                        </h3>
                        <ul className="flex flex-col gap-1.5">
                          {c.checklist.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2 text-sm leading-relaxed text-info-900/90"
                            >
                              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        icon={<Check />}
                        loading={approve.isPending && approve.variables === application.userId}
                        disabled={busy}
                        onClick={() => approve.mutate(application.userId)}
                      >
                        {c.approve}
                      </Button>
                      {isPending && (
                        <Button
                          variant="secondary"
                          icon={<X />}
                          disabled={busy}
                          onClick={() => {
                            setRejecting(application)
                            setReason('')
                            setReasonError(undefined)
                          }}
                        >
                          {c.reject}
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </DataView>

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={c.rejectDialog.title}
        body={c.rejectDialog.body}
        confirmLabel={c.rejectDialog.confirm}
        tone="danger"
        loading={reject.isPending}
        onConfirm={() => {
          if (rejecting) reject.mutate({ userId: rejecting.userId, reason })
        }}
      >
        <TextAreaField
          field={c.rejectDialog.reasonField}
          required
          value={reason}
          error={reasonError}
          onChange={(event) => {
            setReason(event.target.value)
            setReasonError(undefined)
          }}
        />
      </ConfirmDialog>
    </PageShell>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-content-muted [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <dt className="text-sm text-content-secondary">{label}</dt>
        <dd className="truncate text-base text-content-primary">{value}</dd>
      </div>
    </div>
  )
}
