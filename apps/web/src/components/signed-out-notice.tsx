'use client'

import { copy } from '@medibridge/copy'
import { Alert } from '@medibridge/ui'
import * as React from 'react'

/**
 * Says why you are looking at the login page.
 *
 * Being returned to a login screen with no explanation reads as the app having
 * lost your work. It has not — the session simply ended — and one sentence is
 * the difference between "it broke" and "that is expected".
 *
 * The flag is read through useSyncExternalStore rather than an effect: the
 * query string is external state that never changes for the life of this page,
 * so there is nothing to subscribe to and nothing to set. Reading it in an
 * effect would render once without the notice and again with it.
 *
 * `useSearchParams` would do the same job but forces the whole page under a
 * Suspense boundary to look at one flag.
 */
const subscribe = (): (() => void) => () => {}

export function SignedOutNotice(): React.JSX.Element | null {
  const expired = React.useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get('expired') === '1',
    // Server render: the query string is not known, so assume no notice.
    () => false,
  )

  if (!expired) return null

  return (
    <Alert tone="info" title={copy.common.feedback.sessionExpired} className="mb-4">
      {copy.common.feedback.sessionExpiredBody}
    </Alert>
  )
}
