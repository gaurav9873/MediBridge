'use client'

import type { EmptyState as EmptyStateCopy } from '@medibridge/copy'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'

/**
 * What a screen shows when it has no data.
 *
 * Takes an EmptyState object from the copy layer, which always carries a title
 * and a body, and usually an action. The rule this encodes: an empty screen
 * must tell the user what to do next, never just report that it is empty.
 *
 * `filtered` switches to the "your filters hid everything" wording, which is a
 * different problem with a different fix and deserves different words.
 */
export function EmptyState({
  copy,
  icon,
  filtered = false,
  onAction,
  className,
}: {
  copy: EmptyStateCopy
  icon?: React.ReactNode
  filtered?: boolean
  /** Use when the action is a handler rather than navigation. */
  onAction?: () => void
  className?: string
}): React.JSX.Element {
  const title = filtered ? (copy.filteredTitle ?? copy.title) : copy.title
  const body = filtered ? (copy.filteredBody ?? copy.body) : copy.body

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-(--radius-lg)',
        'border border-dashed border-border-default bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="text-content-muted [&_svg]:size-10" aria-hidden>
          {icon}
        </div>
      )}

      <h3 className="text-lg font-semibold text-content-primary">{title}</h3>
      <p className="max-w-md text-base text-content-secondary">{body}</p>

      {copy.action && (
        <div className="mt-2">
          {copy.action.href && !onAction ? (
            <Button asChild size="lg">
              <a href={copy.action.href}>{copy.action.label}</a>
            </Button>
          ) : (
            <Button size="lg" onClick={onAction}>
              {copy.action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
