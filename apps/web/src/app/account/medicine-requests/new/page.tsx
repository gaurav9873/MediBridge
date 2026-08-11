'use client'

import { copy } from '@medibridge/copy'
import {
  FORM_LABELS,
  MedicineForm as MedicineFormEnum,
  type MedicineRequestInput,
  medicineRequestSchema,
} from '@medibridge/types'
import {
  Alert,
  Button,
  PageShell,
  SelectField,
  StickyActionBar,
  TextAreaField,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ApiClientError, applyFieldErrors } from '@/lib/api-client'
import {
  type RequestAlreadyExists,
  isAlreadyExists,
  medicineKeys,
  medicinesApi,
} from '@/lib/medicines'

const c = copy.admin.medicines.requests.newRequest

const formOptions = [
  { value: '', label: copy.admin.medicines.filters.anyForm },
  ...Object.values(MedicineFormEnum).map((value) => ({ value, label: FORM_LABELS[value] })),
]

/**
 * Asking for a medicine that is missing from the shared catalogue.
 *
 * The server checks the catalogue before it queues anything, and most requests
 * turn out to be somebody not finding a row that already exists. That answer
 * arrives on this screen as good news rather than as an error — there is
 * nothing to wait for, and the name it is listed under is what they needed.
 */
export default function NewMedicineRequestPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [existing, setExisting] = React.useState<RequestAlreadyExists | null>(null)

  const form = useForm<MedicineRequestInput>({
    resolver: zodResolver(medicineRequestSchema),
    defaultValues: {
      name: '',
      brand: '',
      composition: '',
      form: '',
      strength: '',
      notes: '',
    },
  })

  const submit = useMutation({
    mutationFn: (values: MedicineRequestInput) =>
      medicinesApi.request({
        name: values.name,
        brand: values.brand,
        // Blank optional fields are absent, not empty — the same rule the
        // catalogue form follows, for the same reason.
        composition: values.composition?.trim() || undefined,
        form: values.form?.trim() || undefined,
        strength: values.strength?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: medicineKeys.all })
      if (isAlreadyExists(result)) {
        setExisting(result)
        return
      }
      notify.success(c.success)
      router.push('/account/medicine-requests')
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  const errors = form.formState.errors

  if (existing) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <PageShell page={c.page} help={c.help}>
          <Alert tone="success" title={c.alreadyExists.title}>
            {c.alreadyExists.body(existing.name)}
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => router.push('/account/medicine-requests')}>
              {copy.admin.medicines.requests.mine.page.title}
            </Button>
            <Button variant="secondary" onClick={() => setExisting(null)}>
              {c.page.title}
            </Button>
          </div>
        </PageShell>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <PageShell
        page={c.page}
        help={c.help}
        secondaryAction={{
          label: c.cancel,
          onClick: () => router.push('/account/medicine-requests'),
        }}
      >
        <p className="text-base text-content-secondary">{c.intro}</p>

        <form
          id="medicine-request-form"
          onSubmit={form.handleSubmit((values) => submit.mutate(values))}
          noValidate
          className="flex flex-col gap-5 pb-24 sm:pb-0"
        >
          <TextField
            field={c.fields.name}
            error={errors.name?.message}
            required
            autoComplete="off"
            {...form.register('name')}
          />
          <TextField
            field={c.fields.brand}
            error={errors.brand?.message}
            required
            autoComplete="off"
            {...form.register('brand')}
          />
          <TextField
            field={c.fields.composition}
            error={errors.composition?.message}
            autoComplete="off"
            {...form.register('composition')}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              field={c.fields.form}
              error={errors.form?.message}
              options={formOptions}
              {...form.register('form')}
            />
            <TextField
              field={c.fields.strength}
              error={errors.strength?.message}
              autoComplete="off"
              {...form.register('strength')}
            />
          </div>
          <TextAreaField
            field={c.fields.notes}
            error={errors.notes?.message}
            rows={3}
            {...form.register('notes')}
          />

          <div className="hidden gap-3 sm:flex">
            <Button type="submit" size="lg" loading={submit.isPending}>
              {c.submit}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => router.push('/account/medicine-requests')}
            >
              {c.cancel}
            </Button>
          </div>
        </form>

        <StickyActionBar>
          <Button
            type="submit"
            form="medicine-request-form"
            size="lg"
            fullWidth
            loading={submit.isPending}
          >
            {c.submit}
          </Button>
        </StickyActionBar>
      </PageShell>
    </main>
  )
}
