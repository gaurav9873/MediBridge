'use client'

import type { OnboardingTour as TourCopy } from '@medibridge/copy'
import * as Dialog from '@radix-ui/react-dialog'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'

/**
 * First-run guided walkthrough.
 *
 * Shown once per tour id, remembered in localStorage, and re-openable from the
 * Help panel. Steps point at elements marked `data-tour="<target>"`; the tour
 * scrolls each into view and highlights it.
 *
 *   <div data-tour="cart">…</div>
 *   <OnboardingTour tour={copy.auth.retailerTour} />
 *
 * Kept deliberately skippable at every step — a walkthrough that traps someone
 * who already knows the product is worse than no walkthrough.
 */

const STORAGE_PREFIX = 'medibridge.tour.'

export function hasSeenTour(tourId: string): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(`${STORAGE_PREFIX}${tourId}`) === 'done'
}

export function markTourSeen(tourId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, 'done')
}

export function resetTour(tourId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(`${STORAGE_PREFIX}${tourId}`)
}

/** No-op subscribe: localStorage only changes here, via markTourSeen. */
function subscribeToNothing(): () => void {
  return () => {}
}

export function useOnboardingTour(tour: TourCopy): {
  open: boolean
  start: () => void
  close: () => void
} {
  /*
   * localStorage is an external store, so it is read through
   * useSyncExternalStore rather than an effect. That keeps the server render
   * (always "seen", so nothing flashes) consistent with hydration, without
   * calling setState during an effect.
   */
  const seen = React.useSyncExternalStore(
    subscribeToNothing,
    () => hasSeenTour(tour.id),
    () => true,
  )

  // Tracks explicit user intent, which overrides what localStorage says.
  const [override, setOverride] = React.useState<'open' | 'closed' | null>(null)

  const open = override === 'open' || (override === null && !seen)

  return {
    open,
    start: () => setOverride('open'),
    close: () => {
      markTourSeen(tour.id)
      setOverride('closed')
    },
  }
}

export function OnboardingTour({
  tour,
  open,
  onClose,
}: {
  tour: TourCopy
  open: boolean
  onClose: () => void
}): React.JSX.Element | null {
  // -1 is the intro, steps.length is the outro.
  const [index, setIndex] = React.useState(-1)

  // Rewind on the way out rather than on the way in, so reopening always starts
  // at the intro without resetting state from inside an effect.
  const handleClose = React.useCallback(() => {
    setIndex(-1)
    onClose()
  }, [onClose])

  const step = index >= 0 && index < tour.steps.length ? tour.steps[index] : null

  // Bring the highlighted element into view and outline it.
  React.useEffect(() => {
    if (!open || !step) return
    const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.classList.add('ring-2', 'ring-brand-500', 'ring-offset-2', 'rounded-(--radius-md)')
    return () => {
      element.classList.remove('ring-2', 'ring-brand-500', 'ring-offset-2', 'rounded-(--radius-md)')
    }
  }, [open, step])

  if (!open) return null

  const isIntro = index === -1
  const isOutro = index >= tour.steps.length

  const title = isIntro ? tour.intro.title : isOutro ? tour.outro.title : (step?.title ?? '')
  const body = isIntro ? tour.intro.body : isOutro ? tour.outro.body : (step?.body ?? '')

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col gap-4 bg-surface p-5 shadow-overlay',
            // Bottom sheet on mobile, centred card on desktop.
            'inset-x-0 bottom-0 rounded-t-(--radius-xl)',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-(--radius-xl)',
            'pb-safe sm:pb-5',
          )}
        >
          {!isIntro && !isOutro && (
            <div className="flex items-center gap-1.5" aria-hidden>
              {tour.steps.map((_, stepIndex) => (
                <span
                  key={stepIndex}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    stepIndex <= index ? 'bg-brand-600' : 'bg-border-default',
                  )}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Dialog.Title className="text-xl font-semibold text-content-primary">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-base leading-relaxed text-content-secondary">
              {body}
            </Dialog.Description>
          </div>

          {!isIntro && !isOutro && (
            <p className="text-sm text-content-muted">
              Step {index + 1} of {tour.steps.length}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {isIntro && (
              <>
                <Button size="lg" fullWidth onClick={() => setIndex(0)}>
                  {tour.intro.startLabel}
                </Button>
                <Button variant="ghost" size="lg" fullWidth onClick={handleClose}>
                  {tour.intro.skipLabel}
                </Button>
              </>
            )}

            {!isIntro && !isOutro && (
              <>
                <Button size="lg" fullWidth onClick={() => setIndex(index + 1)}>
                  Next
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  fullWidth
                  onClick={() => (index === 0 ? setIndex(-1) : setIndex(index - 1))}
                >
                  Back
                </Button>
              </>
            )}

            {isOutro && (
              <Button size="lg" fullWidth onClick={handleClose}>
                {tour.outro.doneLabel}
              </Button>
            )}
          </div>

          {!isOutro && (
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-content-muted underline underline-offset-4 hover:text-content-secondary"
            >
              Skip this tour
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
