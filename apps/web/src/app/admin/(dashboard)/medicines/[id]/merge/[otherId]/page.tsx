'use client'

import { copy } from '@medibridge/copy'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  PageShell,
  Skeleton,
  StickyActionBar,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, GitMerge } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import {
  MedicineFacts,
  MedicineIdentity,
  MedicineStatusBadge,
  differingFields,
} from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import { medicineKeys, medicinesApi } from '@/lib/medicines'

const c = copy.admin.medicines

/**
 * Merging two medicines into one.
 *
 * The only destructive action in this module, so it is the only screen that
 * shows every field of both rows side by side before asking. Fields that
 * disagree are tinted AND marked up for screen readers — the whole decision is
 * "which of these two spellings is the right one", and that is impossible to
 * make from two names alone.
 *
 * Which row survives is a choice, not an accident of which link was clicked,
 * so it can be swapped right up to the confirmation.
 */
export default function MergeMedicinesPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string; otherId: string }>()

  const [swapped, setSwapped] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [result, setResult] = React.useState<{ moved: number; collided: number } | null>(null)

  const subject = useQuery({
    queryKey: medicineKeys.detail(params.id),
    queryFn: () => medicinesApi.get(params.id),
  })

  const other = useQuery({
    queryKey: medicineKeys.detail(params.otherId),
    queryFn: () => medicinesApi.get(params.otherId),
  })

  const merge = useMutation({
    mutationFn: (input: { keepId: string; mergeId: string }) => medicinesApi.merge(input),
    onSuccess: (mergeResult) => {
      setConfirming(false)
      setResult(mergeResult)
      void queryClient.invalidateQueries({ queryKey: medicineKeys.all })
      notify.success(c.merge.success(mergeResult.moved))
    },
    onError: (mergeError) => {
      setConfirming(false)
      notify.error(mergeError instanceof ApiClientError ? mergeError.message : undefined)
    },
  })

  if (subject.isLoading || other.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    )
  }

  if (!subject.data || !other.data) {
    const failure = subject.error ?? other.error
    return (
      <PageShell page={c.merge.page} help={c.merge.help}>
        <Alert
          tone="danger"
          title={copy.common.feedback.somethingWentWrong}
          action={{
            label: copy.common.actions.retry,
            onClick: () => {
              void subject.refetch()
              void other.refetch()
            },
          }}
        >
          {failure instanceof ApiClientError
            ? failure.message
            : copy.common.feedback.somethingWentWrongBody}
        </Alert>
      </PageShell>
    )
  }

  const keep = swapped ? other.data : subject.data
  const discard = swapped ? subject.data : other.data
  const differs = differingFields(keep, discard)

  // Once merged, the comparison is history — showing it again would invite a
  // second merge of two rows that no longer relate to each other.
  if (result) {
    return (
      <PageShell page={c.merge.page} help={c.merge.help}>
        <Alert tone="success" title={c.merge.success(result.moved)}>
          {c.merge.confirm.body}
        </Alert>

        {result.collided > 0 && (
          <Alert tone="warning" title={c.merge.collisionWarning(result.collided)} />
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => router.push(`/admin/medicines/${keep.id}`)}>
            {keep.name}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/admin/medicines')}>
            {c.page.title}
          </Button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      page={c.merge.page}
      help={c.merge.help}
      secondaryAction={{
        label: copy.common.actions.back,
        onClick: () => router.push(`/admin/medicines/${params.id}/duplicates`),
      }}
    >
      <Alert tone="warning" title={c.merge.swapHint}>
        {c.merge.stockNote(discard.stockItems)}
      </Alert>

      <div className="flex justify-center">
        <Button variant="secondary" icon={<ArrowLeftRight />} onClick={() => setSwapped(!swapped)}>
          {c.merge.swapCta}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Keeping. Named first on mobile, where the two stack. */}
        <Card className="border-success-100">
          <CardHeader title={c.merge.keepHeading} />
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <MedicineIdentity medicine={keep} />
              <MedicineStatusBadge isActive={keep.isActive} />
            </div>
            <div className="rounded-(--radius-md) border border-border-default">
              <MedicineFacts medicine={keep} highlight={differs} />
            </div>
          </CardBody>
        </Card>

        <Card className="border-danger-100">
          <CardHeader title={c.merge.mergeHeading} />
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <MedicineIdentity medicine={discard} />
              <MedicineStatusBadge isActive={discard.isActive} />
            </div>
            <div className="rounded-(--radius-md) border border-border-default">
              <MedicineFacts medicine={discard} highlight={differs} />
            </div>
            <Button variant="secondary" onClick={() => setSwapped(!swapped)}>
              {c.merge.keepCta}
            </Button>
          </CardBody>
        </Card>
      </div>

      <p className="text-sm text-content-secondary">
        {differs.size === 0 ? c.merge.identical : c.merge.differences}
      </p>

      <div className="hidden sm:flex">
        <Button variant="danger" size="lg" icon={<GitMerge />} onClick={() => setConfirming(true)}>
          {c.merge.confirm.confirmLabel}
        </Button>
      </div>

      <StickyActionBar>
        <Button
          variant="danger"
          size="lg"
          fullWidth
          icon={<GitMerge />}
          onClick={() => setConfirming(true)}
        >
          {c.merge.confirm.confirmLabel}
        </Button>
      </StickyActionBar>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={c.merge.confirm.title}
        body={c.merge.confirm.body}
        confirmLabel={c.merge.confirm.confirmLabel}
        tone="danger"
        loading={merge.isPending}
        onConfirm={() => merge.mutate({ keepId: keep.id, mergeId: discard.id })}
      >
        <div className="flex flex-col gap-2 rounded-(--radius-md) bg-surface-sunken p-3">
          <p className="text-sm text-content-secondary">
            {c.merge.keepHeading}:{' '}
            <span className="font-medium text-content-primary">
              {keep.name} · {keep.brand}
            </span>
          </p>
          <p className="text-sm text-content-secondary">
            {c.merge.mergeHeading}:{' '}
            <span className="font-medium text-content-primary">
              {discard.name} · {discard.brand}
            </span>
          </p>
          <p className="text-sm text-content-secondary">{c.merge.stockNote(discard.stockItems)}</p>
        </div>
      </ConfirmDialog>
    </PageShell>
  )
}
