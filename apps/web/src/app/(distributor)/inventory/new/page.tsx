'use client'

import { copy } from '@medibridge/copy'
import {
  type InventoryItemInput,
  SaleUnit,
  inventoryItemSchema,
  rupeesToPaise,
} from '@medibridge/types'
import {
  Alert,
  Button,
  CheckboxField,
  FieldSection,
  PageShell,
  SelectField,
  Skeleton,
  StickyActionBar,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { MedicinePicker } from '@/components/medicine-picker'
import { ApiClientError, applyFieldErrors } from '@/lib/api-client'
import { inventoryApi, inventoryKeys } from '@/lib/inventory'
import type { MedicineSummary } from '@/lib/medicines'

const c = copy.inventory.form

type FormValues = z.input<typeof inventoryItemSchema>

const unitOptions = Object.values(SaleUnit).map((unit) => ({
  value: unit,
  label: unit.charAt(0) + unit.slice(1).toLowerCase(),
}))

/**
 * Listing a batch of stock.
 *
 * Money is typed in rupees and stored in paise. The conversion happens in
 * `setValueAs` so the form's own values are already the shape the shared Zod
 * schema validates — the alternative, a second form-only schema, is how the
 * browser and the server end up disagreeing about what is valid.
 */
export default function NewInventoryItemPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [medicine, setMedicine] = React.useState<MedicineSummary | null>(null)

  const warehouses = useQuery({
    queryKey: inventoryKeys.warehouses,
    queryFn: () => inventoryApi.warehouses(),
  })

  const form = useForm<FormValues, unknown, InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: {
      medicineId: '',
      warehouseId: '',
      batchNumber: '',
      quantity: 0,
      minOrderQuantity: 1,
      lowStockThreshold: 10,
      unit: SaleUnit.STRIP,
      isActive: true,
    },
  })

  // The picker sits outside the form's inputs, so its choice is pushed in.
  React.useEffect(() => {
    form.setValue('medicineId', medicine?.id ?? '', { shouldValidate: form.formState.isSubmitted })
  }, [medicine, form])

  // One warehouse is the common case, and asking someone to choose from a list
  // of one is a question with no information in it.
  React.useEffect(() => {
    const only = warehouses.data?.length === 1 ? warehouses.data[0] : undefined
    if (only) form.setValue('warehouseId', only.id)
  }, [warehouses.data, form])

  const create = useMutation({
    mutationFn: (input: InventoryItemInput) => inventoryApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
      notify.success(c.success.created)
      router.push('/inventory')
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  const errors = form.formState.errors

  if (warehouses.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Stock is physical, so it has to live somewhere. Without a warehouse there
  // is nothing to attach it to, and saying so beats an empty dropdown.
  if ((warehouses.data ?? []).length === 0) {
    return (
      <PageShell page={c.createPage} help={c.createHelp}>
        <Alert
          tone="warning"
          title={c.noWarehouse.title}
          action={{
            label: c.noWarehouse.cta,
            onClick: () => router.push('/account/company'),
          }}
        >
          {c.noWarehouse.body}
        </Alert>
      </PageShell>
    )
  }

  return (
    <PageShell
      page={c.createPage}
      help={c.createHelp}
      secondaryAction={{ label: c.cancel, onClick: () => router.push('/inventory') }}
    >
      <form
        id="inventory-form"
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
        noValidate
        className="flex flex-col gap-8 pb-24 sm:pb-0"
      >
        <FieldSection title={c.sections.medicine}>
          <MedicinePicker
            value={medicine}
            onChange={setMedicine}
            error={errors.medicineId?.message}
          />

          <SelectField
            field={c.fields.warehouse}
            options={(warehouses.data ?? []).map((warehouse) => ({
              value: warehouse.id,
              label: warehouse.name,
            }))}
            placeholder={c.fields.warehouse.label}
            error={errors.warehouseId?.message}
            required
            {...form.register('warehouseId')}
          />
        </FieldSection>

        <FieldSection title={c.sections.batch}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.batchNumber}
              error={errors.batchNumber?.message}
              required
              autoComplete="off"
              {...form.register('batchNumber')}
            />
            <TextField
              field={c.fields.expiryDate}
              type="date"
              error={errors.expiryDate?.message}
              required
              {...form.register('expiryDate')}
            />
          </div>
        </FieldSection>

        <FieldSection title={c.sections.pricing}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.mrp}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              leading="₹"
              error={errors.mrpPaise?.message}
              required
              {...form.register('mrpPaise', {
                setValueAs: (value) => (value === '' ? undefined : rupeesToPaise(Number(value))),
              })}
            />
            <TextField
              field={c.fields.sellingPrice}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              leading="₹"
              error={errors.sellingPricePaise?.message}
              required
              {...form.register('sellingPricePaise', {
                setValueAs: (value) => (value === '' ? undefined : rupeesToPaise(Number(value))),
              })}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={c.fields.quantity}
              type="number"
              min="0"
              inputMode="numeric"
              error={errors.quantity?.message}
              required
              {...form.register('quantity', { valueAsNumber: true })}
            />
            <SelectField
              field={c.fields.unit}
              options={unitOptions}
              error={errors.unit?.message}
              required
              {...form.register('unit')}
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

        <div className="hidden gap-3 sm:flex">
          <Button type="submit" size="lg" loading={create.isPending}>
            {c.submitCreate}
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

      <StickyActionBar>
        <Button type="submit" form="inventory-form" size="lg" fullWidth loading={create.isPending}>
          {c.submitCreate}
        </Button>
      </StickyActionBar>
    </PageShell>
  )
}
