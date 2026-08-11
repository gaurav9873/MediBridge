'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * Tooltip for the ⓘ field hints.
 *
 * Uses Radix, so it opens on hover AND on tap, closes on Escape, and is
 * announced to screen readers — none of which a title attribute manages.
 * The same text always appears in the helper line below the field, so nothing
 * is lost if a user never opens it.
 */
export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}): React.JSX.Element {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 max-w-72 rounded-(--radius-md) bg-content-primary px-3 py-2',
            'text-sm leading-relaxed text-content-inverse shadow-overlay',
            'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-content-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
