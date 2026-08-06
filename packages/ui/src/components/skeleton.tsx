'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Loading placeholders.
 *
 * Skeletons rather than spinners because they preserve the page's shape — the
 * layout does not jump when data arrives, which reads as faster even when it
 * is not.
 */
export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={cn('animate-pulse rounded-[--radius-md] bg-surface-hover', className)}
      aria-hidden
    />
  )
}

/** Matches the ResponsiveTable layout: rows on desktop, cards on mobile. */
export function TableSkeleton({ rows = 5 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-[--radius-lg] border border-border-default bg-surface p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 3 }: { count?: number }): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-[--radius-lg] border border-border-default bg-surface p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton({ fields = 4 }: { fields?: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </div>
  )
}
