'use client'

import { Button, Card, CardBody, CardHeader, EmptyState, Skeleton, notify } from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MonitorSmartphone } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface SessionSummary {
  id: string
  device: string
  ipAddress: string | null
  signedInAt: string
  lastSeenAt: string
  isCurrent: boolean
}

/**
 * Where this account is signed in, and how to stop that.
 *
 * A pharmacy counter machine is shared and rarely signed out of. Being able to
 * see "Chrome on Windows, three weeks ago" and end it is the difference
 * between suspecting a problem and fixing one.
 *
 * The current session is never offered a "Sign out" button — signing yourself
 * out from a list of devices reads as a bug. "Sign out" at the bottom of the
 * page already does that, deliberately.
 */
export function AccountSessions(): React.JSX.Element {
  const queryClient = useQueryClient()

  const sessions = useQuery({
    queryKey: ['account', 'sessions'],
    queryFn: () => api.get<SessionSummary[]>('/account/sessions'),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/account/sessions/${id}`),
    onSuccess: () => {
      notify.success('That device has been signed out.')
      void queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] })
    },
    onError: (error) => {
      notify.error(error instanceof ApiClientError ? error.message : undefined)
    },
  })

  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/account/sessions/revoke-others', {}),
    onSuccess: (result) => {
      notify.success(
        result.revoked === 0
          ? 'You are not signed in anywhere else.'
          : `Signed out of ${result.revoked} other device${result.revoked === 1 ? '' : 's'}.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] })
    },
    onError: (error) => {
      notify.error(error instanceof ApiClientError ? error.message : undefined)
    },
  })

  const others = (sessions.data ?? []).filter((session) => !session.isCurrent)

  return (
    <Card>
      <CardHeader
        title="Where you are signed in"
        description="End any session you do not recognise."
      />
      <CardBody>
        {sessions.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (sessions.data ?? []).length === 0 ? (
          <EmptyState
            icon={<MonitorSmartphone />}
            copy={{
              title: 'No active sessions',
              body: 'You are not signed in on any device. That is unusual — try reloading the page.',
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Cards on a phone, a row per session on a wider screen. */}
            {(sessions.data ?? []).map((session) => (
              <div
                key={session.id}
                className="flex flex-col gap-3 rounded-(--radius-lg) border border-border-default p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-content-primary">
                    {session.device}
                    {session.isCurrent ? (
                      <span className="ml-2 rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-800 dark:bg-success-900 dark:text-success-100">
                        This device
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-content-secondary">
                    {session.ipAddress ?? 'Unknown location'} · signed in{' '}
                    {formatWhen(session.signedInAt)}
                  </span>
                </div>
                {session.isCurrent ? null : (
                  <Button
                    variant="secondary"
                    size="md"
                    loading={revoke.isPending && revoke.variables === session.id}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    Sign out
                  </Button>
                )}
              </div>
            ))}

            {others.length > 0 ? (
              <Button
                variant="secondary"
                size="md"
                loading={revokeOthers.isPending}
                onClick={() => revokeOthers.mutate()}
              >
                Sign out of all other devices
              </Button>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

/** "today", "yesterday", or a plain date — not a raw timestamp. */
function formatWhen(iso: string): string {
  const then = new Date(iso)
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
