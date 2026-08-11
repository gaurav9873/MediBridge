'use client'

import { copy } from '@medibridge/copy'
import {
  Alert,
  Button,
  Card,
  CardBody,
  DataView,
  PageShell,
  Skeleton,
  StatusBadge,
  type StatusTone,
  StickyActionBar,
} from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { Clock, FlaskConical, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { formLabel } from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import { medicineKeys, medicinesApi } from '@/lib/medicines'
import { useSession } from '@/lib/use-session'

const c = copy.admin.medicines.requests.mine

const statusTone: Record<string, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * The distributor's half of the request queue.
 *
 * Same rows the admin sees, answering a different question: not "what should I
 * decide?" but "what happened to the thing I asked for?". So the rejection
 * reason is the loudest element on a refused request — it is usually the name
 * the medicine is actually listed under, and reading it is the whole fix.
 *
 * Scoped by RLS to this company's own requests; no company id is sent from the
 * browser, and none would be trusted if it were.
 */
export default function MyMedicineRequestsPage(): React.JSX.Element {
  const router = useRouter()
  const { isLoading: sessionLoading, isSignedIn } = useSession()

  React.useEffect(() => {
    if (!sessionLoading && !isSignedIn) router.replace('/login')
  }, [sessionLoading, isSignedIn, router])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: medicineKeys.myRequests,
    queryFn: () => medicinesApi.myRequests(),
    enabled: isSignedIn,
  })

  if (sessionLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-48 w-full" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 pb-28 sm:pb-8">
      <PageShell
        page={c.page}
        help={c.help}
        primaryAction={{ label: c.newCta, href: '/account/medicine-requests/new' }}
        secondaryAction={{
          label: copy.common.actions.back,
          onClick: () => router.push('/account'),
        }}
      >
        <DataView
          data={data}
          isLoading={isLoading}
          error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
          emptyState={c.empty}
          emptyIcon={<FlaskConical />}
          onEmptyAction={() => router.push('/account/medicine-requests/new')}
          onRetry={() => void refetch()}
        >
          {(requests) => (
            <div className="flex flex-col gap-3">
              {requests.map((request) => (
                <Card key={request.id}>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold text-content-primary">{request.name}</span>
                        <span className="text-sm text-content-secondary">
                          {[
                            request.brand,
                            request.strength,
                            request.form && formLabel(request.form),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <StatusBadge
                        label={
                          c.statusLabels[request.status as keyof typeof c.statusLabels] ??
                          request.status
                        }
                        tone={statusTone[request.status] ?? 'neutral'}
                        icon={request.status === 'PENDING' ? <Clock /> : undefined}
                      />
                    </div>

                    <p className="text-sm text-content-muted">
                      {c.askedOn(formatDate(request.createdAt))}
                    </p>

                    {request.status === 'PENDING' && (
                      <p className="text-sm text-content-secondary">{c.pendingNote}</p>
                    )}

                    {request.status === 'APPROVED' && (
                      <Alert tone="success" title={c.approvedNote} />
                    )}

                    {request.status === 'REJECTED' && request.rejectionReason && (
                      <Alert tone="danger" title={c.rejectionHeading}>
                        {request.rejectionReason}
                      </Alert>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </DataView>
      </PageShell>

      <StickyActionBar>
        <Button
          size="lg"
          fullWidth
          icon={<Plus />}
          onClick={() => router.push('/account/medicine-requests/new')}
        >
          {c.newCta}
        </Button>
      </StickyActionBar>
    </main>
  )
}
