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
        // An expired access token is normal — try the refresh cookie once
        // before deciding the user is signed out.
        if (error instanceof ApiClientError && error.code === 'SESSION_EXPIRED') {
          try {
            const refreshed = await api.post<{ user: SessionUser }>('/auth/refresh')
            return refreshed.user
          } catch {
            return null
          }
        }
        if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') return null
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
