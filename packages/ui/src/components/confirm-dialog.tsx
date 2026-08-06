'use client'

import { copy } from '@medibridge/copy'
import * as Dialog from '@radix-ui/react-dialog'
import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'

/**
 * Confirmation before anything destructive or hard to undo — cancelling an
 * order, rejecting documents, deleting stock.
 *
 * The confirm button carries its own `loading` state, so a slow request cannot
 * be double-submitted from here either.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  loading = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  loading?: boolean
  onConfirm: () => void
  /** Extra content, e.g. a required "why are you cancelling?" field. */
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/40',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col gap-4 bg-surface p-5 shadow-overlay',
            'pb-safe inset-x-0 bottom-0 rounded-t-[--radius-xl]',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-[--radius-xl] sm:pb-5',
          )}
        >
          <div className="flex flex-col gap-2">
            <Dialog.Title className="text-lg font-semibold text-content-primary">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-base leading-relaxed text-content-secondary">
              {body}
            </Dialog.Description>
          </div>

          {children}

          {/* Confirm sits on top on mobile (thumb-reachable) and right on desktop. */}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              size="lg"
              fullWidth
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
            <Dialog.Close asChild>
              <Button variant="secondary" size="lg" fullWidth disabled={loading}>
                {cancelLabel ?? copy.common.actions.cancel}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
