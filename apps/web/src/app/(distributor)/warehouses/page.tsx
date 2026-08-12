'use client'

import { copy } from '@medibridge/copy'
import { formatPaise, stockTransferSchema } from '@medibridge/types'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  type Column,
  ConfirmDialog,
  DataView,
  PageShell,
  ResponsiveTable,
  SelectField,
  StatusBadge,
  StickyActionBar,
  TextAreaField,
  TextField,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Search, Warehouse as WarehouseIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ApiClientError } from '@/lib/api-client'
import {
  DEFAULT_INVENTORY_FILTERS,
  type InventoryItem,
  type WarehouseStock,
  inventoryApi,
  inventoryKeys,
} from '@/lib/inventory'

const c = copy.inventory.warehouses
const t = c.transfer

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Stock a warehouse at a time, and the moves between them.
 *
 * A distributor with two hubs thinks in locations before batches — "what is in
 * Pune?" comes before "how much Dolo?" — so this rolls the batch list up by
 * warehouse and hangs the transfer flow off it.
 */
export default function WarehouseStockPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [moving, setMoving] = React.useState(false)
  const [batchSearch, setBatchSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [batch, setBatch] = React.useState<InventoryItem | null>(null)
  const [toWarehouseId, setToWarehouseId] = React.useState('')
  const [quantity, setQuantity] = React.useState('')
  const [note, setNote] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(batchSearch), 300)
    return () => clearTimeout(timer)
  }, [batchSearch])

  const stock = useQuery({
    queryKey: [...inventoryKeys.all, 'by-warehouse'],
    queryFn: () => inventoryApi.stockByWarehouse(),
  })

  const history = useQuery({
    queryKey: [...inventoryKeys.all, 'transfers'],
    queryFn: () => inventoryApi.transfers(),
  })

  const candidates = useQuery({
    queryKey: inventoryKeys.list({ ...DEFAULT_INVENTORY_FILTERS, search: debounced, pageSize: 8 }),
    queryFn: () =>
      inventoryApi.list({ ...DEFAULT_INVENTORY_FILTERS, search: debounced, pageSize: 8 }),
    enabled: moving && debounced.trim().length >= 2,
  })

  const closeMove = (): void => {
    setMoving(false)
    setBatch(null)
    setBatchSearch('')
    setDebounced('')
    setToWarehouseId('')
    setQuantity('')
    setNote('')
    setErrors({})
  }

  const transfer = useMutation({
    mutationFn: (input: { inventoryItemId: string; toWarehouseId: string; quantity: number; note?: string }) =>
      inventoryApi.transfer(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
      notify.success(t.success(result.quantity, result.toWarehouseName))
      closeMove()
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.fields?.length) {
        setErrors(Object.fromEntries(error.fields.map((f) => [f.field, f.message])))
      } else {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  const submitMove = (): void => {
    const parsed = stockTransferSchema.safeParse({
      inventoryItemId: batch?.id,
      toWarehouseId,
      quantity: Number(quantity),
      note: note.trim() || undefined,
    })
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      )
      return
    }
    setErrors({})
    transfer.mutate(parsed.data)
  }

  const columns: ReadonlyArray<Column<WarehouseStock>> = [
    {
      key: 'warehouse',
      header: c.columns.warehouse,
      mobile: 'primary',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-content-primary">{row.warehouseName}</span>
          {!row.isAcceptingOrders && (
            <StatusBadge label={c.notAccepting} tone="warning" />
          )}
        </div>
      ),
    },
    {
      key: 'batches',
      header: c.columns.batches,
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.batches}</span>,
    },
    {
      key: 'units',
      header: c.columns.units,
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.units.toLocaleString('en-IN')}</span>,
    },
    {
      key: 'lowStock',
      header: c.columns.lowStock,
      align: 'right',
      render: (row) =>
        row.lowStock > 0 ? (
          <span className="tabular-nums font-medium text-warning-900">{row.lowStock}</span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    {
      key: 'expiringSoon',
      header: c.columns.expiringSoon,
      align: 'right',
      render: (row) =>
        row.expiringSoon > 0 ? (
          <span className="tabular-nums font-medium text-warning-900">{row.expiringSoon}</span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    {
      key: 'value',
      header: c.columns.value,
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium">{formatPaise(row.stockValuePaise)}</span>
      ),
    },
  ]

  const freeToMove = batch?.availableQuantity ?? 0
  const destinations = (stock.data ?? [])
    .filter((row) => row.warehouseId !== batch?.warehouseId)
    .map((row) => ({ value: row.warehouseId, label: row.warehouseName }))

  return (
    <PageShell
      page={c.page}
      help={c.help}
      primaryAction={{ label: t.cta, onClick: () => setMoving(true) }}
      secondaryAction={{
        label: copy.inventory.list.page.title,
        onClick: () => router.push('/inventory'),
      }}
    >
      <DataView
        data={stock.data}
        isLoading={stock.isLoading}
        error={
          stock.error instanceof ApiClientError
            ? stock.error.message
            : (stock.error?.message ?? null)
        }
        emptyState={c.empty}
        emptyIcon={<WarehouseIcon />}
        onEmptyAction={() => router.push('/account/company')}
        onRetry={() => void stock.refetch()}
      >
        {(rows) => (
          <ResponsiveTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.warehouseId}
            caption={c.page.title}
            mobileFooter={(row) => (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => router.push(`/inventory?warehouseId=${row.warehouseId}`)}
              >
                {c.viewStock}
              </Button>
            )}
          />
        )}
      </DataView>

      <Card>
        <CardHeader title={c.history.heading} />
        <CardBody>
          <DataView
            data={history.data}
            isLoading={history.isLoading}
            error={
              history.error instanceof ApiClientError
                ? history.error.message
                : (history.error?.message ?? null)
            }
            emptyState={c.history.empty}
            emptyIcon={<ArrowRightLeft />}
            onRetry={() => void history.refetch()}
          >
            {(moves) => (
              <ul className="flex flex-col gap-3">
                {moves.map((move) => (
                  <li
                    key={move.id}
                    className="flex flex-col gap-1 border-b border-border-default pb-3 last:border-0 last:pb-0"
                  >
                    <span className="font-medium text-content-primary">
                      {move.medicineName} · {move.batchNumber}
                    </span>
                    <span className="text-sm text-content-secondary">
                      {c.history.summary(
                        move.quantity,
                        move.fromWarehouseName,
                        move.toWarehouseName,
                      )}
                    </span>
                    <span className="text-sm text-content-muted">
                      {c.history.movedBy(move.transferredBy)} · {formatDate(move.createdAt)}
                    </span>
                    {move.note && (
                      <span className="text-sm text-content-secondary">{move.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DataView>
        </CardBody>
      </Card>

      <StickyActionBar>
        <Button size="lg" fullWidth icon={<ArrowRightLeft />} onClick={() => setMoving(true)}>
          {t.cta}
        </Button>
      </StickyActionBar>

      <ConfirmDialog
        open={moving}
        onOpenChange={(open) => !open && closeMove()}
        title={t.title}
        body={t.intro}
        confirmLabel={t.submit}
        cancelLabel={t.cancel}
        loading={transfer.isPending}
        onConfirm={submitMove}
      >
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
          {batch ? (
            <Card>
              <CardBody className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold text-content-primary">
                      {batch.medicineName}
                    </span>
                    <span className="text-sm text-content-secondary">
                      {batch.batchNumber} · {t.currentlyAt(batch.warehouseName)}
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => setBatch(null)}>
                    {copy.common.actions.edit}
                  </Button>
                </div>
                <p className="text-sm text-content-secondary">{t.freeToMove(freeToMove)}</p>
              </CardBody>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              <TextField
                field={t.fields.batch}
                type="search"
                value={batchSearch}
                error={errors.inventoryItemId}
                leading={<Search className="size-4" aria-hidden />}
                onChange={(event) => setBatchSearch(event.target.value)}
              />
              {debounced.trim().length >= 2 &&
                candidates.data?.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setBatch(item)
                      setToWarehouseId('')
                    }}
                    className="flex min-h-(--size-touch) flex-col items-start rounded-(--radius-md) border border-border-default bg-surface p-3 text-left hover:bg-surface-hover"
                  >
                    <span className="font-medium text-content-primary">{item.medicineName}</span>
                    <span className="text-sm text-content-secondary">
                      {item.batchNumber} · {t.currentlyAt(item.warehouseName)} ·{' '}
                      {t.freeToMove(item.availableQuantity)}
                    </span>
                  </button>
                ))}
            </div>
          )}

          {batch && (
            <>
              <SelectField
                field={t.fields.toWarehouse}
                options={destinations}
                placeholder={t.fields.toWarehouse.label}
                value={toWarehouseId}
                error={errors.toWarehouseId}
                required
                onChange={(event) => setToWarehouseId(event.target.value)}
              />
              <TextField
                field={t.fields.quantity}
                type="number"
                min="1"
                max={String(freeToMove)}
                inputMode="numeric"
                value={quantity}
                error={errors.quantity}
                required
                onChange={(event) => setQuantity(event.target.value)}
              />
              <TextAreaField
                field={t.fields.note}
                rows={2}
                value={note}
                error={errors.note}
                onChange={(event) => setNote(event.target.value)}
              />
              {freeToMove === 0 && (
                <Alert tone="warning" title={t.freeToMove(0)} />
              )}
            </>
          )}
        </div>
      </ConfirmDialog>
    </PageShell>
  )
}
