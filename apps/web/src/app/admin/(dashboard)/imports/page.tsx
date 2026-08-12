'use client'

import { copy } from '@medibridge/copy'
import type { BulkJobSummary } from '@medibridge/types'
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataView,
  PageShell,
  StickyActionBar,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Upload } from 'lucide-react'
import * as React from 'react'
import { BulkImportWizard } from '@/components/bulk/bulk-import-wizard'
import { ImportJobCard } from '@/components/bulk/import-job-card'
import { ImportSteps } from '@/components/bulk/import-steps'
import { ApiClientError, api } from '@/lib/api-client'

const c = copy.inventory.bulkUpload

/**
 * Bulk imports, for the platform team.
 *
 * A list of cards rather than a table. An import is not a row of figures you
 * scan across — it is one thing with a state, a set of actions and a report.
 * The table version kept its actions in a separate block that only rendered
 * for jobs still needing a decision, so a finished import offered no Remove
 * and no downloads at all.
 */
export default function ImportsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState<BulkJobSummary | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bulk', 'jobs'],
    queryFn: () => api.get<{ items: BulkJobSummary[] }>('/bulk/jobs'),
    // A job runs in the background, so the list has to notice on its own.
    refetchInterval: 5_000,
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['bulk'] })
  }

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/bulk/jobs/${id}/${action}`),
    onSuccess: refresh,
    onError: (actionError) =>
      notify.error(actionError instanceof ApiClientError ? actionError.message : undefined),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/bulk/jobs/${id}`),
    onSuccess: () => {
      refresh()
      notify.success(c.removed)
      setRemoving(null)
    },
    onError: (removeError) => {
      setRemoving(null)
      notify.error(removeError instanceof ApiClientError ? removeError.message : undefined)
    },
  })

  return (
    <PageShell
      page={{
        title: 'Bulk Imports',
        subtitle: 'Add or update many records at once using a spreadsheet.',
      }}
      help={{
        whatIsThis:
          'Import history. Every spreadsheet upload appears here with what it did, how far it got, the rows that failed and why.',
        topics: [
          {
            question: 'What happens after I upload a file?',
            answer:
              'We check every row first and show you exactly what would change. Nothing is saved until you confirm. Large files keep importing in the background, so you can close this page and come back.',
          },
          {
            question: 'Some rows failed. Did I lose the rest?',
            answer:
              'No. Good rows are always imported. Failed rows are skipped and listed under Details, and in a downloadable file with the same columns as the template plus a reason. Fix those rows and upload that file again.',
          },
          {
            question: 'My whole file failed with odd errors on the first rows.',
            answer:
              'The template ships with two grey guidance rows under the headings. Delete them before adding your data, or they are read as records and every one of them fails.',
          },
          {
            question: 'Can I stop an import halfway?',
            answer:
              'Yes. Pause keeps everything imported so far and remembers where it stopped, so Resume carries on from there instead of starting again. A failed import can be resumed the same way.',
          },
          {
            question: 'What does Remove do?',
            answer:
              'It clears the upload from this list along with its reports. It does not undo the import — anything already added or changed stays exactly as it is.',
          },
        ],
      }}
      primaryAction={{ label: 'New Import', onClick: () => setWizardOpen(true) }}
    >
      <ImportSteps />

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

      <h2 className="text-lg font-semibold text-content-primary">{c.historyHeading}</h2>

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
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <ImportJobCard
                key={job.id}
                job={job}
                busy={act.isPending}
                onAction={(action) => act.mutate({ id: job.id, action })}
                onRemove={() => setRemoving(job)}
              />
            ))}
          </div>
        )}
      </DataView>

      <StickyActionBar>
        <Button size="lg" fullWidth icon={<Upload />} onClick={() => setWizardOpen(true)}>
          New Import
        </Button>
      </StickyActionBar>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={c.confirmRemove.title}
        body={c.confirmRemove.body}
        confirmLabel={c.confirmRemove.confirmLabel}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />

      <BulkImportWizard open={wizardOpen} onOpenChange={setWizardOpen} onFinished={refresh} />
    </PageShell>
  )
}
