'use client'

import { copy } from '@medibridge/copy'
import type { EmptyState as EmptyStateCopy } from '@medibridge/copy'
import { AlertTriangle } from 'lucide-react'
import * as React from 'react'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { TableSkeleton } from './skeleton'

/**
 * Wraps any list or table and handles all four states it can be in.
 *
 * `emptyState` is a REQUIRED prop. That is the point: you cannot render a list
 * in this product without having decided what it says when there is nothing to
 * show. The loading and error states are handled here too, so no screen ever
 * renders a blank white rectangle or a raw error string.
 *
 *   <DataView
 *     data={orders}
 *     isLoading={isPending}
 *     error={error}
 *     emptyState={copy.orders.list.retailerEmpty}
 *     isFiltered={hasActiveFilters}
 *   >
 *     {(orders) => <OrderTable orders={orders} />}
 *   </DataView>
 */
export function DataView<T>({
  data,
  isLoading = false,
  error,
  emptyState,
  emptyIcon,
  isFiltered = false,
  onRetry,
  onClearFilters,
  onEmptyAction,
  loadingFallback,
  children,
}: {
  data: readonly T[] | undefined
  isLoading?: boolean
  /** Already-friendly message. Never pass a raw Error's text. */
  error?: string | null
  /** Required — every list must say what to do when it is empty. */
  emptyState: EmptyStateCopy
  emptyIcon?: React.ReactNode
  /** Switches the empty copy to the "no results for your filters" wording. */
  isFiltered?: boolean
  onRetry?: () => void
  onClearFilters?: () => void
  /** Handles the empty state's call to action instead of following its href. */
  onEmptyAction?: () => void
  loadingFallback?: React.ReactNode
  children: (data: readonly T[]) => React.ReactNode
}): React.JSX.Element {
  if (isLoading) {
    return <>{loadingFallback ?? <TableSkeleton />}</>
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-[--radius-lg] border border-danger-100 bg-danger-50 px-6 py-10 text-center"
      >
        <AlertTriangle className="size-8 text-danger-600" aria-hidden />
        <h3 className="text-lg font-semibold text-danger-900">
          {copy.common.feedback.somethingWentWrong}
        </h3>
        <p className="max-w-md text-base text-danger-900/80">{error}</p>
        {onRetry && (
          <Button variant="secondary" size="lg" onClick={onRetry} className="mt-1">
            {copy.common.actions.retry}
          </Button>
        )}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        copy={emptyState}
        icon={emptyIcon}
        filtered={isFiltered}
        onAction={isFiltered ? onClearFilters : onEmptyAction}
      />
    )
  }

  return <>{children(data)}</>
}
