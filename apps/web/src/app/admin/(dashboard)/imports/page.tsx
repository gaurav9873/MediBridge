'use client'

import type { BulkJobSummary } from '@medibridge/types'
import {
  Alert,
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
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Pause,
  Play,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'
import { BulkImportWizard } from '@/components/bulk/bulk-import-wizard'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'

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

const TYPE_LABELS: Record<string, string> = {
  MEDICINE_IMPORT: 'Medicine Import',
  INVENTORY_IMPORT: 'Inventory Import',
  INVENTORY_STOCK_UPDATE: 'Stock Update',
  INVENTORY_PRICE_UPDATE: 'Price Update',
  INVENTORY_EXPIRY_UPDATE: 'Expiry Update',
  INVENTORY_STATUS_UPDATE: 'Availability Update',
  USER_IMPORT: 'User Import',
}

/**
 * Bulk imports.
 *
 * The history list plus the upload wizard. Everything here is driven by the
 * generic /bulk endpoints, so the same page works for any import type — adding
 * a module adds an entry to TYPE_LABELS, nothing more.
 */
export default function ImportsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bulk', 'jobs'],
    queryFn: () => api.get<{ items: BulkJobSummary[] }>('/bulk/jobs'),
    // Poll while anything is moving, so progress updates without a refresh.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      const busy = items.some((job) => ['PENDING', 'VALIDATING', 'IMPORTING'].includes(job.status))
      return busy ? 2000 : false
    },
  })

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/bulk/jobs/${id}/${action}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bulk'] }),
    onError: (err) => notify.error(err instanceof ApiClientError ? err.message : undefined),
  })

  const columns: ReadonlyArray<Column<BulkJobSummary>> = [
    {
      key: 'file',
      header: 'File',
      mobile: 'primary',
      render: (job) => (
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 shrink-0 text-content-muted" aria-hidden />
          {job.fileName}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'What',
      mobile: 'secondary',
      render: (job) => TYPE_LABELS[job.type] ?? job.type,
    },
    {
      key: 'status',
      header: 'Status',
      render: (job) => (
        <div className="flex flex-col gap-1">
          <StatusBadge
            label={STATUS[job.status]?.label ?? job.status}
            tone={STATUS[job.status]?.tone ?? 'neutral'}
          />
          {job.progressPercent !== null && ['VALIDATING', 'IMPORTING'].includes(job.status) && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${job.progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-content-muted tabular-nums">
                {job.progressPercent}%
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      render: (job) => (
        <span className="tabular-nums">
          {job.totalRows === null ? '—' : job.totalRows.toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (job) => (
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
          {job.createCount > 0 && <span className="text-success-700">+{job.createCount} new</span>}
          {job.updateCount > 0 && <span className="text-info-700">{job.updateCount} updated</span>}
          {job.errorCount > 0 && <span className="text-danger-700">{job.errorCount} failed</span>}
          {job.createCount + job.updateCount + job.errorCount === 0 && (
            <span className="text-content-muted">—</span>
          )}
        </span>
      ),
    },
    {
      key: 'when',
      header: 'Started',
      mobile: 'hidden',
      render: (job) => new Date(job.queuedAt).toLocaleString('en-IN'),
    },
  ]

  return (
    <PageShell
      page={{
        title: 'Bulk Imports',
        subtitle: 'Add or update many records at once using a spreadsheet.',
      }}
      help={{
        whatIsThis:
          'Import history. Every spreadsheet upload appears here with what it did, how far it got, and a downloadable report of anything that failed.',
        topics: [
          {
            question: 'What happens after I upload a file?',
            answer:
              'We check every row first and show you exactly what would change. Nothing is saved until you confirm. Large files keep importing in the background, so you can close this page and come back.',
          },
          {
            question: 'Some rows failed. Did I lose the rest?',
            answer:
              'No. Good rows are always imported. Failed rows are skipped and listed in a downloadable file that has the same columns as the template, plus a reason. Fix those rows and upload that same file again.',
          },
          {
            question: 'Can I stop an import halfway?',
            answer:
              'Yes. Pause keeps everything imported so far and remembers where it stopped, so Resume carries on from there instead of starting again.',
          },
        ],
      }}
      primaryAction={{ label: 'New Import', onClick: () => setWizardOpen(true) }}
    >
      <Card>
        <CardHeader
          title="Start an import"
          description="Download the template, fill it in, and upload it. We check it before anything is saved."
          action={
            <Button icon={<Upload />} onClick={() => setWizardOpen(true)}>
              New Import
            </Button>
          }
        />
      </Card>

      <DataView
        data={data?.items}
        isLoading={isLoading}
        error={error instanceof ApiClientError ? error.message : (error?.message ?? null)}
        emptyState={{
          title: 'No imports yet',
          body: 'When you upload a spreadsheet, it will appear here with its progress and results.',
          action: { label: 'Start Your First Import' },
        }}
        emptyIcon={<FileSpreadsheet />}
        onEmptyAction={() => setWizardOpen(true)}
        onRetry={() => void refetch()}
      >
        {(jobs) => (
          <ResponsiveTable
            columns={columns}
            rows={jobs}
            rowKey={(job) => job.id}
            caption="Import history"
            mobileFooter={(job) => <JobActions job={job} act={act} />}
          />
        )}
      </DataView>

      {/* Actions live under the table on desktop too, so a row never needs a
          hidden overflow menu on a screen this narrow. */}
      {data?.items.some((job) => job.canConfirm || job.canPause || job.canResume) && (
        <div className="hidden flex-col gap-2 md:flex">
          {data.items
            .filter((job) => job.canConfirm || job.canPause || job.canResume)
            .map((job) => (
              <Card key={job.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-content-primary">{job.fileName}</span>
                    <span className="text-sm text-content-secondary">
                      {job.canConfirm
                        ? `${job.createCount} new, ${job.updateCount} updated, ${job.errorCount} problems — nothing saved yet`
                        : STATUS[job.status]?.label}
                    </span>
                  </div>
                  <JobActions job={job} act={act} />
                </CardBody>
              </Card>
            ))}
        </div>
      )}

      {data?.items.some((job) => job.status === 'FAILED') && (
        <Alert tone="danger" title="An import could not be read">
          {data.items.find((job) => job.status === 'FAILED')?.failureReason}
        </Alert>
      )}

      <BulkImportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onFinished={() => void queryClient.invalidateQueries({ queryKey: ['bulk'] })}
      />
    </PageShell>
  )
}

function JobActions({
  job,
  act,
}: {
  job: BulkJobSummary
  act: { mutate: (v: { id: string; action: string }) => void; isPending: boolean }
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {job.canConfirm && (
        <Button
          size="md"
          icon={<CheckCircle2 />}
          loading={act.isPending}
          onClick={() => act.mutate({ id: job.id, action: 'confirm' })}
        >
          Import Now
        </Button>
      )}
      {job.canPause && (
        <Button
          variant="secondary"
          size="md"
          icon={<Pause />}
          onClick={() => act.mutate({ id: job.id, action: 'pause' })}
        >
          Pause
        </Button>
      )}
      {job.canResume && (
        <Button
          size="md"
          icon={<Play />}
          onClick={() => act.mutate({ id: job.id, action: 'resume' })}
        >
          Resume
        </Button>
      )}
      {job.hasErrorFile && (
        <Button asChild variant="secondary" size="md">
          <a href={`${API}/bulk/jobs/${job.id}/errors.csv`} download>
            <Download className="size-5" aria-hidden /> Failed rows
          </a>
        </Button>
      )}
      {job.hasResultFile && (
        <Button asChild variant="ghost" size="md">
          <a href={`${API}/bulk/jobs/${job.id}/result.csv`} download>
            <Download className="size-5" aria-hidden /> Full report
          </a>
        </Button>
      )}
      {job.canCancel && !job.canConfirm && (
        <Button
          variant="ghost"
          size="md"
          icon={<X />}
          onClick={() => act.mutate({ id: job.id, action: 'cancel' })}
        >
          Cancel
        </Button>
      )}
      {job.status === 'FAILED' && <XCircle className="size-5 text-danger-600" aria-hidden />}
    </div>
  )
}
