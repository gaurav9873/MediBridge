'use client'

import { copy } from '@medibridge/copy'
import type { PageHelp } from '@medibridge/copy'
import * as Dialog from '@radix-ui/react-dialog'
import { HelpCircle, Phone, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'

/**
 * The Help panel every page carries.
 *
 * Opens as a right-hand drawer on desktop and a bottom sheet on mobile. Its
 * content is a PageHelp object from the copy layer, so the questions are
 * written in the same plain English as the rest of the product and reviewed in
 * the same place.
 *
 * `onReplayTour` appears only on pages that have a guided tour, giving users a
 * way back to it after they have dismissed it.
 */
export function HelpPanel({
  help,
  onReplayTour,
  triggerClassName,
}: {
  help: PageHelp
  onReplayTour?: () => void
  triggerClassName?: string
}): React.JSX.Element {
  const c = copy.common.help

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="md"
          icon={<HelpCircle />}
          className={cn('text-content-secondary', triggerClassName)}
        >
          {copy.common.actions.getHelp}
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/40',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-overlay',
            // Mobile: a bottom sheet, capped so the page stays visible behind.
            'inset-x-0 bottom-0 max-h-[85vh] rounded-t-[--radius-xl]',
            // Desktop: a right-hand drawer.
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:rounded-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
            'sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border-default p-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-xl font-semibold text-content-primary">
                {c.panelTitle}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-content-secondary">
                {c.panelSubtitle}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={copy.common.actions.close}>
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <div className="pb-safe flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-content-muted uppercase">
                {c.whatIsThisHeading}
              </h3>
              <p className="text-base leading-relaxed text-content-primary">{help.whatIsThis}</p>
            </section>

            {help.topics.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold tracking-wide text-content-muted uppercase">
                  {c.commonQuestionsHeading}
                </h3>
                <div className="flex flex-col gap-2">
                  {help.topics.map((topic) => (
                    <details
                      key={topic.question}
                      className="group rounded-[--radius-md] border border-border-default bg-surface-sunken"
                    >
                      <summary
                        className={cn(
                          'flex min-h-[--size-touch] cursor-pointer items-center px-4 py-3',
                          'text-base font-medium text-content-primary',
                          'group-open:pb-2 marker:content-[""]',
                        )}
                      >
                        {topic.question}
                      </summary>
                      <p className="px-4 pb-3 text-base leading-relaxed text-content-secondary">
                        {topic.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {onReplayTour && (
              <Dialog.Close asChild>
                <Button variant="secondary" size="lg" fullWidth onClick={onReplayTour}>
                  {c.replayTour}
                </Button>
              </Dialog.Close>
            )}

            <section className="mt-auto flex flex-col gap-2 rounded-[--radius-lg] bg-brand-50 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-brand-900">
                <Phone className="size-4" aria-hidden />
                {c.stillStuck}
              </h3>
              <p className="text-sm leading-relaxed text-brand-900/80">{c.stillStuckBody}</p>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
