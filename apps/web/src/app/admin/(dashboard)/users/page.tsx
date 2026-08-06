'use client'

import { copy } from '@medibridge/copy'
import type { Paginated } from '@medibridge/types'
import {
  type Column,
  DataView,
  PageShell,
  ResponsiveTable,
  SelectField,
  StatusBadge,
  type StatusTone,
  TextField,
} from '@medibridge/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

interface UserRow {
  id: string
  fullName: string
  businessName: string | null
  role: string
  phone: string
  email: string
  city: string | null
  accountStatus: string
  licenseExpiresOn: string | null
  createdAt: string
}

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  SUSPENDED: 'neutral',
  REJECTED: 'danger',
}

export default function AdminUsersPage(): React.JSX.Element {
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [role, setRole] = React.useState('')
  const [status, setStatus] = React.useState('')

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const params = new URLSearchParams({ pageSize: '50' })
  if (debounced) params.set('q', debounced)
  if (role) params.set('role', role)
  if (status) params.set('status', status)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'users', debounced, role, status],
    queryFn: () => api.get<Paginated<UserRow>>(`/admin/users?${params.toString()}`),
    placeholderData: keepPreviousData,
  })

  const columns: ReadonlyArray<Column<UserRow>> = [
    {
      key: 'business',
      header: 'Business',
      mobile: 'primary',
      render: (u) => u.businessName ?? u.fullName,
    },
    { key: 'name', header: 'Contact', mobile: 'secondary', render: (u) => u.fullName },
    {
      key: 'role',
      header: 'Type',
      render: (u) => copy.admin.users.role[u.role as keyof typeof copy.admin.users.role] ?? u.role,
    },
    { key: 'phone', header: 'Mobile', render: (u) => u.phone },
    { key: 'city', header: 'City', mobile: 'hidden', render: (u) => u.city ?? '—' },
    {
      key: 'licence',
      header: 'Licence until',
      mobile: 'hidden',
      render: (u) => u.licenseExpiresOn ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <StatusBadge
          label={
            copy.admin.users.accountStatus[
              u.accountStatus as keyof typeof copy.admin.users.accountStatus
            ] ?? u.accountStatus
          }
          tone={STATUS_TONE[u.accountStatus] ?? 'neutral'}
        />
      ),
    },
  ]

  const filtered = Boolean(debounced || role || status)

  return (
    <PageShell
      page={copy.admin.users.page}
      help={{
        whatIsThis:
          'Everyone on the platform — retailers, distributors and MediBridge staff — with their account status and licence expiry.',
        topics: [
          {
            question: 'How do I approve a new account?',
            answer:
              'Approvals happen on the Approvals page, where their documents are shown alongside a checklist. This page is for looking someone up.',
          },
          {
            question: 'What does "Licence until" mean?',
            answer:
              'The expiry date on their drug licence. Once that date passes they can still sign in but cannot place orders, until they upload a renewed licence.',
          },
        ],
      }}
      toolbar={
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            field={{
              label: 'Search',
              helperText: 'Search by name, mobile number or email.',
              placeholder: 'e.g. Sharma',
            }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <SelectField
            field={{ label: 'Type', helperText: 'Show one kind of account only.' }}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            options={[
              { value: '', label: 'All types' },
              { value: 'RETAILER', label: 'Retailers' },
              { value: 'DISTRIBUTOR', label: 'Distributors' },
              { value: 'ADMIN', label: 'Admins' },
            ]}
          />
          <SelectField
            field={{ label: 'Status', helperText: 'Show accounts in one state only.' }}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'PENDING_VERIFICATION', label: 'Waiting for approval' },
              { value: 'SUSPENDED', label: 'Paused' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
          />
        </div>
      }
    >
      <DataView
        data={data?.items}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={copy.admin.users.empty}
        emptyIcon={<Users />}
        isFiltered={filtered}
        onClearFilters={() => {
          setSearch('')
          setRole('')
          setStatus('')
        }}
        onRetry={() => void refetch()}
      >
        {(items) => (
          <ResponsiveTable
            columns={columns}
            rows={items}
            rowKey={(u) => u.id}
            caption="Platform users"
          />
        )}
      </DataView>
    </PageShell>
  )
}
