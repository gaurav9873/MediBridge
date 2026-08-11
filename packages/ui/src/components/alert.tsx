'use client'

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'

/**
 * Page-level message — an expiring licence, an account awaiting approval, a
 * failed payment.
 *
 * Icon plus colour plus words, never colour alone. `danger` and `warning`
 * announce themselves to screen readers, since those usually block something
 * the user is trying to do.
 */

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const toneStyles: Record<AlertTone, { container: string; icon: React.ReactNode }> = {
  info: {
    container: 'border-info-100 bg-info-50 text-info-900',
    icon: <Info className="text-info-600" />,
  },
  success: {
    container: 'border-success-100 bg-success-50 text-success-900',
    icon: <CheckCircle2 className="text-success-600" />,
  },
  warning: {
    container: 'border-warning-100 bg-warning-50 text-warning-900',
    icon: <AlertTriangle className="text-warning-600" />,
  },
  danger: {
    container: 'border-danger-100 bg-danger-50 text-danger-900',
    icon: <XCircle className="text-danger-600" />,
  },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone
  title: string
  children?: React.ReactNode
  action?: { label: string; href?: string; onClick?: () => void }
  className?: string
}): React.JSX.Element {
  const style = toneStyles[tone]
  const assertive = tone === 'danger' || tone === 'warning'

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 rounded-(--radius-lg) border p-4 sm:flex-row sm:items-start',
        style.container,
        className,
      )}
    >
      <span className="shrink-0 [&_svg]:size-5" aria-hidden>
        {style.icon}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        {children && <div className="text-base leading-relaxed opacity-90">{children}</div>}
      </div>

      {action && (
        <div className="shrink-0">
          {action.href ? (
            <Button asChild variant="secondary" size="md">
              <a href={action.href}>{action.label}</a>
            </Button>
          ) : (
            <Button variant="secondary" size="md" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
