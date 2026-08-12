'use client'

import type { SessionUser } from '@medibridge/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ApiClientError, api } from './api-client'

/**
 * The signed-in user.
 *
 * The session itself lives in httpOnly cookies the browser cannot read, so
 * "am I signed in?" is answered by asking the API rather than by inspecting
 * storage. That is the point of the httpOnly cookie: an XSS bug cannot steal
 * a session it cannot see.
 */
export function useSession(): {
  user: SessionUser | null
  isLoading: boolean
  isSignedIn: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const result = await api.get<{ user: SessionUser }>('/auth/me')
        return result.user
      } catch (error) {
        /*
         * The api client already tried the refresh cookie and, if that failed,
         * has started a clean sign-out. Reaching here means the session is
         * genuinely over, so there is nothing left to attempt — this used to
         * run its own refresh, which raced the client's and could trip the
         * refresh-token replay detection.
         */
        if (
          error instanceof ApiClientError &&
          (error.code === 'UNAUTHENTICATED' || error.code === 'SESSION_EXPIRED')
        ) {
          return null
        }
        throw error
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  })

  return {
    user: data ?? null,
    isLoading,
    isSignedIn: Boolean(data),
  }
}

export function useSignOut(): { signOut: () => void; isPending: boolean } {
  const queryClient = useQueryClient()
  const router = useRouter()

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/sign-out'),
    onSettled: () => {
      // Clear cached data even if the request failed — the cookies are gone
      // either way and stale admin data should not linger on screen.
      queryClient.clear()
      router.replace('/admin/login')
    },
  })

  return { signOut: () => mutation.mutate(), isPending: mutation.isPending }
}
