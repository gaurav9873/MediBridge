'use client'

import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Package,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Status indicator.
 *
 * Always renders an icon AND a word, never colour alone. That is an
 * accessibility requirement for colourblind users, but it also just reads
 * faster — a glanceable shape beats decoding a colour key.
 */

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-surface-sunken text-content-secondary border-border-default',
  info: 'bg-info-50 text-info-900 border-info-100',
  success: 'bg-success-50 text-success-900 border-success-100',
  warning: 'bg-warning-50 text-warning-900 border-warning-100',
  danger: 'bg-danger-50 text-danger-900 border-danger-100',
}

export function StatusBadge({
  label,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string
  tone?: StatusTone
  icon?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-sm font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {icon && (
        <span className="[&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      )}
      {label}
    </span>
  )
}

/**
 * Presentation for each order status, in one place.
 *
 * The label itself comes from copy.orders.status at the call site, so this map
 * only decides the icon and colour — keeping wording and visuals separately
 * editable.
 */
export const orderStatusPresentation: Record<string, { tone: StatusTone; icon: React.ReactNode }> =
  {
    PENDING_PAYMENT: { tone: 'warning', icon: <CreditCard /> },
    CONFIRMED: { tone: 'info', icon: <Check /> },
    ACCEPTED: { tone: 'info', icon: <CheckCircle2 /> },
    PACKED: { tone: 'info', icon: <Package /> },
    DISPATCHED: { tone: 'info', icon: <Truck /> },
    DELIVERED: { tone: 'success', icon: <PackageCheck /> },
    CANCELLED: { tone: 'neutral', icon: <Ban /> },
    REJECTED: { tone: 'danger', icon: <XCircle /> },
    RETURNED: { tone: 'warning', icon: <RotateCcw /> },
  }

export const paymentStatusPresentation: Record<
  string,
  { tone: StatusTone; icon: React.ReactNode }
> = {
  PENDING: { tone: 'warning', icon: <Clock /> },
  PAID: { tone: 'success', icon: <CheckCircle2 /> },
  FAILED: { tone: 'danger', icon: <XCircle /> },
  REFUNDED: { tone: 'neutral', icon: <RotateCcw /> },
  PARTIALLY_REFUNDED: { tone: 'neutral', icon: <RotateCcw /> },
}

export const stockPresentation: Record<string, { tone: StatusTone; icon: React.ReactNode }> = {
  inStock: { tone: 'success', icon: <CheckCircle2 /> },
  lowStock: { tone: 'warning', icon: <AlertTriangle /> },
  outOfStock: { tone: 'danger', icon: <XCircle /> },
  expiringSoon: { tone: 'warning', icon: <Clock /> },
  expired: { tone: 'danger', icon: <Ban /> },
}
