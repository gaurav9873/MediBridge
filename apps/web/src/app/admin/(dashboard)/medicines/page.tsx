'use client'

import { copy } from '@medibridge/copy'
import type { Paginated } from '@medibridge/types'
import {
  Alert,
  Card,
  CardBody,
  type Column,
  DataView,
  PageShell,
  ResponsiveTable,
  StatusBadge,
  TextField,
} from '@medibridge/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Pill } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface MedicineRow {
  id: string
  name: string
  brand: string
  composition: string
  form: string
  strength: string | null
  packSize: string | null
  schedule: string
  gstRate: number
  isActive: boolean
  distributorCount: number
}

/**
 * The shared medicine catalogue.
 *
 * Read-only for now: adding and editing single medicines arrives in Phase 3.
 * Bulk import already works, and is the realistic way a catalogue this size
 * gets populated anyway.
 */
export default function AdminMedicinesPage(): React.JSX.Element {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  // Debounced so typing does not fire a query per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'medicines', debounced],
    queryFn: () =>
      api.get<Paginated<MedicineRow>>(
        `/admin/medicines?pageSize=50${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  })

  const columns: ReadonlyArray<Column<MedicineRow>> = [
    { key: 'name', header: 'Medicine', mobile: 'primary', render: (m) => m.name },
    { key: 'brand', header: 'Brand', mobile: 'secondary', render: (m) => m.brand },
    { key: 'composition', header: 'Salt', render: (m) => m.composition },
    { key: 'form', header: 'Type', render: (m) => m.form },
    { key: 'pack', header: 'Pack', mobile: 'hidden', render: (m) => m.packSize ?? '—' },
    { key: 'gst', header: 'GST', align: 'right', render: (m) => `${m.gstRate}%` },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (m) =>
        m.schedule === 'NONE' ? (
          <span className="text-content-muted">—</span>
        ) : (
          <StatusBadge label={m.schedule} tone={m.schedule === 'X' ? 'danger' : 'warning'} />
        ),
    },
    {
      key: 'stock',
      header: 'Stocked by',
      align: 'right',
      render: (m) =>
        m.distributorCount > 0 ? (
          <span className="tabular-nums">{m.distributorCount}</span>
        ) : (
          <span className="text-content-muted">none</span>
        ),
    },
  ]

  return (
    <PageShell
      page={{
        title: copy.admin.medicines.page.title,
        subtitle: copy.admin.medicines.page.subtitle,
      }}
      help={copy.admin.medicines.help}
      primaryAction={{ label: 'Import Medicines', href: '/admin/imports' }}
      toolbar={
        <div className="max-w-md">
          <TextField
            field={{
              label: 'Search',
              helperText: 'Type a medicine name, brand or salt to narrow the list.',
              placeholder: 'e.g. Paracetamol',
            }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      }
    >
      <Alert tone="info" title="Adding and editing single medicines is not built yet.">
        You can browse and search the catalogue here. To add many at once, use Bulk Imports — that
        already works.
      </Alert>

      <DataView
        data={data?.items}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={copy.admin.medicines.empty}
        emptyIcon={<Pill />}
        isFiltered={debounced.length > 0}
        onClearFilters={() => setSearch('')}
        onEmptyAction={() => router.push('/admin/imports')}
        onRetry={() => void refetch()}
      >
        {(items) => (
          <div className="flex flex-col gap-3">
            <ResponsiveTable
              columns={columns}
              rows={items}
              rowKey={(m) => m.id}
              caption="Medicine catalogue"
            />
            <Card>
              <CardBody className="text-sm text-content-secondary">
                Showing {items.length} of {data?.total.toLocaleString('en-IN')} medicines.
              </CardBody>
            </Card>
          </div>
        )}
      </DataView>
    </PageShell>
  )
}
