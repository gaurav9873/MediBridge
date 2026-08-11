'use client'

import { copy } from '@medibridge/copy'
import {
  type ExpiryStatus,
  FORM_LABELS,
  type MedicineForm as MedicineFormValue,
  type StockLevel,
} from '@medibridge/types'
import { StatusBadge, type StatusTone, stockPresentation } from '@medibridge/ui'
import * as React from 'react'
import type { InventoryItem } from '@/lib/inventory'

const c = copy.inventory.list

/**
 * The small pieces every stock screen repeats.
 *
 * Both badges below read their icon and colour from the design system's
 * `stockPresentation` map, which is keyed by the exact strings the domain
 * rules return. That is why `stockLevel()` and `expiryStatus()` were named
 * `inStock` / `lowStock` / `expiringSoon` rather than something tidier — the
 * status crosses from the rules to the screen without a translation step that
 * could disagree.
 */

export function formLabel(form: string): string {
  return FORM_LABELS[form as MedicineFormValue] ?? form
}

/** "650mg · Tablet · 15 tablets" — the line under a medicine's name. */
export function describeItem(item: InventoryItem): string {
  return [item.strength, formLabel(item.form), item.packSize].filter(Boolean).join(' · ')
}

export function StockBadge({ level }: { level: StockLevel }): React.JSX.Element {
  const presentation = stockPresentation[level]
  return (
    <StatusBadge
      label={c.stockLabels[level]}
      tone={presentation?.tone ?? ('neutral' as StatusTone)}
      icon={presentation?.icon}
    />
  )
}

/**
 * Expiry as a badge.
 *
 * Nothing at all when a batch is comfortably fresh — which is most of them,
 * and a row of green "Good" badges is noise that hides the two that matter.
 */
export function ExpiryBadge({
  status,
  days,
  showFresh = false,
}: {
  status: ExpiryStatus
  days: number
  showFresh?: boolean
}): React.JSX.Element | null {
  if (status === 'fresh' && !showFresh) return null

  const presentation = status === 'fresh' ? undefined : stockPresentation[status]
  return (
    <StatusBadge
      label={
        status === 'fresh' ? c.expiryLabels.fresh : copy.inventory.expiryAlerts.daysLeft(days)
      }
      tone={presentation?.tone ?? 'success'}
      icon={presentation?.icon}
    />
  )
}

/** Medicine name, brand and the identity line. The headline of every card. */
export function ItemIdentity({ item }: { item: InventoryItem }): React.JSX.Element {
  const detail = describeItem(item)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-semibold text-content-primary">{item.medicineName}</span>
      <span className="text-sm text-content-secondary">{item.brand}</span>
      {detail && <span className="text-sm text-content-muted">{detail}</span>}
    </div>
  )
}
