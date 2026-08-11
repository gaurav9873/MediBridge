'use client'

import { copy } from '@medibridge/copy'
import {
  Button,
  Card,
  CardBody,
  type Column,
  DataView,
  PageShell,
  ResponsiveTable,
  SelectField,
  StatTile,
  StickyActionBar,
  TextField,
} from '@medibridge/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Package, PackageX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ExpiryBadge, StockBadge } from '@/components/inventory-bits'
import { formatPaise, formatPaiseCompact } from '@medibridge/types'
import { ApiClientError } from '@/lib/api-client'
import {
  DEFAULT_INVENTORY_FILTERS,
  type InventoryFilters,
  type InventoryItem,
  activeInventoryFilterCount,
  inventoryApi,
  inventoryKeys,
} from '@/lib/inventory'

const c = copy.inventory.list

/**
 * A distributor's stock, batch by batch.
 *
 * Sorted soonest-expiry-first by default, because the question this screen
 * exists to answer is "what needs my attention today?" and that is almost
 * always what dies next or what has run out — not what was added last.
 *
 * The tiles above the table are counted in the database rather than derived
 * from the visible page, so "3 running low" means three in the whole business,
 * not three on this screen.
 */
export default function InventoryPage(): React.JSX.Element {
  const router = useRouter()
  const [filters, setFilters] = React.useState<InventoryFilters>(DEFAULT_INVENTORY_FILTERS)
  const [searchInput, setSearchInput] = React.useState('')

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput, page: 1 },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const update = (patch: Partial<InventoryFilters>): void => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))
  }

  const clearFilters = (): void => {
    setSearchInput('')
    setFilters(DEFAULT_INVENTORY_FILTERS)
  }

  const summary = useQuery({
    queryKey: inventoryKeys.summary,
    queryFn: () => inventoryApi.summary(),
  })

  const warehouses = useQuery({
    queryKey: inventoryKeys.warehouses,
    queryFn: () => inventoryApi.warehouses(),
    staleTime: 5 * 60_000,
  })

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: inventoryKeys.list(filters),
    queryFn: () => inventoryApi.list(filters),
    placeholderData: keepPreviousData,
  })

  const filterCount = activeInventoryFilterCount(filters)

  const warehouseOptions = [
    { value: '', label: c.filters.anyWarehouse },
    ...(warehouses.data ?? []).map((warehouse) => ({
      value: warehouse.id,
      label: warehouse.name,
    })),
  ]

  const columns: ReadonlyArray<Column<InventoryItem>> = [
    {
      key: 'medicine',
      header: c.columns.medicine,
      mobile: 'primary',
      render: (item) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-content-primary">{item.medicineName}</span>
          <span className="text-sm text-content-muted">{item.brand}</span>
        </div>
      ),
    },
    {
      key: 'batch',
      header: c.columns.batch,
      mobile: 'secondary',
      render: (item) => <span className="tabular-nums">{item.batchNumber}</span>,
    },
    {
      key: 'expiry',
      header: c.columns.expiry,
      render: (item) => (
        <div className="flex flex-col gap-1">
          <span className="tabular-nums">{item.expiryDate}</span>
          <ExpiryBadge status={item.expiryStatus} days={item.daysUntilExpiry} />
        </div>
      ),
    },
    {
      key: 'stock',
      header: c.columns.stock,
      align: 'right',
      render: (item) => (
        <div className="flex flex-col items-end gap-1">
          <span className="tabular-nums">{item.availableQuantity}</span>
          {item.reservedQuantity > 0 && (
            <span className="text-xs text-content-muted">
              {c.availableOf(item.availableQuantity, item.quantity)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'mrp',
      header: c.columns.mrp,
      align: 'right',
      mobile: 'hidden',
      render: (item) => <span className="tabular-nums">{formatPaise(item.mrpPaise)}</span>,
    },
    {
      key: 'price',
      header: c.columns.yourPrice,
      align: 'right',
      render: (item) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="tabular-nums font-medium">{formatPaise(item.sellingPricePaise)}</span>
          {item.discountPercent > 0 && (
            <span className="text-xs text-success-700">
              {copy.inventory.form.marginNote(item.discountPercent)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: c.columns.status,
      render: (item) => (
        <div className="flex flex-col items-start gap-1">
          <StockBadge level={item.stockLevel} />
          {!item.isSellable && (
            <span className="text-xs text-content-muted">{c.notSellable}</span>
          )}
        </div>
      ),
    },
  ]

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0

  return (
    <PageShell
      page={c.page}
      help={c.help}
      primaryAction={{ label: c.addCta, href: '/inventory/new' }}
      secondaryAction={{ label: c.expiringCta, href: '/inventory/expiring' }}
      toolbar={
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <TextField
              field={c.filters.search}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <SelectField
              field={c.filters.warehouse}
              options={warehouseOptions}
              value={filters.warehouseId}
              onChange={(event) => update({ warehouseId: event.target.value })}
            />
            <SelectField
              field={c.filters.stock}
              options={[
                { value: 'all', label: c.filters.stockOptions.all },
                { value: 'low', label: c.filters.stockOptions.low },
                { value: 'out', label: c.filters.stockOptions.out },
              ]}
              value={filters.stock}
              onChange={(event) =>
                update({ stock: event.target.value as InventoryFilters['stock'] })
              }
            />
            <SelectField
              field={c.filters.expiry}
              options={[
                { value: 'all', label: c.filters.expiryOptions.all },
                { value: 'expiring', label: c.filters.expiryOptions.expiring },
                { value: 'expired', label: c.filters.expiryOptions.expired },
              ]}
              value={filters.expiry}
              onChange={(event) =>
                update({ expiry: event.target.value as InventoryFilters['expiry'] })
              }
            />
            <SelectField
              field={c.filters.sortBy}
              options={[
                { value: 'expiry', label: c.filters.sortOptions.expiry },
                { value: 'name', label: c.filters.sortOptions.name },
                { value: 'stock', label: c.filters.sortOptions.stock },
                { value: 'updated', label: c.filters.sortOptions.updated },
              ]}
              value={filters.sortBy}
              onChange={(event) =>
                update({ sortBy: event.target.value as InventoryFilters['sortBy'], page: filters.page })
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
      {/* The four numbers worth knowing before looking at any row. Each one
          is also a filter, because seeing "3 running low" and not being able
          to click it is worse than not showing it. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={c.summary.totalBatches}
          value={summary.data ? String(summary.data.totalBatches) : '—'}
          icon={<Package />}
        />
        <StatTile
          label={c.summary.lowStock}
          value={summary.data ? String(summary.data.lowStock) : '—'}
          icon={<AlertTriangle />}
          tone={summary.data && summary.data.lowStock > 0 ? 'urgent' : 'default'}
        />
        <StatTile
          label={c.summary.expiringSoon}
          value={summary.data ? String(summary.data.expiringSoon) : '—'}
          icon={<Clock />}
          tone={summary.data && summary.data.expiringSoon > 0 ? 'urgent' : 'default'}
        />
        <StatTile
          label={c.summary.stockValue}
          value={summary.data ? formatPaiseCompact(summary.data.stockValuePaise) : '—'}
          hint={c.summary.stockValueHint}
          icon={<PackageX />}
        />
      </div>

      <DataView
        data={data?.items}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={c.empty}
        emptyIcon={<Package />}
        isFiltered={filterCount > 0}
        onClearFilters={clearFilters}
        onEmptyAction={() => router.push('/inventory/new')}
        onRetry={() => void refetch()}
      >
        {(items) => (
          <div className="flex flex-col gap-4">
            <div aria-busy={isFetching} className="flex flex-col gap-3">
              <ResponsiveTable
                columns={columns}
                rows={items}
                rowKey={(item) => item.id}
                onRowClick={(item) => router.push(`/inventory/${item.id}`)}
                caption={c.page.title}
                mobileFooter={(item) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <StockBadge level={item.stockLevel} />
                    <ExpiryBadge status={item.expiryStatus} days={item.daysUntilExpiry} />
                    <span className="text-sm text-content-secondary">{item.warehouseName}</span>
                  </div>
                )}
              />
            </div>

            {data && (
              <Card>
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-content-primary">
                    {c.showing(from, to, data.total)}
                  </span>

                  <nav aria-label="Pages" className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      icon={<ChevronLeft />}
                      disabled={data.page <= 1}
                      onClick={() => update({ page: data.page - 1 })}
                    >
                      {c.previous}
                    </Button>
                    <span aria-live="polite" className="px-1 text-sm text-content-secondary">
                      {c.pageOf(data.page, data.totalPages)}
                    </span>
                    <Button
                      variant="secondary"
                      disabled={data.page >= data.totalPages}
                      onClick={() => update({ page: data.page + 1 })}
                    >
                      {c.next}
                      <ChevronRight aria-hidden />
                    </Button>
                  </nav>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </DataView>

      <StickyActionBar>
        <Button size="lg" fullWidth onClick={() => router.push('/inventory/new')}>
          {c.addCta}
        </Button>
      </StickyActionBar>
    </PageShell>
  )
}
