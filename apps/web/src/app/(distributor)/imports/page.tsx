'use client'

import { copy } from '@medibridge/copy'
import type { BulkJobSummary } from '@medibridge/types'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  type Column,
  DataView,
  PageShell,
  ResponsiveTable,
  StatusBadge,
  type StatusTone,
  StickyActionBar,
} from '@medibridge/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Upload } from 'lucide-react'
import * as React from 'react'
import { BulkImportWizard } from '@/components/bulk/bulk-import-wizard'
import { ApiClientError, api } from '@/lib/api-client'

const c = copy.inventory.bulkUpload

/** Status wording and tone in one place — icon and word, never colour alone. */
const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Waiting to start', tone: 'neutral' },
  VALIDATING: { label: 'Checking your file', tone: 'info' },
  AWAITING_CONFIRMATION: { label: 'Ready — needs your confirmation', tone: 'warning' },
  IMPORTING: { label: 'Importing', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  COMPLETED: { label: 'Finished', tone: 'success' },
  COMPLETED_WITH_ERRORS: { label: 'Finished with some problems', tone: 'warning' },
  FAILED: { label: 'Could not be imported', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * A distributor's own bulk uploads.
 *
 * The same wizard the admin panel uses — it asks the server which operations
 * this user may run, so a seller is offered stock imports and updates while an
 * admin is offered the catalogue, with no branch in here deciding that.
 */
export default function DistributorImportsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bulk', 'jobs'],
    queryFn: () => api.get<{ items: BulkJobSummary[] }>('/bulk/jobs'),
    // A job runs in the background, so the list has to notice on its own.
    refetchInterval: 5_000,
  })

  const columns: ReadonlyArray<Column<BulkJobSummary>> = [
    {
      key: 'type',
      header: 'Upload',
      mobile: 'primary',
      render: (job) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-content-primary">
            {c.types[job.type as keyof typeof c.types]?.label ?? job.type}
          </span>
          <span className="text-sm text-content-muted">{job.fileName}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      render: (job) => (
        <StatusBadge
          label={STATUS[job.status]?.label ?? job.status}
          tone={STATUS[job.status]?.tone ?? 'neutral'}
        />
      ),
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      render: (job) => <span className="tabular-nums">{job.totalRows ?? '—'}</span>,
    },
    {
      key: 'created',
      header: 'Added',
      align: 'right',
      render: (job) => <span className="tabular-nums">{job.createCount}</span>,
    },
    {
      key: 'failed',
      header: 'Problems',
      align: 'right',
      render: (job) =>
        job.errorCount > 0 ? (
          <span className="tabular-nums font-medium text-danger-700">{job.errorCount}</span>
        ) : (
          <span className="text-content-muted">—</span>
        ),
    },
    {
      key: 'when',
      header: 'When',
      mobile: 'hidden',
      render: (job) => <span className="text-sm">{formatDate(job.queuedAt)}</span>,
    },
  ]

  return (
    <PageShell
      page={c.distributorPage}
      help={c.distributorHelp}
      primaryAction={{ label: c.page.title, onClick: () => setWizardOpen(true) }}
    >
      <Card>
        <CardHeader title={c.historyHeading} />
        <CardBody>
          <DataView
            data={data?.items}
            isLoading={isLoading}
            error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
            emptyState={c.historyEmpty}
            emptyIcon={<FileSpreadsheet />}
            onEmptyAction={() => setWizardOpen(true)}
            onRetry={() => void refetch()}
          >
            {(jobs) => (
              <ResponsiveTable
                columns={columns}
                rows={jobs}
                rowKey={(job) => job.id}
                caption={c.historyHeading}
              />
            )}
          </DataView>
        </CardBody>
      </Card>

      <StickyActionBar>
        <Button size="lg" fullWidth icon={<Upload />} onClick={() => setWizardOpen(true)}>
          {c.page.title}
        </Button>
      </StickyActionBar>

      <BulkImportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onFinished={() => {
          void queryClient.invalidateQueries({ queryKey: ['bulk', 'jobs'] })
          void queryClient.invalidateQueries({ queryKey: ['inventory'] })
        }}
      />
    </PageShell>
  )
}
