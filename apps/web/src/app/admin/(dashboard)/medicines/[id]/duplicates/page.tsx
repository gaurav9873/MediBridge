'use client'

import { copy } from '@medibridge/copy'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataView,
  PageShell,
  Skeleton,
  StatusBadge,
} from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { CopyCheck, GitMerge, ShieldAlert } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import {
  MedicineIdentity,
  MedicineStatusBadge,
  ScheduleBadge,
} from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import { medicineKeys, medicinesApi } from '@/lib/medicines'

const c = copy.admin.medicines

/**
 * Possible duplicates of one medicine.
 *
 * A review screen, not an action screen: nothing here writes anything. The
 * exact-match constraint in the database already stops the obvious repeats, so
 * everything listed here is a judgement call — "Dolo 650" against "Dolo-650"
 * is one medicine, but a 10-tablet pack against a 15-tablet pack is two. Only
 * a person can tell those apart, so this screen's whole job is to give them
 * enough to decide, then hand off to the merge screen.
 */
export default function DuplicateReviewPage(): React.JSX.Element {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const subject = useQuery({
    queryKey: medicineKeys.detail(id),
    queryFn: () => medicinesApi.get(id),
  })

  const duplicates = useQuery({
    queryKey: medicineKeys.duplicates(id),
    queryFn: () => medicinesApi.duplicates(id),
    // Only worth asking once the subject is known to exist.
    enabled: Boolean(subject.data),
  })

  if (subject.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (subject.error || !subject.data) {
    return (
      <PageShell page={c.duplicates.page} help={c.duplicates.help}>
        <Alert
          tone="danger"
          title={copy.common.feedback.somethingWentWrong}
          action={{ label: copy.common.actions.retry, onClick: () => void subject.refetch() }}
        >
          {subject.error instanceof ApiClientError
            ? subject.error.message
            : copy.common.feedback.somethingWentWrongBody}
        </Alert>
      </PageShell>
    )
  }

  const medicine = subject.data

  return (
    <PageShell
      page={c.duplicates.page}
      help={c.duplicates.help}
      secondaryAction={{
        label: copy.common.actions.back,
        onClick: () => router.push(`/admin/medicines/${id}`),
      }}
    >
      <Card>
        <CardHeader title={c.duplicates.subjectHeading} />
        <CardBody className="flex flex-wrap items-start justify-between gap-3">
          <MedicineIdentity medicine={medicine} />
          <div className="flex flex-wrap items-center gap-2">
            <ScheduleBadge schedule={medicine.schedule} />
            <MedicineStatusBadge isActive={medicine.isActive} />
          </div>
        </CardBody>
      </Card>

      <h2 className="text-lg font-semibold text-content-primary">
        {c.duplicates.candidatesHeading}
      </h2>

      <DataView
        data={duplicates.data}
        isLoading={duplicates.isLoading}
        error={
          duplicates.error instanceof ApiClientError
            ? duplicates.error.message
            : (duplicates.error?.message ?? null)
        }
        emptyState={c.duplicates.empty}
        emptyIcon={<CopyCheck />}
        onRetry={() => void duplicates.refetch()}
      >
        {(candidates) => (
          <div className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <Card key={candidate.medicine.id}>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <MedicineIdentity medicine={candidate.medicine} />

                    <div className="flex flex-wrap items-center gap-2">
                      {candidate.exact ? (
                        <StatusBadge
                          label={c.duplicates.exactBadge}
                          tone="danger"
                          icon={<ShieldAlert />}
                        />
                      ) : (
                        <StatusBadge label={c.duplicates.likelyBadge} tone="warning" />
                      )}
                      <StatusBadge
                        label={c.duplicates.matchStrength(candidate.score)}
                        tone="neutral"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-content-secondary">
                    <ScheduleBadge schedule={candidate.medicine.schedule} />
                    <MedicineStatusBadge isActive={candidate.medicine.isActive} />
                    <span>{c.list.stockedBy(candidate.medicine.stockItems)}</span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      icon={<GitMerge />}
                      onClick={() =>
                        router.push(`/admin/medicines/${id}/merge/${candidate.medicine.id}`)
                      }
                    >
                      {c.duplicates.compareCta}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => router.push(`/admin/medicines/${candidate.medicine.id}`)}
                    >
                      {c.list.editCta}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}

            <p className="text-sm text-content-secondary">{c.duplicates.dismissHint}</p>
          </div>
        )}
      </DataView>
    </PageShell>
  )
}
