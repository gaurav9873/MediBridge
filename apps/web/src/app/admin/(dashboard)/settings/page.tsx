'use client'

import { copy } from '@medibridge/copy'
import { Alert, type Column, DataView, PageShell, ResponsiveTable } from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface SettingRow {
  key: string
  value: unknown
  description: string
  updatedAt: string
}

/**
 * Platform rules.
 *
 * Read-only for now. These values already drive real behaviour — the delivery
 * radius, the token percentage, the stock hold — they just cannot be edited
 * from here yet.
 */
export default function AdminSettingsPage(): React.JSX.Element {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingRow[]>('/admin/settings'),
  })

  const columns: ReadonlyArray<Column<SettingRow>> = [
    {
      key: 'name',
      header: 'Setting',
      mobile: 'primary',
      render: (setting) => humanizeKey(setting.key),
    },
    {
      key: 'value',
      header: 'Value',
      render: (setting) => (
        <span className="font-medium text-content-primary tabular-nums">
          {formatValue(setting.value)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'What it does',
      mobile: 'secondary',
      render: (setting) => setting.description,
    },
  ]

  return (
    <PageShell
      page={{
        title: copy.admin.settings.page.title,
        subtitle: 'The rules that govern how the whole platform behaves.',
      }}
      help={copy.admin.settings.help}
    >
      <Alert tone="info" title="Editing these is not built yet.">
        Every value below is already in force. Changing them from this screen arrives in Phase 8 —
        until then they are changed in the database.
      </Alert>

      <DataView
        data={data}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={{
          title: 'No settings found',
          body: 'The platform settings have not been seeded. Run the seed script to create them.',
        }}
        emptyIcon={<Settings />}
        onRetry={() => void refetch()}
      >
        {(settings) => (
          <ResponsiveTable
            columns={columns}
            rows={settings}
            rowKey={(setting) => setting.key}
            caption="Platform settings"
          />
        )}
      </DataView>
    </PageShell>
  )
}

/** "delivery.defaultRadiusKm" -> "Delivery · Default radius km" */
function humanizeKey(key: string): string {
  return key
    .split('.')
    .map((part) =>
      part
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (char) => char.toUpperCase())
        .trim(),
    )
    .join(' · ')
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  return String(value)
}
