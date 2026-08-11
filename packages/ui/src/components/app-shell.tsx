'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Navigation chrome.
 *
 * Mobile gets a bottom navigation bar — thumb-reachable, the pattern every
 * phone user already knows. Desktop gets a sidebar. Both are driven by the
 * same NavItem[], so a new section appears in both without extra work.
 */

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  /** Count shown on the badge, e.g. cart items or orders awaiting action. */
  badge?: number
  /** Mobile bottom bars fit five items comfortably; the rest go under "More". */
  mobile?: boolean
  /**
   * The section is planned but not built yet.
   *
   * Rendered visibly but not clickable, so the menu shows the product's full
   * shape without any link leading to a 404. Hiding unbuilt sections entirely
   * reads as "the menu is broken"; letting them navigate reads as "the app is
   * broken". This is the third option.
   */
  comingSoon?: boolean
}

export function BottomNav({
  items,
  currentPath,
  onNavigate,
}: {
  items: readonly NavItem[]
  currentPath: string
  onNavigate?: (href: string) => void
}): React.JSX.Element {
  const mobileItems = items.filter((item) => item.mobile !== false).slice(0, 5)

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface',
        'pb-safe md:hidden',
      )}
    >
      <ul className="flex h-(--height-bottom-nav) items-stretch">
        {mobileItems.map((item) => {
          const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`)
          return (
            <li key={item.href} className="flex-1">
              {item.comingSoon ? (
                <span
                  aria-disabled="true"
                  className={cn(
                    'relative flex h-full flex-col items-center justify-center gap-0.5',
                    'text-xs font-medium text-content-muted opacity-50',
                    '[&_svg]:size-6',
                  )}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              ) : (
                <a
                  href={item.href}
                  onClick={
                    onNavigate
                      ? (event) => {
                          event.preventDefault()
                          onNavigate(item.href)
                        }
                      : undefined
                  }
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full flex-col items-center justify-center gap-0.5',
                    'text-xs font-medium transition-colors',
                    '[&_svg]:size-6',
                    active ? 'text-brand-600' : 'text-content-muted',
                  )}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={cn(
                        'absolute top-1.5 right-[calc(50%-1.25rem)] min-w-5 rounded-full',
                        'dark:text-danger-950 bg-danger-600 px-1 text-center text-xs leading-5 font-semibold text-white',
                      )}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                      <span className="sr-only"> new</span>
                    </span>
                  )}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function Sidebar({
  items,
  currentPath,
  onNavigate,
  header,
  footer,
}: {
  items: readonly NavItem[]
  currentPath: string
  onNavigate?: (href: string) => void
  header?: React.ReactNode
  footer?: React.ReactNode
}): React.JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border-default bg-surface md:flex">
      {header && <div className="border-b border-border-default p-4">{header}</div>}

      <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`)

            if (item.comingSoon) {
              return (
                <li key={item.href}>
                  <span
                    aria-disabled="true"
                    className={cn(
                      'flex min-h-(--size-touch) items-center gap-3 rounded-(--radius-md) px-3',
                      'text-base font-medium text-content-muted opacity-60',
                      '[&_svg]:size-5 [&_svg]:shrink-0',
                    )}
                  >
                    <span aria-hidden>{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium">
                      Soon
                    </span>
                  </span>
                </li>
              )
            }

            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={
                    onNavigate
                      ? (event) => {
                          event.preventDefault()
                          onNavigate(item.href)
                        }
                      : undefined
                  }
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-(--size-touch) items-center gap-3 rounded-(--radius-md) px-3',
                    'text-base font-medium transition-colors',
                    '[&_svg]:size-5 [&_svg]:shrink-0',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
                  )}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="dark:text-danger-950 min-w-6 rounded-full bg-danger-600 px-1.5 text-center text-xs leading-6 font-semibold text-white">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      {footer && <div className="border-t border-border-default p-3">{footer}</div>}
    </aside>
  )
}

/**
 * Sticky bottom action bar for mobile.
 *
 * The important action on a screen — Place Order, Save, Pay — sits here on
 * phones so it is always reachable without scrolling to the end of a long form.
 * It clears the bottom nav and the home indicator.
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'fixed inset-x-0 z-20 border-t border-border-default bg-surface p-3 shadow-raised',
        'pb-safe bottom-(--height-bottom-nav) sm:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Page frame: sidebar on desktop, bottom nav on mobile, content between. */
export function AppShell({
  nav,
  currentPath,
  onNavigate,
  sidebarHeader,
  sidebarFooter,
  topBar,
  children,
}: {
  nav: readonly NavItem[]
  currentPath: string
  onNavigate?: (href: string) => void
  sidebarHeader?: React.ReactNode
  sidebarFooter?: React.ReactNode
  topBar?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={nav}
        currentPath={currentPath}
        onNavigate={onNavigate}
        header={sidebarHeader}
        footer={sidebarFooter}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar && (
          <header className="sticky top-0 z-20 flex h-(--height-app-bar) items-center border-b border-border-default bg-surface px-4">
            {topBar}
          </header>
        )}

        {/* pb-safe-nav keeps content clear of the mobile bottom bar. */}
        <div className="pb-safe-nav flex-1 px-4 py-5 sm:px-6 md:pb-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </div>
      </div>

      <BottomNav items={nav} currentPath={currentPath} onNavigate={onNavigate} />
    </div>
  )
}
