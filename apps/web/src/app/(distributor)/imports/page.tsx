'use client'

import { copy } from '@medibridge/copy'
import type { BulkJobSummary } from '@medibridge/types'
import {
  Button,
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
 * A distributor's own bulk uploads.
 *
 * The same components the admin panel uses. What differs is only which
 * operations the server offers this user, which the wizard asks it for —
 * nothing in here decides that.
 */
export default function DistributorImportsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState<BulkJobSummary | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bulk', 'jobs'],
    queryFn: () => api.get<{ items: BulkJobSummary[] }>('/bulk/jobs'),
    refetchInterval: 5_000,
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['bulk'] })
    // New stock means the inventory screens are stale too.
    void queryClient.invalidateQueries({ queryKey: ['inventory'] })
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
      page={c.distributorPage}
      help={c.distributorHelp}
      primaryAction={{ label: c.page.title, onClick: () => setWizardOpen(true) }}
    >
      <ImportSteps />

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
          {c.page.title}
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
