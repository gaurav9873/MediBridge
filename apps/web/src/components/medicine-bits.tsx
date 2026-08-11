'use client'

import { copy } from '@medibridge/copy'
import {
  type DrugSchedule,
  FORM_LABELS,
  type MedicineForm as MedicineFormValue,
  isSellable,
  medicineDifferences,
} from '@medibridge/types'
import { StatusBadge, cn } from '@medibridge/ui'
import { Archive, CheckCircle2, FileWarning, ShieldAlert } from 'lucide-react'
import * as React from 'react'
import type { MedicineSummary } from '@/lib/medicines'

const c = copy.admin.medicines

/**
 * The small pieces every medicine screen repeats.
 *
 * The list, the duplicate review and the merge comparison all have to render
 * "which medicine is this" and "what state is it in". Keeping that in one file
 * is what stops the merge screen calling a schedule "H" while the list calls
 * it "Schedule H" — a difference nobody would notice in review, and everybody
 * would notice while deciding which of two rows to delete.
 */

export function formLabel(form: string): string {
  return FORM_LABELS[form as MedicineFormValue] ?? form
}

export function scheduleLabel(schedule: string): string {
  return c.scheduleLabels[schedule as keyof typeof c.scheduleLabels] ?? schedule
}

/** "500mg · Tablet · 15 tablets" — the line under a medicine's name. */
export function describeMedicineRow(medicine: MedicineSummary): string {
  return [medicine.strength, formLabel(medicine.form), medicine.packSize]
    .filter(Boolean)
    .join(' · ')
}

/** Schedule as a badge. Nothing at all for over-the-counter, which is most rows. */
export function ScheduleBadge({ schedule }: { schedule: string }): React.JSX.Element {
  if (schedule === 'NONE') {
    return (
      <span className="text-content-muted" aria-label={scheduleLabel(schedule)}>
        —
      </span>
    )
  }

  const blocked = !isSellable(schedule as DrugSchedule)
  return (
    <StatusBadge
      label={scheduleLabel(schedule)}
      tone={blocked ? 'danger' : 'warning'}
      icon={blocked ? <ShieldAlert /> : <FileWarning />}
    />
  )
}

/** In use or archived. Always a word plus an icon, never colour alone. */
export function MedicineStatusBadge({ isActive }: { isActive: boolean }): React.JSX.Element {
  return isActive ? (
    <StatusBadge label={c.statusLabels.active} tone="success" icon={<CheckCircle2 />} />
  ) : (
    <StatusBadge label={c.statusLabels.archived} tone="neutral" icon={<Archive />} />
  )
}

/** Name, brand and the identity line. The headline of every medicine card. */
export function MedicineIdentity({
  medicine,
  className,
}: {
  medicine: MedicineSummary
  className?: string
}): React.JSX.Element {
  const detail = describeMedicineRow(medicine)
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="font-semibold text-content-primary">{medicine.name}</span>
      <span className="text-sm text-content-secondary">{medicine.brand}</span>
      {detail && <span className="text-sm text-content-muted">{detail}</span>}
    </div>
  )
}

/** Every field of a medicine as a description list. Used either side of a merge. */
export function MedicineFacts({
  medicine,
  /** Fields that differ from the other side of a comparison, to be highlighted. */
  highlight,
  className,
}: {
  medicine: MedicineSummary
  highlight?: ReadonlySet<string>
  className?: string
}): React.JSX.Element {
  const rows: Array<[key: string, label: string, value: React.ReactNode]> = [
    ['name', c.columns.name, medicine.name],
    ['brand', c.columns.brand, medicine.brand],
    ['composition', c.columns.composition, medicine.composition],
    ['form', c.columns.form, formLabel(medicine.form)],
    ['strength', c.columns.strength, medicine.strength ?? '—'],
    ['packSize', c.columns.packSize, medicine.packSize ?? '—'],
    ['manufacturer', c.fields.manufacturer.label, medicine.manufacturer ?? '—'],
    ['hsnCode', c.fields.hsnCode.label, medicine.hsnCode],
    ['gstRate', c.columns.gstRate, `${medicine.gstRate}%`],
    ['schedule', c.columns.schedule, scheduleLabel(medicine.schedule)],
    [
      'isPrescriptionRequired',
      c.fields.isPrescriptionRequired.label,
      medicine.isPrescriptionRequired ? 'Yes' : 'No',
    ],
    ['stockItems', c.columns.stocked, c.list.stockedBy(medicine.stockItems)],
  ]

  return (
    <dl className={cn('flex flex-col', className)}>
      {rows.map(([key, label, value], index) => {
        const differs = highlight?.has(key) ?? false
        return (
          <div
            key={key}
            className={cn(
              'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5',
              index > 0 && 'border-t border-border-default',
              // A tinted row, plus the word "differs" for anyone who cannot
              // see the tint.
              differs && 'bg-warning-50',
            )}
          >
            <dt className="text-sm text-content-secondary">
              {label}
              {differs && <span className="sr-only"> (differs)</span>}
            </dt>
            <dd className="text-right text-sm font-medium break-words text-content-primary">
              {value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * Which fields two medicines disagree on, as a set the facts table can query.
 *
 * The comparison itself is a medicine rule and lives in @medibridge/types —
 * notably it does not call a missing pack size different from an empty one.
 */
export function differingFields(
  left: MedicineSummary,
  right: MedicineSummary,
): ReadonlySet<string> {
  return new Set<string>(medicineDifferences(left, right))
}
