'use client'

import { copy } from '@medibridge/copy'
import { AppShell, Button, type NavItem, Skeleton } from '@medibridge/ui'
import {
  BarChart3,
  Home,
  LogOut,
  Package,
  Pill,
  Settings,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { useSession, useSignOut } from '@/lib/use-session'

/**
 * Layout for every signed-in admin page.
 *
 * Lives in a `(dashboard)` route group so /admin/login sits OUTSIDE it —
 * otherwise the guard here would redirect the login page to itself.
 *
 * This is a convenience guard, not the security boundary. The real enforcement
 * is @Roles(ADMIN) on the API: even if someone renders this shell, every
 * request it makes is rejected server-side without an admin session.
 */
/**
 * The admin menu.
 *
 * Every item leads to a real page. Sections whose editing workflows are not
 * built yet still have a browse screen, and each says plainly what is missing
 * rather than pretending to be finished — better than a dead link, and better
 * than a menu item that cannot be clicked.
 */
const adminNav: readonly NavItem[] = [
  { href: '/admin', label: copy.common.nav.home, icon: <Home /> },
  { href: '/admin/approvals', label: 'Approvals', icon: <ShieldCheck /> },
  { href: '/admin/imports', label: 'Bulk Imports', icon: <Upload /> },
  { href: '/admin/medicines', label: copy.common.nav.medicines, icon: <Pill /> },
  { href: '/admin/users', label: copy.common.nav.users, icon: <Users /> },
  { href: '/admin/orders', label: copy.common.nav.orders, icon: <Package /> },
  { href: '/admin/reports', label: copy.common.nav.reports, icon: <BarChart3 />, mobile: false },
  { href: '/admin/settings', label: copy.common.nav.settings, icon: <Settings />, mobile: false },
]

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const { user, isLoading, isSignedIn } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { signOut, isPending: signingOut } = useSignOut()

  React.useEffect(() => {
    if (!isLoading && !isSignedIn) router.replace('/admin/login')
  }, [isLoading, isSignedIn, router])

  // A skeleton rather than a spinner, so the shell does not jump when the
  // session resolves.
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
      nav={adminNav}
      currentPath={pathname}
      onNavigate={(href) => router.push(href)}
      sidebarHeader={
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[--radius-md] bg-brand-600 text-white">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-content-primary">
              {copy.common.app.name}
            </span>
            <span className="text-xs text-content-muted">Admin</span>
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
            {copy.admin.dashboard.signOut}
          </Button>
        </div>
      }
    >
      <div id="main-content">{children}</div>
    </AppShell>
  )
}
