'use client'

import type { PageHelp, PageMeta } from '@medibridge/copy'
import { Card, CardBody, HelpPanel } from '@medibridge/ui'
import { Pill } from 'lucide-react'
import * as React from 'react'

/**
 * The frame every signed-out screen shares.
 *
 * Sign-in, sign-up, code entry and password reset are the same page with
 * different contents: logo, title, subtitle, one card, help underneath. Five
 * copies of that markup would drift — one of them would end up with a
 * different max width or lose the help panel — so it lives here.
 *
 * `max-w-md` and the vertical padding are what make these work at 390px
 * without a separate mobile layout.
 */
export interface AuthShellProps {
  page: PageMeta
  help?: PageHelp
  children: React.ReactNode
  /** Links below the card: "Already have an account?", and so on. */
  footer?: React.ReactNode
}

export function AuthShell({ page, help, children, footer }: AuthShellProps): React.JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-[--radius-xl] bg-brand-600 text-white">
            <Pill className="size-7" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
              {page.title}
            </h1>
            <p className="text-base text-content-secondary">{page.subtitle}</p>
          </div>
        </div>

        <Card>
          <CardBody>{children}</CardBody>
        </Card>

        <div className="mt-5 flex flex-col items-center gap-3">
          {footer}
          {help ? <HelpPanel help={help} /> : null}
        </div>
      </div>
    </main>
  )
}
