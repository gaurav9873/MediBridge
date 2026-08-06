'use client'

import type { PageHelp, PageMeta } from '@medibridge/copy'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'
import { HelpPanel } from './help-panel'

/**
 * The frame every page uses.
 *
 * `page` is a PageMeta from the copy layer, which requires BOTH a title and a
 * subtitle. `help` is required too. Between them, every screen in the product
 * structurally answers the two questions from the UX brief:
 *
 *   "What is this page for?"   -> the subtitle, and the Help panel
 *   "What should I do next?"   -> the primary action
 *
 * They cannot be forgotten on a screen, because the component will not compile
 * without them.
 */
export function PageShell({
  page,
  help,
  primaryAction,
  secondaryAction,
  onReplayTour,
  banner,
  toolbar,
  children,
  className,
}: {
  page: PageMeta
  /** Required. Every page explains itself. */
  help: PageHelp
  primaryAction?: { label: string; href?: string; onClick?: () => void; loading?: boolean }
  secondaryAction?: { label: string; href?: string; onClick?: () => void }
  onReplayTour?: () => void
  /** Full-width alert above the heading — expiring licence, pending approval. */
  banner?: React.ReactNode
  /** Filters and search, shown under the heading. */
  toolbar?: React.ReactNode
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {banner}

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
              {page.title}
            </h1>
            <p className="text-base text-content-secondary">{page.subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <HelpPanel help={help} onReplayTour={onReplayTour} />

            {secondaryAction &&
              (secondaryAction.href ? (
                <Button asChild variant="secondary">
                  <a href={secondaryAction.href}>{secondaryAction.label}</a>
                </Button>
              ) : (
                <Button variant="secondary" onClick={secondaryAction.onClick}>
                  {secondaryAction.label}
                </Button>
              ))}

            {/*
             * Hidden on mobile: the primary action is rendered by
             * StickyActionBar at the bottom of the screen instead, where a
             * thumb can actually reach it.
             */}
            {primaryAction &&
              (primaryAction.href ? (
                <Button asChild className="hidden sm:inline-flex">
                  <a href={primaryAction.href}>{primaryAction.label}</a>
                </Button>
              ) : (
                <Button
                  className="hidden sm:inline-flex"
                  onClick={primaryAction.onClick}
                  loading={primaryAction.loading}
                >
                  {primaryAction.label}
                </Button>
              ))}
          </div>
        </div>

        {toolbar}
      </header>

      <main className="flex flex-col gap-4">{children}</main>
    </div>
  )
}
