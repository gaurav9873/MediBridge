'use client'

import { copy } from '@medibridge/copy'
import { Alert, Card, CardBody, CardHeader, PageShell, StatTile, Skeleton } from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Clock,
  MessageSquareWarning,
  Package,
  Pill,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react'
import * as React from 'react'
import { api } from '@/lib/api-client'
import { useSession } from '@/lib/use-session'

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
 * Admin home.
 *
 * Split into "needs your attention" and "platform numbers" deliberately: an
 * admin opening this should see what is waiting on them before they see how
 * the business is doing. Every figure is a live count from the database.
 */
export default function AdminDashboardPage(): React.JSX.Element {
  const { user } = useSession()
  const c = copy.admin.dashboard

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get<AdminOverview>('/admin/overview'),
  })

  const needsAttention =
    (data?.pendingApprovals ?? 0) + (data?.openProblems ?? 0) + (data?.expiringSoon ?? 0) > 0

  return (
    <PageShell
      page={c.page}
      help={c.help}
      banner={
        error ? (
          <Alert tone="danger" title={copy.common.feedback.somethingWentWrong}>
            {error instanceof Error ? error.message : copy.common.feedback.somethingWentWrongBody}
          </Alert>
        ) : undefined
      }
    >
      {user && (
        <p className="-mt-1 text-base text-content-secondary">{c.greeting(user.fullName)}</p>
      )}

      {/* ---------- Needs attention ---------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-content-primary">{c.needsAttention}</h2>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : !needsAttention ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
              <ShieldCheck className="size-8 text-success-600" aria-hidden />
              <p className="text-base font-semibold text-content-primary">{c.allClear}</p>
              <p className="max-w-md text-sm text-content-secondary">{c.allClearBody}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={c.cards.pendingApprovals}
              value={String(data?.pendingApprovals ?? 0)}
              hint={c.hints.pendingApprovals}
              icon={<ShieldCheck />}
              tone={(data?.pendingApprovals ?? 0) > 0 ? 'urgent' : 'default'}
              href="/admin/approvals"
            />
            <StatTile
              label={c.cards.openProblems}
              value={String(data?.openProblems ?? 0)}
              hint={c.hints.openProblems}
              icon={<MessageSquareWarning />}
              tone={(data?.openProblems ?? 0) > 0 ? 'urgent' : 'default'}
            />
            <StatTile
              label={c.cards.expiringSoon}
              value={String(data?.expiringSoon ?? 0)}
              hint={c.hints.expiringSoon}
              icon={<Clock />}
              tone={(data?.expiringSoon ?? 0) > 0 ? 'urgent' : 'default'}
            />
            <StatTile
              label={c.cards.ordersToday}
              value={String(data?.ordersToday ?? 0)}
              hint={c.hints.ordersToday}
              icon={<Package />}
            />
          </div>
        )}
      </section>

      {/* ---------- Platform numbers ---------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-content-primary">{c.platformNumbers}</h2>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={c.cards.activeRetailers}
              value={String(data?.activeRetailers ?? 0)}
              icon={<Store />}
            />
            <StatTile
              label={c.cards.activeDistributors}
              value={String(data?.activeDistributors ?? 0)}
              icon={<Truck />}
            />
            <StatTile
              label={c.cards.medicines}
              value={String(data?.medicines ?? 0)}
              icon={<Pill />}
            />
            <StatTile
              label={c.cards.inventoryBatches}
              value={String(data?.inventoryBatches ?? 0)}
              icon={<Package />}
            />
          </div>
        )}
      </section>

      {/* Honest about what is not built yet, rather than shipping dead links
          that look real. Removed as each phase lands. */}
      <Card>
        <CardHeader
          title="Coming next"
          description="These sections are planned but not built yet."
        />
        <CardBody className="flex flex-col gap-2 text-base text-content-secondary">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-1 size-4 shrink-0 text-warning-600" aria-hidden />
            Approvals is live. Everything marked <strong>Soon</strong> in the menu — Bulk Imports,
            Medicines, Users, Orders, Reports and Settings — arrives in Phases 3 to 8. The tiles
            above are live data. Bulk import already works through the API; its screens are next.
          </p>
        </CardBody>
      </Card>
    </PageShell>
  )
}
