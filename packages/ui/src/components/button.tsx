'use client'

import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * The only button in the product.
 *
 * Two behaviours are built in rather than left to each call site:
 *
 *   1. `loading` disables the button AND swaps in a spinner, so a slow network
 *      can never produce two orders from one impatient double-tap.
 *   2. Every size is at least 44px tall — the minimum comfortable tap target.
 *      There is deliberately no smaller size available.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[--radius-md]',
    'font-medium transition-colors select-none',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:size-5 [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        /*
         * Solid fills flip in dark mode: a brighter surface with dark text.
         * Keeping `text-white` on the same mid-tone brand would land around
         * 4:1 against a dark page — legible but under AA for body text.
         */
        primary:
          'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 dark:bg-brand-400 dark:text-brand-950 dark:hover:bg-brand-300',
        secondary:
          'bg-surface-raised text-content-primary border border-border-strong hover:bg-surface-hover',
        ghost: 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
        danger:
          'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-900 dark:text-danger-950 dark:hover:bg-danger-500',
        link: 'text-brand-600 underline-offset-4 hover:underline p-0 h-auto min-h-0 dark:text-brand-400',
      },
      size: {
        // 44px — the floor for anything tappable.
        md: 'min-h-[--size-touch] px-4 text-base',
        // 48px — primary actions, especially the sticky mobile CTA.
        lg: 'min-h-[--size-touch-lg] px-6 text-base',
        icon: 'min-h-[--size-touch] w-[--size-touch] p-0',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renders the child element instead of a <button>. Use for links. */
  asChild?: boolean
  /**
   * Shows a spinner and blocks further clicks. Wire this to your mutation's
   * pending state — it is what stops duplicate submissions.
   */
  loading?: boolean
  /** Announced to screen readers while loading. Defaults to "Please wait". */
  loadingLabel?: string
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    fullWidth,
    asChild = false,
    loading = false,
    loadingLabel = 'Please wait',
    icon,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className)

  /*
   * asChild hands the props to the caller's own element (usually an <a>).
   * Radix's Slot requires exactly one child, so the icon/spinner slot is not
   * rendered in this mode — links styled as buttons don't need it, and adding
   * it would throw React.Children.only at runtime.
   */
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot>
    )
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={loading ? loadingLabel : props['aria-label']}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export { buttonVariants }
