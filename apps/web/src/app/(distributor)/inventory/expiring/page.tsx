'use client'

import { copy } from '@medibridge/copy'
import { formatPaise } from '@medibridge/types'
import { Alert, Button, Card, CardBody, DataView, PageShell } from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ExpiryBadge, ItemIdentity, StockBadge } from '@/components/inventory-bits'
import { ApiClientError } from '@/lib/api-client'
import {
  DEFAULT_INVENTORY_FILTERS,
  type InventoryItem,
  inventoryApi,
  inventoryKeys,
} from '@/lib/inventory'

const c = copy.inventory.expiryAlerts
const l = copy.inventory.list

/** Two questions, so two lists: what to shift, and what to write off. */
const expiringFilters = { ...DEFAULT_INVENTORY_FILTERS, expiry: 'expiring' as const, pageSize: 100 }
const expiredFilters = { ...DEFAULT_INVENTORY_FILTERS, expiry: 'expired' as const, pageSize: 100 }

function BatchCard({
  item,
  onOpen,
}: {
  item: InventoryItem
  onOpen: () => void
}): React.JSX.Element {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ItemIdentity item={item} />
          <ExpiryBadge status={item.expiryStatus} days={item.daysUntilExpiry} showFresh />
        </div>

        <dl className="flex flex-col gap-1.5 border-t border-border-default pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-content-secondary">{l.columns.batch}</dt>
            <dd className="text-sm font-medium text-content-primary">{item.batchNumber}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-content-secondary">{l.columns.expiry}</dt>
            <dd className="text-sm font-medium text-content-primary">{item.expiryDate}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-sm text-content-secondary">{l.columns.stock}</dt>
            <dd className="text-sm font-medium text-content-primary">
              {item.availableQuantity} · {formatPaise(item.sellingPricePaise)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
          <StockBadge level={item.stockLevel} />
          <Button variant="secondary" onClick={onOpen}>
            {l.editCta}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

/**
 * Batches running out of shelf life.
 *
 * Cards rather than a table on every width, on purpose: this is a short
 * worklist somebody acts on item by item, not a dataset they scan. The
 * already-expired list is separate because it needs a different action —
 * nothing here can be sold, only removed.
 */
export default function ExpiringStockPage(): React.JSX.Element {
  const router = useRouter()

  const expiring = useQuery({
    queryKey: inventoryKeys.list(expiringFilters),
    queryFn: () => inventoryApi.list(expiringFilters),
  })

  const expired = useQuery({
    queryKey: inventoryKeys.list(expiredFilters),
    queryFn: () => inventoryApi.list(expiredFilters),
  })

  return (
    <PageShell
      page={c.page}
      help={c.help}
      secondaryAction={{ label: c.backToStock, onClick: () => router.push('/inventory') }}
    >
      {(expired.data?.items.length ?? 0) > 0 && (
        <Alert tone="danger" title={c.expiredHeading}>
          {c.expiredBody}
        </Alert>
      )}

      {(expired.data?.items.length ?? 0) > 0 && (
        <div className="flex flex-col gap-3">
          {expired.data?.items.map((item) => (
            <BatchCard
              key={item.id}
              item={item}
              onOpen={() => router.push(`/inventory/${item.id}`)}
            />
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold text-content-primary">{c.expiringHeading}</h2>

      <DataView
        data={expiring.data?.items}
        isLoading={expiring.isLoading}
        error={
          expiring.error instanceof ApiClientError
            ? expiring.error.message
            : (expiring.error?.message ?? null)
        }
        emptyState={c.empty}
        emptyIcon={<Clock />}
        onRetry={() => void expiring.refetch()}
      >
        {(items) => (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <BatchCard
                key={item.id}
                item={item}
                onOpen={() => router.push(`/inventory/${item.id}`)}
              />
            ))}
          </div>
        )}
      </DataView>
    </PageShell>
  )
}
