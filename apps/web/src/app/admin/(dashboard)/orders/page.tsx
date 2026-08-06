'use client'

import { copy } from '@medibridge/copy'
import { type Paginated, formatPaise } from '@medibridge/types'
import {
  Alert,
  type Column,
  DataView,
  PageShell,
  ResponsiveTable,
  StatusBadge,
  orderStatusPresentation,
} from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface OrderRow {
  id: string
  orderNumber: string
  retailerName: string
  distributorName: string
  status: string
  deliveryMode: string
  totalPaise: number
  balancePaise: number
  createdAt: string
}

/**
 * Every order on the platform.
 *
 * Empty until ordering ships in Phase 4 — and the empty state says exactly
 * that, rather than looking like something failed to load.
 */
export default function AdminOrdersPage(): React.JSX.Element {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: () => api.get<Paginated<OrderRow>>('/admin/orders?pageSize=50'),
  })

  const columns: ReadonlyArray<Column<OrderRow>> = [
    { key: 'number', header: 'Order', mobile: 'primary', render: (o) => o.orderNumber },
    { key: 'retailer', header: 'Retailer', mobile: 'secondary', render: (o) => o.retailerName },
    { key: 'distributor', header: 'Distributor', render: (o) => o.distributorName },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => <span className="tabular-nums">{formatPaise(o.totalPaise)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (o) =>
        o.balancePaise > 0 ? (
          <span className="tabular-nums">{formatPaise(o.balancePaise)}</span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <StatusBadge
          label={copy.orders.status[o.status as keyof typeof copy.orders.status] ?? o.status}
          tone={orderStatusPresentation[o.status]?.tone}
          icon={orderStatusPresentation[o.status]?.icon}
        />
      ),
    },
    {
      key: 'delivery',
      header: 'Delivery',
      mobile: 'hidden',
      render: (o) =>
        copy.orders.deliveryMode[o.deliveryMode as keyof typeof copy.orders.deliveryMode] ??
        o.deliveryMode,
    },
  ]

  return (
    <PageShell
      page={{
        title: 'Orders',
        subtitle: 'Every order placed on the platform.',
      }}
      help={{
        whatIsThis:
          'A read-only view of all orders, across every retailer and distributor. Use it to look up an order someone has called about.',
        topics: [
          {
            question: 'Why is this empty?',
            answer:
              'Retailers cannot place orders yet — the cart and checkout arrive in Phase 4. Orders will appear here automatically once they can.',
          },
          {
            question: 'What is "Balance"?',
            answer:
              'The 80% still to be collected in cash on delivery. It becomes zero once the order is delivered and paid.',
          },
        ],
      }}
    >
      <Alert tone="info" title="Ordering is not live yet.">
        Cart, checkout and order tracking arrive in Phase 4. This page is already wired to the
        database, so orders will show up here the moment the first one is placed.
      </Alert>

      <DataView
        data={data?.items}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={{
          title: 'No orders yet',
          body: 'Nobody has placed an order yet. Once retailers can check out, every order will appear here with its status and payment details.',
        }}
        emptyIcon={<Package />}
        onRetry={() => void refetch()}
      >
        {(items) => (
          <ResponsiveTable
            columns={columns}
            rows={items}
            rowKey={(o) => o.id}
            caption="All orders"
          />
        )}
      </DataView>
    </PageShell>
  )
}
