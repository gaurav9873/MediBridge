'use client'

import { copy } from '@medibridge/copy'
import type { MedicineInput } from '@medibridge/types'
import {
  Alert,
  Button,
  ConfirmDialog,
  FormSkeleton,
  PageShell,
  Skeleton,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, CopyCheck, RotateCcw } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { MedicineForm } from '@/components/medicine-form'
import { MedicineStatusBadge } from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import { medicineKeys, medicinesApi } from '@/lib/medicines'

const c = copy.admin.medicines

/**
 * Editing one medicine, and the two things that can happen to it.
 *
 * Archive and restore sit here rather than on the list because both need the
 * medicine's stock count in front of the person deciding. Archiving something
 * six distributors are actively selling would empty their inventory screens,
 * so the server refuses it — and this screen says so before they try.
 */
export default function EditMedicinePage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [confirming, setConfirming] = React.useState<'archive' | 'restore' | null>(null)
  const [blockedReason, setBlockedReason] = React.useState<string | null>(null)

  const { data: medicine, isLoading, error, refetch } = useQuery({
    queryKey: medicineKeys.detail(id),
    queryFn: () => medicinesApi.get(id),
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: medicineKeys.all })
  }

  const update = useMutation({
    mutationFn: (input: MedicineInput) => medicinesApi.update(id, input),
    onSuccess: () => {
      refresh()
      notify.success(c.success.updated)
      router.push('/admin/medicines')
    },
  })

  const setArchived = useMutation({
    mutationFn: (archived: boolean) =>
      archived ? medicinesApi.archive(id) : medicinesApi.restore(id),
    onSuccess: (_result, archived) => {
      setConfirming(null)
      setBlockedReason(null)
      refresh()
      notify.success(archived ? c.archive.success : c.restore.success)
    },
    onError: (mutationError) => {
      setConfirming(null)
      // The server's refusal names the number of sellers still holding stock,
      // which is the only thing that makes it actionable. Keep it on screen
      // rather than in a toast that disappears.
      if (mutationError instanceof ApiClientError) {
        setBlockedReason(mutationError.fields?.[0]?.message ?? mutationError.message)
      } else {
        notify.error()
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <FormSkeleton />
      </div>
    )
  }

  if (error || !medicine) {
    return (
      <PageShell page={c.form.editPage} help={c.form.editHelp}>
        <Alert
          tone="danger"
          title={copy.common.feedback.somethingWentWrong}
          action={{ label: copy.common.actions.retry, onClick: () => void refetch() }}
        >
          {error instanceof ApiClientError ? error.message : copy.common.feedback.somethingWentWrongBody}
        </Alert>
      </PageShell>
    )
  }

  const archived = !medicine.isActive

  return (
    <PageShell
      page={{
        title: medicine.name,
        subtitle: c.form.editPage.subtitle,
      }}
      help={c.form.editHelp}
      secondaryAction={{ label: c.form.cancel, onClick: () => router.push('/admin/medicines') }}
      banner={
        archived ? (
          <Alert tone="warning" title={c.statusLabels.archived}>
            {c.archive.confirm.body}
          </Alert>
        ) : undefined
      }
    >
      {blockedReason && (
        <Alert tone="danger" title={c.archive.blockedTitle}>
          {blockedReason}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <MedicineStatusBadge isActive={medicine.isActive} />
        <span className="text-sm text-content-secondary">
          {c.list.stockedBy(medicine.stockItems)}
        </span>
      </div>

      <MedicineForm
        defaultValues={{
          name: medicine.name,
          brand: medicine.brand,
          composition: medicine.composition,
          form: medicine.form as MedicineInput['form'],
          strength: medicine.strength ?? '',
          packSize: medicine.packSize ?? '',
          manufacturer: medicine.manufacturer ?? '',
          hsnCode: medicine.hsnCode,
          gstRate: medicine.gstRate as MedicineInput['gstRate'],
          schedule: medicine.schedule as MedicineInput['schedule'],
          isPrescriptionRequired: medicine.isPrescriptionRequired,
        }}
        submitLabel={c.form.submitEdit}
        isSubmitting={update.isPending}
        onSubmit={(values) => update.mutateAsync(values)}
        onCancel={() => router.push('/admin/medicines')}
      />

      <div className="flex flex-col gap-3 border-t border-border-default pt-5 sm:flex-row">
        <Button
          variant="secondary"
          icon={<CopyCheck />}
          onClick={() => router.push(`/admin/medicines/${id}/duplicates`)}
        >
          {c.list.duplicatesCta}
        </Button>

        {archived ? (
          <Button
            variant="secondary"
            icon={<RotateCcw />}
            onClick={() => setConfirming('restore')}
          >
            {c.restore.cta}
          </Button>
        ) : (
          <Button variant="danger" icon={<Archive />} onClick={() => setConfirming('archive')}>
            {c.archive.cta}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming === 'restore' ? c.restore.confirm.title : c.archive.confirm.title}
        body={confirming === 'restore' ? c.restore.confirm.body : c.archive.confirm.body}
        confirmLabel={
          confirming === 'restore' ? c.restore.confirm.confirmLabel : c.archive.confirm.confirmLabel
        }
        tone={confirming === 'archive' ? 'danger' : 'default'}
        loading={setArchived.isPending}
        onConfirm={() => setArchived.mutate(confirming === 'archive')}
      >
        {confirming === 'archive' && medicine.stockItems > 0 && (
          <Alert tone="warning" title={c.archive.blockedTitle}>
            {c.archive.stockWarning(medicine.stockItems)}
          </Alert>
        )}
      </ConfirmDialog>
    </PageShell>
  )
}
