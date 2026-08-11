'use client'

import { type WarehouseInput, warehouseSchema } from '@medibridge/types'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crosshair, Plus, Warehouse } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'

interface WarehouseSummary {
  id: string
  name: string
  isDefault: boolean
  isAcceptingOrders: boolean
  sameDayRadiusKm: number
  sameDayCutoffTime: string
  deliveryChargePaise: number
  freeDeliveryAbovePaise: number | null
  city: string
  state: string
  pincode: string
  line1: string
  stockItems: number
}

/**
 * Places stock ships from.
 *
 * The radius and cut-off are the two numbers that decide whether a retailer is
 * offered Same-Day, so each warehouse says in plain words what its settings
 * mean rather than leaving someone to work it out from two number fields.
 *
 * Closing a warehouse is refused while stock still ships from it. The message
 * offers the reversible alternative — switching off "accepting orders" — next
 * to the button that failed.
 */
export function WarehouseList(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [adding, setAdding] = React.useState(false)

  const warehouses = useQuery({
    queryKey: ['company', 'warehouses'],
    queryFn: () => api.get<WarehouseSummary[]>('/company/warehouses'),
  })

  const toggle = useMutation({
    mutationFn: (warehouse: WarehouseSummary) =>
      api.patch<WarehouseSummary[]>(`/company/warehouses/${warehouse.id}`, {
        name: warehouse.name,
        sameDayRadiusKm: warehouse.sameDayRadiusKm,
        sameDayCutoffTime: warehouse.sameDayCutoffTime,
        deliveryChargeRupees: warehouse.deliveryChargePaise / 100,
        freeDeliveryAboveRupees:
          warehouse.freeDeliveryAbovePaise != null
            ? warehouse.freeDeliveryAbovePaise / 100
            : undefined,
        isAcceptingOrders: !warehouse.isAcceptingOrders,
      }),
    onSuccess: (_data, warehouse) => {
      notify.success(
        warehouse.isAcceptingOrders
          ? `${warehouse.name} has stopped taking orders.`
          : `${warehouse.name} is taking orders again.`,
      )
      void queryClient.invalidateQueries({ queryKey: ['company', 'warehouses'] })
    },
    onError: (error) => notify.error(error instanceof ApiClientError ? error.message : undefined),
  })

  const close = useMutation({
    mutationFn: (id: string) => api.delete(`/company/warehouses/${id}`),
    onSuccess: () => {
      notify.success('Warehouse closed.')
      void queryClient.invalidateQueries({ queryKey: ['company', 'warehouses'] })
    },
    onError: (error) => {
      const message =
        error instanceof ApiClientError ? (error.fields?.[0]?.message ?? error.message) : undefined
      notify.error(message)
    },
  })

  return (
    <Card>
      <CardHeader
        title="Warehouses"
        description="Where you ship from, and how far you deliver Same-Day."
      />
      <CardBody>
        {warehouses.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (warehouses.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Warehouse />}
            copy={{
              title: 'No warehouses yet',
              body: 'Add the place you ship from so we can work out who you can deliver to.',
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {(warehouses.data ?? []).map((warehouse) => (
              <div
                key={warehouse.id}
                className="flex flex-col gap-3 rounded-(--radius-lg) border border-border-default p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-content-primary">
                    {warehouse.name}
                    {warehouse.isDefault ? (
                      <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                        Default
                      </span>
                    ) : null}
                    {warehouse.isAcceptingOrders ? null : (
                      <span className="ml-2 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-900 dark:bg-warning-900 dark:text-warning-100">
                        Paused
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-content-secondary">
                    {warehouse.line1}, {warehouse.city} {warehouse.pincode}
                  </span>
                  {/* What the numbers actually mean, not just the numbers. */}
                  <span className="text-xs text-content-secondary">
                    Same-Day within {warehouse.sameDayRadiusKm} km if ordered before{' '}
                    {warehouse.sameDayCutoffTime} · delivery ₹
                    {(warehouse.deliveryChargePaise / 100).toFixed(0)}
                    {warehouse.freeDeliveryAbovePaise
                      ? `, free above ₹${(warehouse.freeDeliveryAbovePaise / 100).toFixed(0)}`
                      : ''}{' '}
                    · {warehouse.stockItems} batches
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    loading={toggle.isPending && toggle.variables?.id === warehouse.id}
                    onClick={() => toggle.mutate(warehouse)}
                  >
                    {warehouse.isAcceptingOrders ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    loading={close.isPending && close.variables === warehouse.id}
                    onClick={() => close.mutate(warehouse.id)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          {adding ? (
            <AddWarehouseForm onDone={() => setAdding(false)} />
          ) : (
            <Button variant="secondary" icon={<Plus />} onClick={() => setAdding(true)}>
              Add a warehouse
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function AddWarehouseForm({ onDone }: { onDone: () => void }): React.JSX.Element {
  const queryClient = useQueryClient()

  const form = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      sameDayRadiusKm: 25,
      sameDayCutoffTime: '14:00',
      deliveryChargeRupees: 0,
      isAcceptingOrders: true,
      address: {
        label: 'Warehouse',
        line1: '',
        city: '',
        state: '',
        pincode: '',
        contactPhone: '',
        location: { latitude: 0, longitude: 0 },
      },
    },
    mode: 'onBlur',
  })

  const create = useMutation({
    mutationFn: (values: WarehouseInput) =>
      api.post<WarehouseSummary[]>('/company/warehouses', values),
    onSuccess: () => {
      notify.success('Warehouse added.')
      void queryClient.invalidateQueries({ queryKey: ['company', 'warehouses'] })
      onDone()
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      notify.error('Your browser cannot share a location. Please type the coordinates instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setValue('address.location.latitude', Number(position.coords.latitude.toFixed(6)))
        form.setValue('address.location.longitude', Number(position.coords.longitude.toFixed(6)))
        notify.success('Location captured.')
      },
      () => notify.error('We could not read your location. Please type the coordinates instead.'),
    )
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
      className="flex flex-col gap-5 rounded-(--radius-lg) border border-border-default p-4"
      noValidate
    >
      <TextField
        field={{ label: 'Warehouse Name', helperText: 'Something you will recognise, like "Nashik Depot".' }}
        required
        error={form.formState.errors.name?.message}
        {...form.register('name')}
      />

      <TextField
        field={{ label: 'Address', helperText: 'The full address stock ships from.' }}
        required
        error={form.formState.errors.address?.line1?.message}
        {...form.register('address.line1')}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          field={{ label: 'City', helperText: 'The city this warehouse is in.' }}
          required
          error={form.formState.errors.address?.city?.message}
          {...form.register('address.city')}
        />
        <TextField
          field={{ label: 'State', helperText: 'The state this warehouse is in.' }}
          required
          error={form.formState.errors.address?.state?.message}
          {...form.register('address.state')}
        />
        <TextField
          field={{ label: 'PIN Code', helperText: 'The 6-digit PIN code.' }}
          required
          inputMode="numeric"
          error={form.formState.errors.address?.pincode?.message}
          {...form.register('address.pincode')}
        />
        <TextField
          field={{ label: 'Contact Number', helperText: 'Who to call about a dispatch.' }}
          required
          type="tel"
          inputMode="numeric"
          error={form.formState.errors.address?.contactPhone?.message}
          {...form.register('address.contactPhone')}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-(--radius-lg) border border-border-default p-4">
        <legend className="px-1 text-sm font-medium text-content-primary">
          Warehouse Location
        </legend>
        <p className="text-sm text-content-secondary">
          These coordinates decide who you can deliver Same-Day to. Stand at the warehouse and tap
          the button, or type them in.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            field={{ label: 'Latitude', helperText: 'Between 8 and 37 for India.' }}
            required
            type="number"
            step="any"
            error={form.formState.errors.address?.location?.latitude?.message}
            {...form.register('address.location.latitude', { valueAsNumber: true })}
          />
          <TextField
            field={{ label: 'Longitude', helperText: 'Between 68 and 97 for India.' }}
            required
            type="number"
            step="any"
            error={form.formState.errors.address?.location?.longitude?.message}
            {...form.register('address.location.longitude', { valueAsNumber: true })}
          />
        </div>
        <Button type="button" variant="secondary" icon={<Crosshair />} onClick={useMyLocation}>
          Use my current location
        </Button>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          field={{
            label: 'Same-Day Radius (km)',
            helperText: 'Retailers this close can choose Same-Day Delivery.',
          }}
          required
          type="number"
          min={1}
          max={200}
          error={form.formState.errors.sameDayRadiusKm?.message}
          {...form.register('sameDayRadiusKm', { valueAsNumber: true })}
        />
        <TextField
          field={{
            label: 'Same-Day Cut-off',
            helperText: 'Orders after this time are delivered the next day.',
          }}
          required
          type="time"
          error={form.formState.errors.sameDayCutoffTime?.message}
          {...form.register('sameDayCutoffTime')}
        />
        <TextField
          field={{ label: 'Delivery Charge (₹)', helperText: 'Charged per order. Enter 0 for free.' }}
          required
          type="number"
          min={0}
          error={form.formState.errors.deliveryChargeRupees?.message}
          {...form.register('deliveryChargeRupees', { valueAsNumber: true })}
        />
        <TextField
          field={{
            label: 'Free Delivery Above (₹)',
            helperText: 'Leave blank to always charge.',
          }}
          type="number"
          min={0}
          error={form.formState.errors.freeDeliveryAboveRupees?.message}
          {...form.register('freeDeliveryAboveRupees', { valueAsNumber: true })}
        />
      </div>

      <Alert tone="info" title="You can change all of this later">
        Nothing here is permanent. Pause a warehouse any time to stop it taking new orders.
      </Alert>

      <div className="flex gap-3">
        <Button type="submit" loading={create.isPending}>
          Add Warehouse
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
