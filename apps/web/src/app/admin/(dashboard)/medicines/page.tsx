'use client'

import { copy } from '@medibridge/copy'
import { DrugSchedule, FORM_LABELS, MedicineForm as MedicineFormEnum } from '@medibridge/types'
import {
  Button,
  Card,
  CardBody,
  type Column,
  DataView,
  PageShell,
  ResponsiveTable,
  SelectField,
  StickyActionBar,
  TextField,
} from '@medibridge/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Inbox, Pill } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { MedicineStatusBadge, ScheduleBadge, formLabel } from '@/components/medicine-bits'
import { ApiClientError } from '@/lib/api-client'
import {
  DEFAULT_MEDICINE_FILTERS,
  type MedicineListFilters,
  type MedicineSummary,
  activeFilterCount,
  medicineKeys,
  medicinesApi,
} from '@/lib/medicines'

const c = copy.admin.medicines

const formOptions = [
  { value: '', label: c.filters.anyForm },
  ...Object.values(MedicineFormEnum).map((value) => ({ value, label: FORM_LABELS[value] })),
]

const scheduleOptions = [
  { value: '', label: c.filters.anySchedule },
  ...Object.values(DrugSchedule).map((value) => ({
    value,
    label: c.scheduleLabels[value],
  })),
]

const statusOptions = [
  { value: 'active', label: c.statusOptions.active },
  { value: 'archived', label: c.statusOptions.archived },
  { value: 'all', label: c.statusOptions.all },
]

/**
 * The medicine catalogue.
 *
 * One shared list owned by the platform, which is what makes "who else sells
 * this?" answerable at all. Everything on this screen therefore reads the
 * global `/medicines` endpoint rather than anything tenant-scoped.
 *
 * The search box is debounced and the query keeps its previous data, so typing
 * refines a visible list instead of flashing a skeleton on every keystroke.
 * Filters reset the page to 1 — landing on "page 4 of 1" after narrowing a
 * search is the kind of thing that reads as a broken screen.
 */
export default function AdminMedicinesPage(): React.JSX.Element {
  const router = useRouter()
  const [filters, setFilters] = React.useState<MedicineListFilters>(DEFAULT_MEDICINE_FILTERS)
  const [searchInput, setSearchInput] = React.useState('')

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput, page: 1 },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const update = (patch: Partial<MedicineListFilters>): void => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))
  }

  const clearFilters = (): void => {
    setSearchInput('')
    setFilters(DEFAULT_MEDICINE_FILTERS)
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: medicineKeys.list(filters),
    queryFn: () => medicinesApi.list(filters),
    placeholderData: keepPreviousData,
  })

  const filterCount = activeFilterCount(filters)

  const columns: ReadonlyArray<Column<MedicineSummary>> = [
    {
      key: 'name',
      header: c.columns.name,
      mobile: 'primary',
      // Strength and pack size ride along under the name rather than taking two
      // more columns: ten columns pushes the last one off the edge at 1280px,
      // and these two are only ever read together with the name anyway.
      render: (medicine) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-content-primary">{medicine.name}</span>
          {(medicine.strength ?? medicine.packSize) && (
            <span className="text-sm text-content-muted">
              {[medicine.strength, medicine.packSize].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'brand',
      header: c.columns.brand,
      mobile: 'secondary',
      render: (medicine) => medicine.brand,
    },
    {
      key: 'composition',
      header: c.columns.composition,
      render: (medicine) => medicine.composition,
    },
    { key: 'form', header: c.columns.form, render: (medicine) => formLabel(medicine.form) },
    {
      key: 'gstRate',
      header: c.columns.gstRate,
      align: 'right',
      render: (medicine) => `${medicine.gstRate}%`,
    },
    {
      key: 'schedule',
      header: c.columns.schedule,
      render: (medicine) => <ScheduleBadge schedule={medicine.schedule} />,
    },
    {
      key: 'stocked',
      header: c.columns.stocked,
      align: 'right',
      render: (medicine) =>
        medicine.stockItems > 0 ? (
          <span className="tabular-nums">{medicine.stockItems}</span>
        ) : (
          <span className="text-content-muted">none</span>
        ),
    },
    {
      key: 'status',
      header: c.columns.status,
      render: (medicine) => <MedicineStatusBadge isActive={medicine.isActive} />,
    },
  ]

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0

  return (
    <PageShell
      page={c.page}
      help={c.help}
      primaryAction={{ label: c.addCta, href: '/admin/medicines/new' }}
      secondaryAction={{ label: c.requestQueue.title, href: '/admin/medicines/requests' }}
      toolbar={
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              field={c.filters.search}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <SelectField
              field={c.filters.form}
              options={formOptions}
              value={filters.form}
              onChange={(event) => update({ form: event.target.value })}
            />
            <SelectField
              field={c.filters.schedule}
              options={scheduleOptions}
              value={filters.schedule}
              onChange={(event) => update({ schedule: event.target.value })}
            />
            <SelectField
              field={c.filters.status}
              options={statusOptions}
              value={filters.status}
              onChange={(event) =>
                update({ status: event.target.value as MedicineListFilters['status'] })
              }
            />
          </div>

          {filterCount > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-content-secondary">
                {c.filters.activeCount(filterCount)}
              </span>
              <Button variant="link" onClick={clearFilters}>
                {c.filters.clear}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <DataView
        data={data?.items}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={c.empty}
        emptyIcon={<Pill />}
        isFiltered={filterCount > 0}
        onClearFilters={clearFilters}
        onEmptyAction={() => router.push('/admin/medicines/new')}
        onRetry={() => void refetch()}
      >
        {(items) => (
          <div className="flex flex-col gap-4">
            {/* aria-busy rather than a skeleton: the rows below are the previous
                page and are still readable while the next one loads. */}
            <div aria-busy={isFetching} className="flex flex-col gap-3">
              <ResponsiveTable
                columns={columns}
                rows={items}
                rowKey={(medicine) => medicine.id}
                onRowClick={(medicine) => router.push(`/admin/medicines/${medicine.id}`)}
                caption={c.page.title}
                mobileFooter={(medicine) => (
                  <div className="flex flex-wrap gap-2">
                    <MedicineStatusBadge isActive={medicine.isActive} />
                    <span className="text-sm text-content-secondary">
                      {c.list.stockedBy(medicine.stockItems)}
                    </span>
                  </div>
                )}
              />
            </div>

            {data && (
              <Card>
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-content-primary">
                      {c.list.showing(from, to, data.total)}
                    </span>
                    <span className="text-sm text-content-secondary">{c.list.sortedByName}</span>
                  </div>

                  <nav aria-label="Pages" className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      icon={<ChevronLeft />}
                      disabled={data.page <= 1}
                      onClick={() => update({ page: data.page - 1 })}
                    >
                      {c.list.previous}
                    </Button>
                    <span aria-live="polite" className="px-1 text-sm text-content-secondary">
                      {c.list.pageOf(data.page, data.totalPages)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={data.page >= data.totalPages}
                      onClick={() => update({ page: data.page + 1 })}
                    >
                      {c.list.next}
                      <ChevronRight aria-hidden />
                    </Button>
                  </nav>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </DataView>

      {/* The primary action is hidden by PageShell on mobile so it can live
          here, within a thumb's reach. */}
      <StickyActionBar>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<Inbox />}
            onClick={() => router.push('/admin/medicines/requests')}
          >
            <span className="sr-only">{c.requestQueue.title}</span>
          </Button>
          <Button size="lg" fullWidth onClick={() => router.push('/admin/medicines/new')}>
            {c.addCta}
          </Button>
        </div>
      </StickyActionBar>
    </PageShell>
  )
}
