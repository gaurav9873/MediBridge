'use client'

import { copy } from '@medibridge/copy'
import { UserRole } from '@medibridge/types'
import { AppShell, Button, type NavItem, Skeleton } from '@medibridge/ui'
import {
  Building2,
  FlaskConical,
  Home,
  LogOut,
  Package,
  Truck,
  UserCog,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { useSession, useSignOut } from '@/lib/use-session'

/**
 * Layout for a distributor's working screens.
 *
 * The same AppShell the admin panel uses — sidebar on desktop, thumb-reachable
 * bottom bar on mobile — rather than a second navigation pattern. A
 * distributor behind a counter is the most likely person in this product to be
 * on a phone, so the mobile half is the important half.
 *
 * A convenience guard, not the security boundary: every request this shell
 * makes is scoped by Row-Level Security and checked against a permission
 * server-side, whether or not this component renders.
 */
const distributorNav: readonly NavItem[] = [
  { href: '/inventory', label: copy.common.nav.inventory, icon: <Package /> },
  { href: '/inventory/expiring', label: copy.inventory.expiryAlerts.page.title, icon: <Truck /> },
  {
    href: '/account/medicine-requests',
    label: copy.admin.medicines.requests.mine.page.title,
    icon: <FlaskConical />,
  },
  { href: '/account/company', label: copy.common.nav.settings, icon: <Building2 /> },
  { href: '/account', label: copy.common.nav.account, icon: <UserCog /> },
]

export default function DistributorLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const { user, isLoading, isSignedIn } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { signOut, isPending: signingOut } = useSignOut()

  React.useEffect(() => {
    if (isLoading) return
    if (!isSignedIn) {
      router.replace('/login')
      return
    }
    // A retailer following a link here has no stock of their own to manage.
    // Their own screens arrive in Phase 3.5.
    if (user && user.role !== UserRole.DISTRIBUTOR) router.replace('/account')
  }, [isLoading, isSignedIn, user, router])

  if (isLoading || !user) {
    return (
      <div className="flex min-h-dvh flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <AppShell
      nav={distributorNav}
      currentPath={pathname}
      onNavigate={(href) => router.push(href)}
      sidebarHeader={
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-brand-600 text-white">
            <Home className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-content-primary">
              {user.businessName ?? copy.common.app.name}
            </span>
            <span className="text-xs text-content-muted">Distributor</span>
          </div>
        </div>
      }
      sidebarFooter={
        <div className="flex flex-col gap-2">
          <div className="flex flex-col px-3">
            <span className="truncate text-sm font-medium text-content-primary">
              {user.fullName}
            </span>
            <span className="truncate text-xs text-content-muted">{user.email}</span>
          </div>
          <Button
            variant="ghost"
            fullWidth
            icon={<LogOut />}
            loading={signingOut}
            onClick={signOut}
            className="justify-start"
          >
            {copy.common.nav.signOut}
          </Button>
        </div>
      }
    >
      <div id="main-content">{children}</div>
    </AppShell>
  )
}
