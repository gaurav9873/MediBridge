'use client'

import { Card, CardBody, CardHeader, Skeleton, notify } from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface NotificationSetting {
  event: string
  label: string
  description: string
  channels: Record<string, boolean>
}

const CHANNELS = [
  { key: 'SMS', label: 'SMS' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
] as const

/**
 * What we tell you about, and how.
 *
 * Everything stays in the app whatever is ticked here — this only decides
 * whether it also costs an SMS. Saying so on the screen stops people turning
 * everything off and then wondering why they missed an order.
 *
 * Each toggle saves on its own. A page of tick-boxes with one Save button at
 * the bottom is how someone changes four things and loses three.
 */
export function NotificationSettings(): React.JSX.Element {
  const queryClient = useQueryClient()

  const settings = useQuery({
    queryKey: ['profile', 'notifications'],
    queryFn: () => api.get<NotificationSetting[]>('/profile/notifications'),
  })

  const toggle = useMutation({
    mutationFn: (input: { event: string; channel: string; enabled: boolean }) =>
      api.patch<NotificationSetting[]>('/profile/notifications', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'notifications'], data)
    },
    onError: (error) => {
      notify.error(error instanceof ApiClientError ? error.message : undefined)
      void queryClient.invalidateQueries({ queryKey: ['profile', 'notifications'] })
    },
  })

  return (
    <Card>
      <CardHeader
        title="Notifications"
        description="Everything still appears in the app. This is only about SMS, email and WhatsApp."
      />
      <CardBody>
        {settings.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-3">
            {(settings.data ?? []).map((setting) => (
              <div
                key={setting.event}
                className="flex flex-col gap-2 rounded-[--radius-lg] border border-border-default p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-content-primary">{setting.label}</span>
                  <span className="text-xs text-content-secondary">{setting.description}</span>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  {CHANNELS.map((channel) => (
                    <label key={channel.key} className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={setting.channels[channel.key] ?? true}
                        onChange={(event) =>
                          toggle.mutate({
                            event: setting.event,
                            channel: channel.key,
                            enabled: event.target.checked,
                          })
                        }
                      />
                      <span className="text-sm text-content-secondary">{channel.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
