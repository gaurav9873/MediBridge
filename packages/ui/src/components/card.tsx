'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

/** Standard surface for grouped content. One elevation, used everywhere. */
export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'section' | 'article'
}): React.JSX.Element {
  return (
    <Component
      className={cn(
        'rounded-[--radius-lg] border border-border-default bg-surface shadow-card',
        className,
      )}
    >
      {children}
    </Component>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-border-default p-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-base font-semibold text-content-primary">{title}</h2>
        {description && <p className="text-sm text-content-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <div className={cn('p-4', className)}>{children}</div>
}

/**
 * A single headline number for dashboards.
 *
 * `hint` explains what the number means in plain words — "Cash to Keep Ready"
 * is only useful if the user knows it means the balance due on delivery.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  href,
}: {
  label: string
  value: string
  hint?: string
  icon?: React.ReactNode
  tone?: 'default' | 'urgent'
  href?: string
}): React.JSX.Element {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-content-secondary">{label}</span>
        {icon && (
          <span
            className={cn(
              '[&_svg]:size-5',
              tone === 'urgent' ? 'text-warning-600' : 'text-content-muted',
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <span className="text-2xl font-semibold text-content-primary tabular-nums">{value}</span>
      {hint && <span className="text-sm text-content-muted">{hint}</span>}
    </>
  )

  const classes = cn(
    'flex flex-col gap-1 rounded-[--radius-lg] border bg-surface p-4 shadow-card',
    tone === 'urgent' ? 'border-warning-500' : 'border-border-default',
    href && 'transition-colors hover:bg-surface-hover',
  )

  return href ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <div className={classes}>{content}</div>
  )
}
