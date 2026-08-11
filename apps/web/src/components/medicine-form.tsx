'use client'

import { copy } from '@medibridge/copy'
import {
  ALLOWED_GST_RATES,
  DrugSchedule,
  FORM_LABELS,
  MedicineForm as MedicineFormEnum,
  type MedicineInput,
  PRESCRIPTION_SCHEDULES,
  SCHEDULE_LABELS,
  isSellable,
  medicineSchema,
  normaliseMedicineOptionals,
} from '@medibridge/types'
import {
  Alert,
  Button,
  CheckboxField,
  FieldSection,
  SelectField,
  StickyActionBar,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import { ApiClientError, applyFieldErrors } from '@/lib/api-client'

const c = copy.admin.medicines

/**
 * What the inputs hold, which is not quite what the API receives.
 *
 * `schedule` and `isPrescriptionRequired` carry Zod defaults, so they are
 * optional going in and guaranteed coming out. Typing the form with both ends
 * keeps `handleSubmit` giving us a complete MedicineInput while the register
 * calls still line up with the fields actually on screen.
 */
type MedicineFormValues = z.input<typeof medicineSchema>

const formOptions = Object.values(MedicineFormEnum).map((value) => ({
  value,
  label: FORM_LABELS[value],
}))

const scheduleOptions = Object.values(DrugSchedule).map((value) => ({
  value,
  label: SCHEDULE_LABELS[value],
}))

const gstOptions = ALLOWED_GST_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }))

export const EMPTY_MEDICINE: MedicineInput = {
  name: '',
  brand: '',
  composition: '',
  form: MedicineFormEnum.TABLET,
  strength: '',
  packSize: '',
  manufacturer: '',
  hsnCode: '',
  gstRate: 12,
  schedule: DrugSchedule.NONE,
  isPrescriptionRequired: false,
}

/**
 * The one medicine form.
 *
 * Shared by Add, Edit and "approve a request", because all three write the
 * same row through the same schema — and a second copy of these eleven fields
 * would be a second place for the help text to go stale.
 *
 * Two rules are mirrored here from the domain layer rather than reimplemented:
 * `isSellable` decides whether a schedule can be saved at all, and
 * `PRESCRIPTION_SCHEDULES` decides when the prescription box stops being the
 * user's choice. The server enforces both again — this only means the user
 * finds out while typing instead of after submitting.
 */
export function MedicineForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
  isSubmitting = false,
  formId = 'medicine-form',
}: {
  defaultValues?: Partial<MedicineInput>
  submitLabel: string
  /** Should throw on failure — field errors are caught and shown inline here. */
  onSubmit: (values: MedicineInput) => Promise<unknown>
  onCancel: () => void
  isSubmitting?: boolean
  formId?: string
}): React.JSX.Element {
  const form = useForm<MedicineFormValues, unknown, MedicineInput>({
    resolver: zodResolver(medicineSchema),
    defaultValues: { ...EMPTY_MEDICINE, ...defaultValues },
  })

  // useWatch rather than form.watch(): the watch() function cannot be memoized,
  // which the react-hooks lint rule flags for good reason.
  const watchedSchedule = useWatch({ control: form.control, name: 'schedule' })
  const schedule = watchedSchedule ?? DrugSchedule.NONE

  const scheduleBlocked = !isSellable(schedule)
  const prescriptionForced = PRESCRIPTION_SCHEDULES.includes(schedule)

  // A forced schedule and an unticked box is a mistake, and the safe reading
  // of that mistake is the stricter one. Keep the value honest as it changes.
  React.useEffect(() => {
    if (prescriptionForced) form.setValue('isPrescriptionRequired', true)
  }, [prescriptionForced, form])

  const submit = form.handleSubmit(async (values) => {
    try {
      // An untouched optional box must reach the API as absent rather than as
      // "", or it slips past the unique constraint that keeps one medicine to
      // one row. The rule lives in the medicine domain; this just applies it.
      await onSubmit(normaliseMedicineOptionals(values))
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    }
  })

  const errors = form.formState.errors
  const disabled = isSubmitting || scheduleBlocked

  return (
    <>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-8 pb-24 sm:pb-0">
        <FieldSection
          title={c.form.sections.identity.title}
          description={c.form.sections.identity.description}
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
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.strength}
              error={errors.strength?.message}
              autoComplete="off"
              {...form.register('strength')}
            />
            <TextField
              field={c.fields.packSize}
              error={errors.packSize?.message}
              autoComplete="off"
              {...form.register('packSize')}
            />
          </div>
          <p className="text-sm text-content-secondary">{c.form.identityHint}</p>
        </FieldSection>

        <FieldSection
          title={c.form.sections.details.title}
          description={c.form.sections.details.description}
        >
          <TextField
            field={c.fields.composition}
            error={errors.composition?.message}
            required
            autoComplete="off"
            {...form.register('composition')}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              field={c.fields.form}
              error={errors.form?.message}
              options={formOptions}
              required
              {...form.register('form')}
            />
            <TextField
              field={c.fields.manufacturer}
              error={errors.manufacturer?.message}
              autoComplete="off"
              {...form.register('manufacturer')}
            />
          </div>
        </FieldSection>

        <FieldSection
          title={c.form.sections.compliance.title}
          description={c.form.sections.compliance.description}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.hsnCode}
              error={errors.hsnCode?.message}
              required
              inputMode="numeric"
              autoComplete="off"
              {...form.register('hsnCode')}
            />
            <SelectField
              field={c.fields.gstRate}
              error={errors.gstRate?.message}
              options={gstOptions}
              required
              {...form.register('gstRate', { valueAsNumber: true })}
            />
          </div>

          <SelectField
            field={c.fields.schedule}
            error={errors.schedule?.message}
            options={scheduleOptions}
            required
            {...form.register('schedule')}
          />

          {scheduleBlocked && (
            <Alert tone="danger" title={c.scheduleXBlocked}>
              {c.form.scheduleXWarning}
            </Alert>
          )}

          <CheckboxField
            field={c.fields.isPrescriptionRequired}
            error={errors.isPrescriptionRequired?.message}
            disabled={prescriptionForced}
            {...form.register('isPrescriptionRequired')}
          />

          {prescriptionForced && (
            <p role="status" className="text-sm text-content-secondary">
              {c.form.prescriptionForced}
            </p>
          )}
        </FieldSection>

        {/* Desktop actions. On mobile these live in the sticky bar below. */}
        <div className="hidden gap-3 sm:flex">
          <Button type="submit" size="lg" loading={isSubmitting} disabled={disabled}>
            {submitLabel}
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={onCancel}>
            {c.form.cancel}
          </Button>
        </div>
      </form>

      {/* Thumb-reachable primary action, per the mobile rule in the standard. */}
      <StickyActionBar>
        <Button
          type="submit"
          form={formId}
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={disabled}
        >
          {submitLabel}
        </Button>
      </StickyActionBar>
    </>
  )
}
