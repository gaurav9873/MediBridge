'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * One data set, two layouts.
 *
 * A real <table> from `md` upwards, stacked cards below it. Retailers and
 * distributors will often be on a phone behind the counter, and a six-column
 * table on a 390px screen is unusable however much it scrolls.
 *
 * Each column declares how it behaves on mobile:
 *   primary   — the card's headline (medicine name, order number)
 *   secondary — the card's subtitle
 *   meta      — a labelled row in the card body
 *   hidden    — desktop only; drop it on mobile rather than cramming it in
 *
 * Defining this once means every module gets correct mobile behaviour for
 * free, instead of each screen inventing its own.
 */
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  /** How this column appears in the mobile card. Defaults to 'meta'. */
  mobile?: 'primary' | 'secondary' | 'meta' | 'hidden'
  align?: 'left' | 'right' | 'center'
  /** Extra classes for the desktop cell. */
  className?: string
}

export interface ResponsiveTableProps<T> {
  columns: ReadonlyArray<Column<T>>
  rows: readonly T[]
  rowKey: (row: T) => string
  /** Makes the whole row/card activate. Keyboard accessible on both layouts. */
  onRowClick?: (row: T) => void
  /** Rendered at the bottom of each mobile card, e.g. an action button. */
  mobileFooter?: (row: T) => React.ReactNode
  caption?: string
  className?: string
}

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  mobileFooter,
  caption,
  className,
}: ResponsiveTableProps<T>): React.JSX.Element {
  const primary = columns.find((column) => column.mobile === 'primary') ?? columns[0]
  const secondary = columns.find((column) => column.mobile === 'secondary')
  const metaColumns = columns.filter(
    (column) => column !== primary && column !== secondary && column.mobile !== 'hidden',
  )

  const alignClass = (align: Column<T>['align']): string =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  return (
    <div className={className}>
      {/* ---------- Desktop: a real table, horizontally scrollable ---------- */}
      <div className="scroll-x hidden rounded-(--radius-lg) border border-border-default bg-surface md:block">
        <table className="w-full border-collapse text-base">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border-default bg-surface-sunken">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-sm font-semibold text-content-secondary',
                    alignClass(column.align),
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                className={cn(
                  'border-b border-border-default last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-hover',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-3.5', alignClass(column.align), column.className)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Mobile: stacked cards ---------- */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const interactive = Boolean(onRowClick)
          return (
            <li key={rowKey(row)}>
              <div
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? 'button' : undefined}
                className={cn(
                  'flex flex-col gap-3 rounded-(--radius-lg) border border-border-default',
                  'bg-surface p-4 shadow-card',
                  interactive && 'active:bg-surface-hover',
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="text-base font-semibold text-content-primary">
                    {primary?.render(row)}
                  </div>
                  {secondary && (
                    <div className="text-sm text-content-secondary">{secondary.render(row)}</div>
                  )}
                </div>

                {metaColumns.length > 0 && (
                  <dl className="flex flex-col gap-1.5 border-t border-border-default pt-3">
                    {metaColumns.map((column) => (
                      <div key={column.key} className="flex items-baseline justify-between gap-4">
                        <dt className="text-sm text-content-secondary">{column.header}</dt>
                        <dd className="text-right text-sm font-medium text-content-primary">
                          {column.render(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {mobileFooter && (
                  <div className="border-t border-border-default pt-3">{mobileFooter(row)}</div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
