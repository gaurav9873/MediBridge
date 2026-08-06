'use client'

import { copy } from '@medibridge/copy'
import { Alert, Card, CardBody, CardHeader, PageShell, Skeleton, StatTile } from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { Clock, Package, Pill, ShieldCheck, Store, Truck } from 'lucide-react'
import * as React from 'react'
import { api } from '@/lib/api-client'

interface AdminOverview {
  pendingApprovals: number
  activeRetailers: number
  activeDistributors: number
  medicines: number
  inventoryBatches: number
  expiringSoon: number
  ordersToday: number
  openProblems: number
}

/**
 * Reports.
 *
 * Shows the figures that genuinely exist today — accounts, catalogue and stock.
 * Sales reporting needs orders, which arrive in Phase 4, so it is named as
 * missing rather than shown as a chart of zeroes.
 */
export default function AdminReportsPage(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get<AdminOverview>('/admin/overview'),
  })

  return (
    <PageShell
      page={{
        title: copy.admin.reports.page.title,
        subtitle: 'How the platform is doing right now.',
      }}
      help={{
        whatIsThis:
          'Live counts from the database. Sales figures and trends appear here once orders start being placed.',
        topics: [
          {
            question: 'Where are the sales numbers?',
            answer:
              'They need orders, and ordering is not live yet. Once Phase 4 ships, sales, average order value and distributor performance appear on this page.',
          },
          {
            question: 'Can I export these?',
            answer:
              'Not yet. Exports run on the same engine as bulk imports, so they arrive alongside the reporting work.',
          },
        ],
      }}
    >
      <Alert tone="info" title="Sales reporting needs orders.">
        These are live platform counts. Revenue, top medicines and distributor performance arrive
        with ordering in Phase 4.
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-content-primary">Accounts</h2>
        {isLoading ? (
          <SkeletonRow />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label={copy.admin.reports.metrics.activeRetailers}
              value={String(data?.activeRetailers ?? 0)}
              icon={<Store />}
              href="/admin/users"
            />
            <StatTile
              label={copy.admin.reports.metrics.activeDistributors}
              value={String(data?.activeDistributors ?? 0)}
              icon={<Truck />}
              href="/admin/users"
            />
            <StatTile
              label={copy.admin.reports.metrics.pendingApprovals}
              value={String(data?.pendingApprovals ?? 0)}
              icon={<ShieldCheck />}
              tone={(data?.pendingApprovals ?? 0) > 0 ? 'urgent' : 'default'}
              href="/admin/approvals"
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-content-primary">Catalogue and stock</h2>
        {isLoading ? (
          <SkeletonRow />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Medicines Listed"
              value={String(data?.medicines ?? 0)}
              icon={<Pill />}
              href="/admin/medicines"
            />
            <StatTile
              label="Stock Batches"
              value={String(data?.inventoryBatches ?? 0)}
              icon={<Package />}
            />
            <StatTile
              label="Batches Expiring Soon"
              value={String(data?.expiringSoon ?? 0)}
              hint="Within the next 90 days"
              icon={<Clock />}
              tone={(data?.expiringSoon ?? 0) > 0 ? 'urgent' : 'default'}
            />
          </div>
        )}
      </section>

      <Card>
        <CardHeader
          title="Coming with Phase 4"
          description="These need order data before they can show anything meaningful."
        />
        <CardBody>
          <ul className="flex flex-col gap-1.5 text-base text-content-secondary">
            <li>Total sales, order count and average order value</li>
            <li>Most ordered medicines</li>
            <li>Best performing distributors</li>
            <li>Same-Day vs Next-Day split, and cancellation rate</li>
            <li>Amounts owed to distributors at the next settlement</li>
          </ul>
        </CardBody>
      </Card>
    </PageShell>
  )
}

function SkeletonRow(): React.JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  )
}
