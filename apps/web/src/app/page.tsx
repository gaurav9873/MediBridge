'use client'

import { Skeleton } from '@medibridge/ui'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useSession } from '@/lib/use-session'

/**
 * Entry point — sends people where they belong rather than showing a page.
 *
 * Admins go to the admin panel, retailers and distributors to their account,
 * and anyone signed out to the sign-in page. Nothing here 404s, which is the
 * whole point: every route the app links to exists.
 */
export default function RootPage(): React.JSX.Element {
  const { user, isLoading } = useSession()
  const router = useRouter()

  React.useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace('/login')
    } else if (user.role === 'ADMIN') {
      router.replace('/admin')
    } else {
      router.replace('/account')
    }
  }, [user, isLoading, router])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-48 w-full" />
    </main>
  )
}
