'use client'

import { copy } from '@medibridge/copy'
import { formatPaise } from '@medibridge/types'
import {
  Alert,
  AppShell,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  type Column,
  ConfirmDialog,
  DataView,
  EmptyState,
  FieldSection,
  type NavItem,
  OnboardingTour,
  PageShell,
  ResponsiveTable,
  SelectField,
  StatTile,
  StatusBadge,
  StickyActionBar,
  TextAreaField,
  TextField,
  notify,
  orderStatusPresentation,
  useOnboardingTour,
} from '@medibridge/ui'
import { Home, IndianRupee, PackageSearch, Search, ShoppingCart, Truck, Wallet } from 'lucide-react'
import * as React from 'react'

/**
 * Design system reference.
 *
 * This page is not a product screen — it exists so the foundation can be
 * reviewed in a browser before feature work starts, and so there is a working
 * example of every primitive to build against. It will be replaced by the real
 * retailer dashboard in Phase 3.
 */

const nav: readonly NavItem[] = [
  { href: '/', label: copy.common.nav.home, icon: <Home /> },
  { href: '/search', label: copy.common.nav.search, icon: <Search /> },
  { href: '/cart', label: copy.common.nav.cart, icon: <ShoppingCart />, badge: 3 },
  { href: '/orders', label: copy.common.nav.orders, icon: <PackageSearch />, badge: 1 },
  { href: '/payments', label: copy.common.nav.payments, icon: <Wallet /> },
]

interface DemoOrder {
  id: string
  orderNumber: string
  distributor: string
  items: number
  totalPaise: number
  balancePaise: number
  status: keyof typeof copy.orders.status
  mode: 'SAME_DAY' | 'NEXT_DAY'
}

const demoOrders: DemoOrder[] = [
  {
    id: '1',
    orderNumber: 'MB-2026-000418',
    distributor: 'MedPlus Wholesale Pvt Ltd',
    items: 7,
    totalPaise: 1_248_500,
    balancePaise: 998_800,
    status: 'DISPATCHED',
    mode: 'SAME_DAY',
  },
  {
    id: '2',
    orderNumber: 'MB-2026-000417',
    distributor: 'Wellness Distributors LLP',
    items: 3,
    totalPaise: 342_000,
    balancePaise: 273_600,
    status: 'ACCEPTED',
    mode: 'NEXT_DAY',
  },
  {
    id: '3',
    orderNumber: 'MB-2026-000411',
    distributor: 'MedPlus Wholesale Pvt Ltd',
    items: 12,
    totalPaise: 2_874_000,
    balancePaise: 0,
    status: 'DELIVERED',
    mode: 'SAME_DAY',
  },
]

const orderColumns: ReadonlyArray<Column<DemoOrder>> = [
  {
    key: 'orderNumber',
    header: copy.orders.list.columns.orderNumber,
    mobile: 'primary',
    render: (order) => order.orderNumber,
  },
  {
    key: 'distributor',
    header: copy.orders.list.columns.distributor,
    mobile: 'secondary',
    render: (order) => order.distributor,
  },
  {
    key: 'items',
    header: copy.orders.list.columns.items,
    render: (order) => copy.orders.list.itemCount(order.items),
  },
  {
    key: 'total',
    header: copy.orders.list.columns.total,
    align: 'right',
    render: (order) => <span className="tabular-nums">{formatPaise(order.totalPaise)}</span>,
  },
  {
    key: 'balance',
    header: copy.orders.list.columns.balance,
    align: 'right',
    render: (order) =>
      order.balancePaise > 0 ? (
        <span className="font-medium tabular-nums">{formatPaise(order.balancePaise)}</span>
      ) : (
        <span className="text-content-muted">—</span>
      ),
  },
  {
    key: 'status',
    header: copy.orders.list.columns.status,
    render: (order) => (
      <StatusBadge
        label={copy.orders.status[order.status]}
        tone={orderStatusPresentation[order.status]?.tone}
        icon={orderStatusPresentation[order.status]?.icon}
      />
    ),
  },
  {
    key: 'delivery',
    header: copy.orders.list.columns.delivery,
    mobile: 'hidden',
    render: (order) => copy.orders.deliveryMode[order.mode],
  },
]

export default function DesignSystemPage(): React.JSX.Element {
  const [showEmpty, setShowEmpty] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const tour = useOnboardingTour(copy.auth.retailerTour)

  const fields = copy.auth.signUp.fields

  /** Demonstrates the double-submit guard: the button locks while pending. */
  function handleSlowAction(): void {
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      notify.success(copy.catalog.orderPlaced.success, 'Order MB-2026-000419 has been created.')
    }, 1500)
  }

  return (
    <AppShell
      nav={nav}
      currentPath="/design-system"
      onNavigate={(href) =>
        notify.info(
          'This screen is not built yet.',
          `${href} arrives in a later phase. Try /admin/login or /login instead.`,
        )
      }
    >
      <div id="main-content">
        <PageShell
          page={{
            title: 'Design System',
            subtitle:
              'Every building block the product uses. Replaced by the retailer dashboard in Phase 3.',
          }}
          help={copy.dashboard.retailer.help}
          primaryAction={{ label: 'Show Me Around', onClick: tour.start }}
          onReplayTour={tour.start}
          banner={
            <Alert
              tone="warning"
              title="Your drug license expires in 21 days."
              action={{ label: 'Upload Renewed License' }}
            >
              Upload a renewed license so you can keep placing orders without interruption.
            </Alert>
          }
        >
          {/* ---------- Stat tiles ---------- */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Dashboard tiles</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label={copy.dashboard.retailer.cards.activeOrders}
                value="4"
                icon={<PackageSearch />}
              />
              <StatTile
                label={copy.dashboard.retailer.cards.arrivingToday}
                value="2"
                hint="Both from MedPlus Wholesale"
                icon={<Truck />}
              />
              <StatTile
                label={copy.dashboard.retailer.cards.balanceDue}
                value={formatPaise(1_272_400)}
                hint="Keep this ready in cash"
                icon={<IndianRupee />}
                tone="urgent"
              />
              <StatTile
                label={copy.dashboard.retailer.cards.spentThisMonth}
                value={formatPaise(8_431_500)}
                icon={<Wallet />}
              />
            </div>
          </section>

          {/* ---------- Table / cards ---------- */}
          <section className="flex flex-col gap-3" data-tour="orders">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Orders — table on desktop, cards on mobile</h2>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowEmpty((value) => !value)}>
                  {showEmpty ? 'Show data' : 'Show empty state'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoading(true)
                    window.setTimeout(() => setLoading(false), 1200)
                  }}
                >
                  Show loading
                </Button>
              </div>
            </div>

            <DataView
              data={showEmpty ? [] : demoOrders}
              isLoading={loading}
              emptyState={copy.orders.list.retailerEmpty}
              emptyIcon={<PackageSearch />}
              onEmptyAction={() => notify.info('Search is not built yet.')}
            >
              {(orders) => (
                <ResponsiveTable
                  columns={orderColumns}
                  rows={orders}
                  rowKey={(order) => order.id}
                  caption="Your recent orders"
                  onRowClick={(order) => notify.info(`Opening ${order.orderNumber}`)}
                  mobileFooter={(order) => (
                    <Button variant="secondary" fullWidth>
                      {order.status === 'DELIVERED'
                        ? copy.orders.detail.actions.reorder
                        : copy.orders.detail.actions.trackDelivery}
                    </Button>
                  )}
                />
              )}
            </DataView>
          </section>

          {/* ---------- Forms ---------- */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              Form fields — helper text is required, not optional
            </h2>
            <Card>
              <CardHeader
                title={copy.auth.signUp.steps.business}
                description="Every field carries guidance. The GST field also has a ⓘ tooltip."
              />
              <CardBody>
                <FieldSection title="Business details">
                  <TextField field={fields.businessName} required />
                  <TextField field={fields.gstNumber} required />
                  <TextField
                    field={fields.gstNumber}
                    required
                    error={copy.validation.gst.invalid}
                    defaultValue="27AAPF"
                  />
                  <SelectField
                    field={fields.role}
                    required
                    placeholder="Choose one"
                    options={[
                      { value: 'RETAILER', label: 'Retailer — I buy medicines' },
                      { value: 'DISTRIBUTOR', label: 'Distributor — I sell medicines' },
                    ]}
                  />
                  <TextAreaField field={copy.catalog.checkout.fields.notes} />
                  <CheckboxField field={fields.acceptTerms} required />
                </FieldSection>
              </CardBody>
            </Card>
          </section>

          {/* ---------- Status badges ---------- */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              Status — always an icon and a word, never colour alone
            </h2>
            <Card>
              <CardBody className="flex flex-wrap gap-2">
                {(
                  Object.keys(orderStatusPresentation) as Array<keyof typeof copy.orders.status>
                ).map((status) => (
                  <StatusBadge
                    key={status}
                    label={copy.orders.status[status]}
                    tone={orderStatusPresentation[status]?.tone}
                    icon={orderStatusPresentation[status]?.icon}
                  />
                ))}
              </CardBody>
            </Card>
          </section>

          {/* ---------- Feedback ---------- */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Feedback and confirmation</h2>
            <Card>
              <CardBody className="flex flex-wrap gap-2">
                <Button loading={submitting} onClick={handleSlowAction}>
                  Place Order (double-tap me)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => notify.success(copy.inventory.form.success.updated)}
                >
                  Success toast
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => notify.error(copy.validation.quantity.exceedsStock)}
                >
                  Friendly error toast
                </Button>
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                  {copy.orders.detail.actions.cancel}
                </Button>
              </CardBody>
            </Card>
          </section>

          {/* ---------- Empty state ---------- */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Empty states always point somewhere</h2>
            <EmptyState
              copy={copy.catalog.cart.empty}
              icon={<ShoppingCart />}
              onAction={() => notify.info('Search is not built yet.')}
            />
          </section>
        </PageShell>

        {/* Primary action lives here on mobile, within thumb reach. */}
        <StickyActionBar>
          <Button size="lg" fullWidth loading={submitting} onClick={handleSlowAction}>
            {copy.catalog.cart.checkoutCta}
          </Button>
        </StickyActionBar>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={copy.orders.detail.cancelDialog.title}
          body={copy.orders.detail.cancelDialog.body}
          confirmLabel={copy.orders.detail.cancelDialog.confirm}
          cancelLabel={copy.orders.detail.cancelDialog.keep}
          tone="danger"
          onConfirm={() => {
            setConfirmOpen(false)
            notify.success(copy.orders.detail.success.cancelled)
          }}
        />

        <OnboardingTour tour={copy.auth.retailerTour} open={tour.open} onClose={tour.close} />
      </div>
    </AppShell>
  )
}
