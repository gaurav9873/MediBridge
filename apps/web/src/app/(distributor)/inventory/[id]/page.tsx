'use client'

import { copy } from '@medibridge/copy'
import {
  type InventoryItemUpdateInput,
  formatPaise,
  inventoryItemUpdateSchema,
  paiseToRupees,
  rupeesToPaise,
} from '@medibridge/types'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CheckboxField,
  ConfirmDialog,
  FieldSection,
  FormSkeleton,
  PageShell,
  Skeleton,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ExpiryBadge, ItemIdentity, StockBadge } from '@/components/inventory-bits'
import { ApiClientError, applyFieldErrors } from '@/lib/api-client'
import { inventoryApi, inventoryKeys } from '@/lib/inventory'

const c = copy.inventory.form
const l = copy.inventory.list

/**
 * Editing one batch.
 *
 * Only what genuinely changes day to day is editable. The medicine, batch
 * number and expiry identify the physical goods on the shelf, and a batch
 * number that can be edited is a batch number a recall notice cannot be
 * trusted to find. Getting one wrong means removing the batch and listing it
 * again, which the screen says out loud rather than leaving people to discover.
 */
export default function EditInventoryItemPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [blocked, setBlocked] = React.useState<string | null>(null)

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: inventoryKeys.detail(id),
    queryFn: () => inventoryApi.get(id),
  })

  const form = useForm<InventoryItemUpdateInput>({
    resolver: zodResolver(inventoryItemUpdateSchema),
  })

  // Reset once the batch arrives, so the inputs start from what is stored
  // rather than from empty.
  React.useEffect(() => {
    if (!item) return
    form.reset({
      sellingPricePaise: item.sellingPricePaise,
      quantity: item.quantity,
      minOrderQuantity: item.minOrderQuantity,
      lowStockThreshold: item.lowStockThreshold,
      isActive: item.isActive,
    })
  }, [item, form])

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
  }

  const update = useMutation({
    mutationFn: (input: InventoryItemUpdateInput) => inventoryApi.update(id, input),
    onSuccess: () => {
      refresh()
      notify.success(c.success.updated)
      router.push('/inventory')
    },
    onError: (mutationError) => {
      if (!applyFieldErrors(mutationError, form.setError)) {
        notify.error(mutationError instanceof ApiClientError ? mutationError.message : undefined)
      }
    },
  })

  const remove = useMutation({
    mutationFn: () => inventoryApi.remove(id),
    onSuccess: () => {
      setConfirmingDelete(false)
      refresh()
      notify.success(c.success.deleted)
      router.push('/inventory')
    },
    onError: (mutationError) => {
      setConfirmingDelete(false)
      // The refusal names how many units are in carts, which is the only thing
      // that makes it actionable. Keep it on screen rather than in a toast.
      if (mutationError instanceof ApiClientError) {
        setBlocked(mutationError.fields?.[0]?.message ?? mutationError.message)
      } else {
        notify.error()
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <FormSkeleton />
      </div>
    )
  }

  if (error || !item) {
    return (
      <PageShell page={c.editPage} help={c.editHelp}>
        <Alert
          tone="danger"
          title={copy.common.feedback.somethingWentWrong}
          action={{ label: copy.common.actions.retry, onClick: () => void refetch() }}
        >
          {error instanceof ApiClientError
            ? error.message
            : copy.common.feedback.somethingWentWrongBody}
        </Alert>
      </PageShell>
    )
  }

  const errors = form.formState.errors

  return (
    <PageShell
      page={{ title: item.medicineName, subtitle: c.editPage.subtitle }}
      help={c.editHelp}
      secondaryAction={{ label: c.cancel, onClick: () => router.push('/inventory') }}
      banner={
        item.expiryStatus === 'expired' ? (
          <Alert tone="danger" title={copy.inventory.expiryAlerts.daysLeft(item.daysUntilExpiry)}>
            {copy.inventory.expiryAlerts.expiredBody}
          </Alert>
        ) : undefined
      }
    >
      {blocked && (
        <Alert tone="danger" title={copy.common.feedback.somethingWentWrong}>
          {blocked}
        </Alert>
      )}

      {/* What cannot be changed, shown rather than hidden — otherwise the only
          way to learn the batch number is fixed is to look for a field that
          does not exist. */}
      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <ItemIdentity item={item} />
            <div className="flex flex-wrap items-center gap-2">
              <StockBadge level={item.stockLevel} />
              <ExpiryBadge status={item.expiryStatus} days={item.daysUntilExpiry} showFresh />
            </div>
          </div>

          <dl className="flex flex-col gap-1.5 border-t border-border-default pt-3">
            {(
              [
                [l.columns.batch, item.batchNumber],
                [l.columns.expiry, item.expiryDate],
                [c.fields.warehouse.label, item.warehouseName],
                [l.columns.mrp, formatPaise(item.mrpPaise)],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-sm text-content-secondary">{label}</dt>
                <dd className="text-right text-sm font-medium text-content-primary">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-content-secondary">{c.identityLocked}</p>
        </CardBody>
      </Card>

      {item.reservedQuantity > 0 && (
        <Alert tone="info" title={l.reservedNote(item.reservedQuantity)}>
          {l.availableOf(item.availableQuantity, item.quantity)}
        </Alert>
      )}

      <form
        onSubmit={form.handleSubmit((values) => update.mutate(values))}
        noValidate
        className="flex flex-col gap-8"
      >
        <FieldSection title={c.sections.pricing}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.sellingPrice}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              leading="₹"
              defaultValue={paiseToRupees(item.sellingPricePaise)}
              error={errors.sellingPricePaise?.message}
              {...form.register('sellingPricePaise', {
                setValueAs: (value) => (value === '' ? undefined : rupeesToPaise(Number(value))),
              })}
            />
            <TextField
              field={c.fields.quantity}
              type="number"
              min="0"
              inputMode="numeric"
              error={errors.quantity?.message}
              {...form.register('quantity', { valueAsNumber: true })}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.minOrderQty}
              type="number"
              min="1"
              inputMode="numeric"
              error={errors.minOrderQuantity?.message}
              {...form.register('minOrderQuantity', { valueAsNumber: true })}
            />
            <TextField
              field={c.fields.lowStockAlert}
              type="number"
              min="0"
              inputMode="numeric"
              error={errors.lowStockThreshold?.message}
              {...form.register('lowStockThreshold', { valueAsNumber: true })}
            />
          </div>

          <CheckboxField
            field={c.fields.isActive}
            error={errors.isActive?.message}
            {...form.register('isActive')}
          />
        </FieldSection>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" size="lg" loading={update.isPending}>
            {c.submitEdit}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => router.push('/inventory')}
          >
            {c.cancel}
          </Button>
        </div>
      </form>

      <div className="border-t border-border-default pt-5">
        <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmingDelete(true)}>
          {c.deleteCta}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={c.confirmDelete.title}
        body={c.confirmDelete.body}
        confirmLabel={c.confirmDelete.confirmLabel}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        {item.reservedQuantity > 0 && (
          <Alert tone="warning" title={l.reservedNote(item.reservedQuantity)} />
        )}
      </ConfirmDialog>
    </PageShell>
  )
}
