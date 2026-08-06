'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as React from 'react'

/**
 * TanStack Query setup.
 *
 * The defaults here are performance-as-UX decisions:
 *   - staleTime 60s so moving between screens reads from cache instead of
 *     re-fetching and flashing a skeleton the user has already seen
 *   - one retry, not the default three, so a genuine failure surfaces quickly
 *     rather than leaving someone watching a spinner
 *   - no retry on 4xx, which will not succeed on a second attempt
 *   - mutations never auto-retry: replaying a checkout could place two orders
 */
export function QueryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status
              if (status && status >= 400 && status < 500) return false
              return failureCount < 1
            },
          },
          mutations: { retry: false },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
