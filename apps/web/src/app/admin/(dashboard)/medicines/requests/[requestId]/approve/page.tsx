'use client'

import { copy } from '@medibridge/copy'
import {
  DrugSchedule,
  type MedicineForm as MedicineFormValue,
  MedicineForm as MedicineFormEnum,
  type MedicineInput,
} from '@medibridge/types'
import { Alert, Card, CardBody, CardHeader, FormSkeleton, PageShell, Skeleton, notify } from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { MedicineForm } from '@/components/medicine-form'
import { formLabel } from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import { medicineKeys, medicinesApi } from '@/lib/medicines'

const c = copy.admin.medicines.requests.review

/** A request's `form` is free text; only a real MedicineForm can prefill the select. */
function toMedicineForm(value: string | null): MedicineFormValue {
  const match = Object.values(MedicineFormEnum).find((option) => option === value)
  return match ?? MedicineFormEnum.TABLET
}

/**
 * Approving a request by actually adding the medicine.
 *
 * The queue has no "approve" endpoint that guesses the missing fields, and
 * deliberately so — an invented HSN code or GST rate would follow that
 * medicine onto every invoice ever raised for it. What the distributor told us
 * is prefilled and shown separately above the form, so the reviewer can see
 * what was asked for while correcting it.
 */
export default function ApproveMedicineRequestPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useParams<{ requestId: string }>()
  const requestId = params.requestId

  const { data: requests, isLoading, error, refetch } = useQuery({
    queryKey: medicineKeys.pendingRequests,
    queryFn: () => medicinesApi.pendingRequests(),
  })

  const request = requests?.find((candidate) => candidate.id === requestId)

  const approve = useMutation({
    mutationFn: (medicine: MedicineInput) => medicinesApi.approveRequest(requestId, medicine),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: medicineKeys.all })
      notify.success(copy.admin.medicines.success.requestApproved)
      router.push(`/admin/medicines/${result.medicineId}`)
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

  if (error || !request) {
    return (
      <PageShell page={c.approvePage} help={c.help}>
        <Alert
          tone="danger"
          title={
            error ? copy.common.feedback.somethingWentWrong : copy.common.feedback.notFound
          }
          action={
            error
              ? { label: copy.common.actions.retry, onClick: () => void refetch() }
              : {
                  label: c.page.title,
                  onClick: () => router.push('/admin/medicines/requests'),
                }
          }
        >
          {error instanceof ApiClientError ? error.message : copy.common.feedback.notFoundBody}
        </Alert>
      </PageShell>
    )
  }

  return (
    <PageShell
      page={c.approvePage}
      help={c.help}
      secondaryAction={{
        label: copy.common.actions.back,
        onClick: () => router.push('/admin/medicines/requests'),
      }}
    >
      <Card>
        <CardHeader title={c.requestedHeading} description={c.approveIntro} />
        <CardBody>
          <dl className="flex flex-col">
            {(
              [
                [copy.admin.medicines.columns.name, request.name],
                [copy.admin.medicines.columns.brand, request.brand],
                [copy.admin.medicines.columns.composition, request.composition ?? '—'],
                [copy.admin.medicines.columns.form, request.form ? formLabel(request.form) : '—'],
                [copy.admin.medicines.columns.strength, request.strength ?? '—'],
                [c.notesHeading, request.notes ?? c.noNotes],
                [
                  c.labels.askedBy,
                  c.askedBy(request.requestedBy, request.requestedByCompany ?? '—'),
                ],
              ] as Array<[string, string]>
            ).map(([label, value], index) => (
              <div
                key={label}
                className={`flex flex-wrap items-baseline justify-between gap-2 py-2.5 ${
                  index > 0 ? 'border-t border-border-default' : ''
                }`}
              >
                <dt className="text-sm text-content-secondary">{label}</dt>
                <dd className="text-right text-sm font-medium text-content-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <MedicineForm
        defaultValues={{
          name: request.name,
          brand: request.brand,
          composition: request.composition ?? '',
          form: toMedicineForm(request.form),
          strength: request.strength ?? '',
          schedule: DrugSchedule.NONE,
        }}
        submitLabel={c.approveCta}
        isSubmitting={approve.isPending}
        onSubmit={(values) => approve.mutateAsync(values)}
        onCancel={() => router.push('/admin/medicines/requests')}
      />
    </PageShell>
  )
}
