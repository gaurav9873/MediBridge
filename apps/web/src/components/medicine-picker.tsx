'use client'

import { copy } from '@medibridge/copy'
import { Button, Card, CardBody, Skeleton, TextField } from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { Check, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { describeMedicineRow } from '@/components/medicine-bits'
import { type MedicineSummary, medicinesApi } from '@/lib/medicines'

const c = copy.inventory.form.fields

/**
 * Choosing which medicine a batch is.
 *
 * A search-and-pick list rather than a dropdown: the catalogue has thousands
 * of rows, and a `<select>` of thousands is unusable on a phone and unusable
 * with a keyboard. Typing narrows it the same way the rest of the product's
 * search does.
 *
 * Only active medicines are offered — an archived one cannot legally take new
 * stock, and offering it just to refuse on submit wastes the distributor's
 * time. The server enforces that again regardless.
 */
export function MedicinePicker({
  value,
  onChange,
  error,
}: {
  value: MedicineSummary | null
  onChange: (medicine: MedicineSummary | null) => void
  error?: string
}): React.JSX.Element {
  const router = useRouter()
  const [term, setTerm] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(timer)
  }, [term])

  const { data, isFetching } = useQuery({
    queryKey: ['medicines', 'picker', debounced],
    queryFn: () =>
      medicinesApi.list({
        search: debounced,
        form: '',
        schedule: '',
        status: 'active',
        page: 1,
        pageSize: 8,
      }),
    enabled: debounced.trim().length >= 2,
  })

  // Chosen: show what was picked rather than the search box, so the answer is
  // visible while the rest of the form is filled in.
  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-content-primary">{c.medicine.label}</span>
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Check className="mt-0.5 size-5 shrink-0 text-success-600" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <span className="font-semibold text-content-primary">{value.name}</span>
                <span className="text-sm text-content-secondary">
                  {value.brand}
                  {describeMedicineRow(value) ? ` · ${describeMedicineRow(value)}` : ''}
                </span>
              </div>
            </div>
            <Button variant="secondary" onClick={() => onChange(null)}>
              {copy.common.actions.edit}
            </Button>
          </CardBody>
        </Card>
        <p className="text-sm text-content-secondary">{c.medicine.helperText}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        field={c.medicine}
        type="search"
        value={term}
        error={error}
        leading={<Search className="size-4" aria-hidden />}
        onChange={(event) => setTerm(event.target.value)}
      />

      {debounced.trim().length >= 2 && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {isFetching && <Skeleton className="h-24 w-full" />}

          {!isFetching && data?.items.length === 0 && (
            <Card>
              <CardBody className="flex flex-col items-start gap-3">
                <p className="text-sm text-content-secondary">
                  {copy.admin.medicines.empty.filteredBody}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => router.push('/account/medicine-requests/new')}
                >
                  {c.requestMedicine}
                </Button>
              </CardBody>
            </Card>
          )}

          {!isFetching &&
            data?.items.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                onClick={() => onChange(medicine)}
                className="flex min-h-(--size-touch) flex-col items-start gap-0.5 rounded-(--radius-md) border border-border-default bg-surface p-3 text-left hover:bg-surface-hover"
              >
                <span className="font-medium text-content-primary">{medicine.name}</span>
                <span className="text-sm text-content-secondary">
                  {medicine.brand}
                  {describeMedicineRow(medicine) ? ` · ${describeMedicineRow(medicine)}` : ''}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
