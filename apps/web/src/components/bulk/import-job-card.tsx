'use client'

import { copy } from '@medibridge/copy'
import type { BulkJobPreview, BulkJobSummary } from '@medibridge/types'
import { Alert, Button, StatusBadge, type StatusTone, cn } from '@medibridge/ui'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Pause,
  Play,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { api } from '@/lib/api-client'

const c = copy.inventory.bulkUpload
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1'

/** Status wording and tone in one place — icon and word, never colour alone. */
export const IMPORT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
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

/**
 * The result file records a row by its natural key — lowercase, pipe-joined,
 * because that is what identifies a record rather than what reads well. Split
 * it back out so a person sees "kofnil dx · kofnil · 15mg" instead of a key.
 */
function readableRecord(key: string): string {
  return key
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
}

interface ImportRow {
  rowNumber: number
  record: string
  result: string
  detail: string
}

/**
 * One import, with everything about it in one place.
 *
 * The old screen put the actions in a separate block that only rendered for
 * jobs still needing a decision, so a finished import showed no Remove and no
 * downloads at all — you could see that 41 medicines had been added and do
 * nothing about it. Actions now belong to the job they act on.
 *
 * The detail panel is collapsed by default: most of the time the counts are
 * the whole answer, and the rows behind them are only wanted when something
 * looks wrong.
 */
export function ImportJobCard({
  job,
  onAction,
  onRemove,
  busy,
}: {
  job: BulkJobSummary
  onAction: (action: string) => void
  onRemove: () => void
  busy?: boolean
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const status = IMPORT_STATUS[job.status] ?? { label: job.status, tone: 'neutral' as StatusTone }

  // Only fetched once the panel is opened — a list of twenty jobs must not
  // make twenty extra requests to show counts nobody expanded.
  const preview = useQuery({
    queryKey: ['bulk', 'preview', job.id],
    queryFn: () => api.get<BulkJobPreview>(`/bulk/jobs/${job.id}/preview`),
    enabled: open && job.errorCount > 0,
  })

  const imported = useQuery({
    queryKey: ['bulk', 'rows', job.id],
    queryFn: () => api.get<{ rows: ImportRow[]; truncated: boolean }>(`/bulk/jobs/${job.id}/rows`),
    enabled: open && job.hasResultFile,
  })

  const counts = [
    job.createCount > 0 && { text: c.counts.created(job.createCount), tone: 'text-success-700' },
    job.updateCount > 0 && { text: c.counts.updated(job.updateCount), tone: 'text-info-700' },
    job.skipCount > 0 && { text: c.counts.skipped(job.skipCount), tone: 'text-content-secondary' },
    job.errorCount > 0 && { text: c.counts.failed(job.errorCount), tone: 'text-danger-700' },
  ].filter(Boolean) as Array<{ text: string; tone: string }>

  return (
    <div className="flex flex-col rounded-(--radius-lg) border border-border-default bg-surface">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-semibold break-all text-content-primary">{job.fileName}</span>
            <span className="text-sm text-content-secondary">
              {c.types[job.type as keyof typeof c.types]?.label ?? job.type} ·{' '}
              {new Date(job.queuedAt).toLocaleString('en-IN')}
            </span>
          </div>
          <StatusBadge label={status.label} tone={status.tone} />
        </div>

        {/* Progress, while it is actually moving. */}
        {job.progressPercent !== null && job.progressPercent < 100 && job.canPause && (
          <div className="flex flex-col gap-1">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-valuenow={job.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-brand-600 transition-[width]"
                style={{ width: `${job.progressPercent}%` }}
              />
            </div>
            <span className="text-sm text-content-secondary">
              {job.processedRows.toLocaleString('en-IN')} of{' '}
              {(job.totalRows ?? 0).toLocaleString('en-IN')} rows
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          {counts.length > 0 ? (
            counts.map((count) => (
              <span key={count.text} className={count.tone}>
                {count.text}
              </span>
            ))
          ) : (
            <span className="text-content-muted">{c.counts.nothing}</span>
          )}
        </div>

        {job.failureReason && (
          <Alert tone="danger" title={status.label}>
            {job.failureReason}
          </Alert>
        )}

        {job.canConfirm && (
          <Alert tone="warning" title="Nothing has been saved yet">
            {c.counts.created(job.createCount)}, {c.counts.updated(job.updateCount)},{' '}
            {c.counts.failed(job.errorCount)}. Confirm to write the good rows.
          </Alert>
        )}

        {/* Every action belongs to the job, whatever state it is in. */}
        <div className="flex flex-wrap gap-2">
          {job.canConfirm && (
            <Button size="md" icon={<CheckCircle2 />} loading={busy} onClick={() => onAction('confirm')}>
              {c.confirmImport}
            </Button>
          )}
          {job.canPause && (
            <Button variant="secondary" size="md" icon={<Pause />} onClick={() => onAction('pause')}>
              Pause
            </Button>
          )}
          {job.canResume && (
            <Button variant="secondary" size="md" icon={<Play />} onClick={() => onAction('resume')}>
              {job.status === 'FAILED' ? c.importTheRest : c.resume}
            </Button>
          )}
          {job.hasErrorFile && (
            <Button asChild variant="secondary" size="md">
              <a href={`${API}/bulk/jobs/${job.id}/errors.csv`} download>
                <Download className="size-5" aria-hidden /> {c.failedRows}
              </a>
            </Button>
          )}
          {job.hasResultFile && (
            <Button asChild variant="ghost" size="md">
              <a href={`${API}/bulk/jobs/${job.id}/result.csv`} download>
                <Download className="size-5" aria-hidden /> {c.fullReport}
              </a>
            </Button>
          )}
          {job.canCancel && !job.canConfirm && (
            <Button variant="ghost" size="md" icon={<X />} onClick={() => onAction('cancel')}>
              Cancel
            </Button>
          )}
          {job.canRemove && (
            <Button
              variant="ghost"
              size="md"
              icon={<Trash2 />}
              aria-label={`${c.remove} ${job.fileName}`}
              onClick={onRemove}
            >
              {c.remove}
            </Button>
          )}

          <Button
            variant="ghost"
            size="md"
            className="ml-auto"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? c.detail.hide : c.detail.show}
            <ChevronDown
              className={cn('size-5 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </Button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-5 border-t border-border-default p-4">
          {job.errorCount > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-content-primary">{c.detail.problems}</h3>
              <p className="text-sm text-content-secondary">{c.detail.problemsNote}</p>
              <ul className="flex flex-col gap-2">
                {(preview.data?.issues ?? []).map((issue, index) => (
                  <li
                    key={`${issue.rowNumber}-${index}`}
                    className="flex flex-col gap-0.5 rounded-(--radius-md) border border-danger-100 bg-danger-50 p-3"
                  >
                    <span className="text-sm font-medium text-danger-900">
                      {c.detail.rowNumber(issue.rowNumber)}
                      {issue.column ? ` · ${issue.column}` : ''}
                    </span>
                    <span className="text-sm text-danger-900/80">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-content-primary">{c.detail.imported}</h3>
            {imported.data && imported.data.rows.length > 0 ? (
              <>
                <p className="text-sm text-content-secondary">{c.detail.importedNote}</p>
                <ul className="flex flex-col divide-y divide-border-default rounded-(--radius-md) border border-border-default">
                  {imported.data.rows.slice(0, 50).map((row) => (
                    <li
                      key={row.rowNumber}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-sm text-content-primary">{readableRecord(row.record)}</span>
                      <span className="text-sm text-content-secondary">
                        {row.result}
                        {row.detail ? ` · ${row.detail}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {imported.data.truncated && (
                  <p className="text-sm text-content-muted">{c.detail.truncated}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-content-secondary">
                {job.hasResultFile ? c.detail.noneImported : c.detail.nothingYet}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
