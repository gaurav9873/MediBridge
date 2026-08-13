'use client'

import { copy } from '@medibridge/copy'
import { UserRole } from '@medibridge/types'
import { AppShell, Button, type NavItem, Skeleton } from '@medibridge/ui'
import { FlaskConical, LogOut, Package, Search, ShoppingCart, Store, UserCog } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { useSession, useSignOut } from '@/lib/use-session'

/**
 * Layout for a retailer's shopping screens.
 *
 * The same AppShell the admin and distributor sides use. A pharmacist buying
 * stock between customers is the most phone-bound user in the product, so the
 * bottom bar is the important half — Search first, because that is what they
 * open the app to do.
 *
 * Cart and Orders are marked as not built yet rather than hidden: a menu that
 * grows new items reads as unfinished, and a link to a 404 reads as broken.
 * This is the third option, and the flag is removed as each phase lands.
 */
const retailerNav: readonly NavItem[] = [
  { href: '/search', label: copy.common.nav.search, icon: <Search /> },
  { href: '/cart', label: copy.common.nav.cart, icon: <ShoppingCart />, comingSoon: true },
  { href: '/orders', label: copy.common.nav.orders, icon: <Package />, comingSoon: true },
  {
    href: '/account/medicine-requests',
    label: copy.admin.medicines.requests.mine.page.title,
    icon: <FlaskConical />,
    mobile: false,
  },
  { href: '/account', label: copy.common.nav.account, icon: <UserCog /> },
]

export default function RetailerLayout({
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
    // A distributor has their own screens; sending them shopping is not it.
    if (user && user.role !== UserRole.RETAILER) router.replace('/account')
  }, [isLoading, isSignedIn, user, router])

  if (isLoading || !user) {
    return (
      <div className="flex min-h-dvh flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <AppShell
      nav={retailerNav}
      currentPath={pathname}
      onNavigate={(href) => router.push(href)}
      sidebarHeader={
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-brand-600 text-white">
            <Store className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-content-primary">
              {user.businessName ?? copy.common.app.name}
            </span>
            <span className="text-xs text-content-muted">Retailer</span>
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
