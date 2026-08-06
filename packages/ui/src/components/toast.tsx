'use client'

import { copy } from '@medibridge/copy'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import * as React from 'react'
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'

/**
 * Confirmation messages.
 *
 * Every action that changes something says so. The helpers below are the only
 * way to raise a toast, and `notify.error` takes a friendly message — the API
 * client resolves error codes to copy before ever calling it, so a raw error
 * string cannot reach a user through this path.
 */

/**
 * Tracks whether the app is in dark mode.
 *
 * Sonner paints its own surface, so it needs telling which theme to use — it
 * cannot see our `.dark` class. A MutationObserver keeps it in step even when
 * the theme is switched at runtime, rather than only matching the OS setting
 * (which would desync the moment a theme toggle ships).
 */
function useIsDark(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      return () => observer.disconnect()
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
}

export function ToastProvider(): React.JSX.Element {
  const isDark = useIsDark()

  return (
    <SonnerToaster
      position="top-center"
      theme={isDark ? 'dark' : 'light'}
      offset={16}
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          title: 'text-base font-semibold',
          description: 'text-sm opacity-80',
        },
        duration: 4000,
      }}
    />
  )
}

export const notify = {
  /** "Order placed successfully." — confirmation of a completed action. */
  success(message: string, description?: string): void {
    sonnerToast.success(message, {
      description,
      icon: <CheckCircle2 className="size-5 text-success-600" />,
    })
  },

  /**
   * Failure. `message` must already be user-safe — pass friendlyMessage(code)
   * or a sentence from @medibridge/copy, never an Error's own text.
   */
  error(message?: string, description?: string): void {
    sonnerToast.error(message ?? copy.common.feedback.somethingWentWrong, {
      description: description ?? copy.common.feedback.somethingWentWrongBody,
      icon: <AlertCircle className="size-5 text-danger-600" />,
      duration: 6000,
    })
  },

  info(message: string, description?: string): void {
    sonnerToast(message, {
      description,
      icon: <Info className="size-5 text-info-600" />,
    })
  },

  /**
   * Ties a toast to an in-flight promise: a spinner while it runs, then the
   * success or failure message. Gives immediate feedback on every action.
   */
  promise<T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ): void {
    sonnerToast.promise(promise, messages)
  },

  /** Lets a caller dismiss a specific toast, e.g. on navigation. */
  dismiss(id?: string | number): void {
    sonnerToast.dismiss(id)
  },
}
