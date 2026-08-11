'use client'

import type { BulkJobSummary, RowIssue } from '@medibridge/types'
import { Alert, Button, notify } from '@medibridge/ui'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1'

/**
 * The one import wizard, reused by every module.
 *
 * `type` selects the handler on the server; nothing in here knows what a
 * medicine or a batch is. Adding a bulk operation means adding it to the
 * options list below, not writing another wizard.
 *
 * Steps: choose → upload → we check it → you confirm → done.
 */

interface ImportType {
  value: string
  label: string
  description: string
}

const IMPORT_TYPES: ImportType[] = [
  {
    value: 'MEDICINE_IMPORT',
    label: 'Medicines',
    description: 'Add new medicines to the shared catalogue, or update existing ones.',
  },
  {
    value: 'INVENTORY_STOCK_UPDATE',
    label: 'Stock Update',
    description:
      'Update quantity, price, MRP or expiry for batches you already stock. Nothing is deleted.',
  },
]

type Step = 'choose' | 'upload' | 'checking' | 'review' | 'importing' | 'done'

export function BulkImportWizard({
  open,
  onOpenChange,
  onFinished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFinished?: () => void
}): React.JSX.Element {
  // Only the pre-upload steps are local; the rest are derived from the job.
  const [localStep, setLocalStep] = React.useState<'choose' | 'upload'>('choose')
  const [type, setType] = React.useState<string>(IMPORT_TYPES[0]?.value ?? '')
  const [file, setFile] = React.useState<File | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  // Poll the job while it is working. Polling rather than a socket: for a job
  // measured in seconds-to-minutes it is indistinguishable, and it survives
  // reconnects and network switches with no extra code.
  const { data: job } = useQuery({
    queryKey: ['bulk', 'job', jobId],
    queryFn: () => api.get<BulkJobSummary>(`/bulk/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && ['PENDING', 'VALIDATING', 'IMPORTING'].includes(status) ? 1000 : false
    },
  })

  const { data: preview } = useQuery({
    queryKey: ['bulk', 'preview', jobId],
    queryFn: () => api.get<{ issues: RowIssue[] }>(`/bulk/jobs/${jobId}/preview`),
    enabled: Boolean(jobId) && job?.status === 'AWAITING_CONFIRMATION',
  })

  /*
   * The step is DERIVED from the job, not stored.
   *
   * Mirroring server status into local state via an effect means two sources
   * of truth that can disagree — and React 19 flags the setState-in-effect as
   * a cascading render. Before a job exists the local step applies; once one
   * does, its status decides what is on screen, so a refresh or a slow network
   * can never leave the wizard out of step with the server.
   */
  const step: Step = !jobId
    ? localStep
    : job === undefined
      ? 'checking'
      : job.status === 'AWAITING_CONFIRMATION' || job.status === 'FAILED'
        ? 'review'
        : job.status === 'IMPORTING'
          ? 'importing'
          : job.status.startsWith('COMPLETED')
            ? 'done'
            : 'checking'

  function reset(): void {
    setLocalStep('choose')
    setFile(null)
    setJobId(null)
    setUploadError(null)
    setUploading(false)
  }

  async function handleUpload(): Promise<void> {
    if (!file) return
    setUploading(true)
    setUploadError(null)

    try {
      // FormData, so this cannot go through the JSON api client.
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(`${API}/bulk/${type}/upload`, {
        method: 'POST',
        credentials: 'include',
        body,
      })
      const payload = await response.json()

      if (!response.ok || payload.success === false) {
        setUploadError(
          payload?.error?.fields?.[0]?.message ??
            payload?.error?.message ??
            'We could not upload this file. Please try again.',
        )
        return
      }

      setJobId(payload.data.id)
    } catch {
      setUploadError('We could not reach the server. Check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  async function confirmImport(): Promise<void> {
    if (!jobId) return
    try {
      await api.post(`/bulk/jobs/${jobId}/confirm`)
      // The poll picks the new status up; no local step to set.
    } catch (error) {
      notify.error(error instanceof ApiClientError ? error.message : undefined)
    }
  }

  const selected = IMPORT_TYPES.find((option) => option.value === type)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          onFinished?.()
          reset()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-(--radius-xl) bg-surface shadow-overlay sm:inset-1/2 sm:bottom-auto sm:h-auto sm:w-[38rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-(--radius-xl)">
          <div className="flex items-start justify-between gap-4 border-b border-border-default p-5">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-xl font-semibold text-content-primary">
                Import from a spreadsheet
              </Dialog.Title>
              <Dialog.Description className="text-sm text-content-secondary">
                We check every row and show you what will change before anything is saved.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <div className="pb-safe flex-1 overflow-y-auto p-5 sm:pb-5">
            {/* ---------- 1. what are you importing ---------- */}
            {step === 'choose' && (
              <div className="flex flex-col gap-4">
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium text-content-primary">
                    What do you want to import?
                  </legend>
                  {IMPORT_TYPES.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer gap-3 rounded-(--radius-md) border p-3 ${
                        type === option.value
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-border-strong hover:bg-surface-hover'
                      }`}
                    >
                      <input
                        type="radio"
                        name="import-type"
                        value={option.value}
                        checked={type === option.value}
                        onChange={(event) => setType(event.target.value)}
                        className="mt-1 size-5 shrink-0 accent-brand-600"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-base font-medium text-content-primary">
                          {option.label}
                        </span>
                        <span className="text-sm text-content-secondary">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <Button asChild variant="secondary" size="lg" fullWidth>
                  <a href={`${API}/bulk/templates/${type}`} download>
                    <Download className="size-5" aria-hidden /> Download the {selected?.label}{' '}
                    template
                  </a>
                </Button>
                <p className="text-sm text-content-secondary">
                  The template has the right columns, an example row, and a note explaining each
                  one. Fill it in, then upload it on the next step.
                </p>

                <Button size="lg" fullWidth onClick={() => setLocalStep('upload')}>
                  Next
                </Button>
              </div>
            )}

            {/* ---------- 2. upload ---------- */}
            {step === 'upload' && (
              <div className="flex flex-col gap-4">
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-(--radius-lg) border-2 border-dashed p-8 text-center ${
                    file ? 'border-brand-600 bg-brand-50' : 'border-border-strong'
                  }`}
                >
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <FileSpreadsheet className="size-8 text-content-muted" aria-hidden />
                  <span className="text-base font-medium text-content-primary">
                    {file ? file.name : 'Choose a file'}
                  </span>
                  <span className="text-sm text-content-secondary">
                    Excel or CSV, up to 25 MB and 50,000 rows.
                  </span>
                </label>

                {uploadError && (
                  <Alert tone="danger" title="We could not upload that file">
                    {uploadError}
                  </Alert>
                )}

                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button
                    size="lg"
                    fullWidth
                    disabled={!file}
                    loading={uploading}
                    onClick={() => void handleUpload()}
                    icon={<Upload />}
                  >
                    Upload and check
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={() => setLocalStep('choose')}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}

            {/* ---------- 3. checking ---------- */}
            {step === 'checking' && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden />
                <p className="text-base font-medium text-content-primary">
                  Checking your file
                  {job?.totalRows ? ` — ${job.processedRows} of ${job.totalRows} rows` : '…'}
                </p>
                <p className="max-w-sm text-sm text-content-secondary">
                  Nothing has been saved yet. You can close this window — the check carries on and
                  you will find it in the list.
                </p>
              </div>
            )}

            {/* ---------- 4. review ---------- */}
            {step === 'review' && job && (
              <div className="flex flex-col gap-4">
                {job.status === 'FAILED' ? (
                  <Alert tone="danger" title="This file could not be imported">
                    {job.failureReason}
                  </Alert>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <Summary label="New" value={job.createCount} tone="success" />
                      <Summary label="Updated" value={job.updateCount} tone="info" />
                      <Summary label="Problems" value={job.errorCount} tone="danger" />
                    </div>

                    <p className="text-sm text-content-secondary">
                      {job.errorCount > 0
                        ? 'Rows with problems will be skipped. Everything else will be imported.'
                        : 'Every row looks good.'}
                    </p>

                    {preview?.issues && preview.issues.length > 0 && (
                      <div className="flex flex-col gap-2 rounded-(--radius-md) border border-border-default bg-surface-sunken p-3">
                        <h3 className="text-sm font-semibold text-content-primary">
                          First few problems
                        </h3>
                        <ul className="flex flex-col gap-1.5">
                          {preview.issues.slice(0, 8).map((issue) => (
                            <li key={issue.rowNumber} className="text-sm text-content-secondary">
                              <span className="font-medium text-content-primary">
                                Row {issue.rowNumber}
                              </span>{' '}
                              — {issue.message}
                            </li>
                          ))}
                        </ul>
                        {job.hasErrorFile && (
                          <Button asChild variant="secondary" size="md" className="mt-1 self-start">
                            <a href={`${API}/bulk/jobs/${job.id}/errors.csv`} download>
                              <Download className="size-5" aria-hidden /> Download all problem rows
                            </a>
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row-reverse">
                      <Button size="lg" fullWidth onClick={() => void confirmImport()}>
                        Import {(job.createCount + job.updateCount).toLocaleString('en-IN')} rows
                      </Button>
                      <Dialog.Close asChild>
                        <Button variant="secondary" size="lg" fullWidth>
                          Not now
                        </Button>
                      </Dialog.Close>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ---------- 5. importing ---------- */}
            {step === 'importing' && job && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden />
                <p className="text-base font-medium text-content-primary">
                  Importing — {job.processedRows.toLocaleString('en-IN')} of{' '}
                  {(job.totalRows ?? 0).toLocaleString('en-IN')} rows
                </p>
                <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${job.progressPercent ?? 0}%` }}
                  />
                </div>
                <p className="max-w-sm text-sm text-content-secondary">
                  You can close this window. The import keeps running and we will tell you when it
                  is done.
                </p>
              </div>
            )}

            {/* ---------- 6. done ---------- */}
            {step === 'done' && job && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <CheckCircle2 className="size-10 text-success-600" aria-hidden />
                  <p className="text-lg font-semibold text-content-primary">
                    {job.errorCount > 0 ? 'Import finished with some problems' : 'Import finished'}
                  </p>
                  <p className="text-base text-content-secondary">
                    {(job.createCount + job.updateCount).toLocaleString('en-IN')} records imported.
                    {job.errorCount > 0 && ` ${job.errorCount} rows were skipped.`}
                  </p>
                </div>

                {job.errorCount > 0 && job.hasErrorFile && (
                  <Alert tone="warning" title="Fix and re-upload">
                    The problem file has the same columns as the template, plus a reason for each
                    row. Correct those rows and upload that same file again.
                  </Alert>
                )}

                <div className="flex flex-col gap-2">
                  {job.hasErrorFile && (
                    <Button asChild variant="secondary" size="lg" fullWidth>
                      <a href={`${API}/bulk/jobs/${job.id}/errors.csv`} download>
                        <Download className="size-5" aria-hidden /> Download problem rows
                      </a>
                    </Button>
                  )}
                  {job.hasResultFile && (
                    <Button asChild variant="ghost" size="lg" fullWidth>
                      <a href={`${API}/bulk/jobs/${job.id}/result.csv`} download>
                        <Download className="size-5" aria-hidden /> Download full report
                      </a>
                    </Button>
                  )}
                  <Button size="lg" fullWidth onClick={reset}>
                    Import another file
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'info' | 'danger'
}): React.JSX.Element {
  const toneClass =
    tone === 'success'
      ? 'border-success-100 bg-success-50 text-success-900'
      : tone === 'info'
        ? 'border-info-100 bg-info-50 text-info-900'
        : 'border-danger-100 bg-danger-50 text-danger-900'

  return (
    <div className={`flex flex-col gap-0.5 rounded-(--radius-md) border p-3 ${toneClass}`}>
      <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString('en-IN')}</span>
      <span className="text-sm">{label}</span>
    </div>
  )
}
