'use client'

import { type AddressInput, addressSchema } from '@medibridge/types'
import {
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
import { Crosshair, MapPin, Plus } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'

interface AddressSummary {
  id: string
  label: string
  line1: string
  city: string
  state: string
  pincode: string
  contactPhone: string
  latitude: number
  longitude: number
  isDefault: boolean
}

/**
 * Where deliveries go.
 *
 * The coordinates decide which distributors can reach you Same-Day, so each
 * address shows them rather than hiding them behind a map that is not built
 * yet — a pin in the wrong place gives the wrong delivery options, not an
 * error, which is the hardest kind of mistake to notice.
 */
export function AddressBook(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [adding, setAdding] = React.useState(false)

  const addresses = useQuery({
    queryKey: ['profile', 'addresses'],
    queryFn: () => api.get<AddressSummary[]>('/profile/addresses'),
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['profile', 'addresses'] })

  const setDefault = useMutation({
    mutationFn: (id: string) => api.post(`/profile/addresses/${id}/default`, {}),
    onSuccess: () => {
      notify.success('Default address updated.')
      refresh()
    },
    onError: (error) => notify.error(error instanceof ApiClientError ? error.message : undefined),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/addresses/${id}`),
    onSuccess: () => {
      notify.success('Address removed.')
      refresh()
    },
    onError: (error) => {
      const message =
        error instanceof ApiClientError ? (error.fields?.[0]?.message ?? error.message) : undefined
      notify.error(message)
    },
  })

  return (
    <Card>
      <CardHeader title="Delivery addresses" description="Where we send your medicines." />
      <CardBody>
        {addresses.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (addresses.data ?? []).length === 0 ? (
          <EmptyState
            icon={<MapPin />}
            copy={{
              title: 'No address yet',
              body: 'Add your shop address so we can work out who can deliver to you.',
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {(addresses.data ?? []).map((address) => (
              <div
                key={address.id}
                className="flex flex-col gap-3 rounded-[--radius-lg] border border-border-default p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-content-primary">
                    {address.label}
                    {address.isDefault ? (
                      <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-content-secondary">
                    {address.line1}, {address.city}, {address.state} {address.pincode}
                  </span>
                  <span className="text-xs text-content-secondary">
                    Delivery measured from {address.latitude.toFixed(4)},{' '}
                    {address.longitude.toFixed(4)} · call {address.contactPhone}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  {address.isDefault ? null : (
                    <Button
                      variant="secondary"
                      size="md"
                      loading={setDefault.isPending && setDefault.variables === address.id}
                      onClick={() => setDefault.mutate(address.id)}
                    >
                      Use by default
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="md"
                    loading={remove.isPending && remove.variables === address.id}
                    onClick={() => remove.mutate(address.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          {adding ? (
            <AddAddressForm
              onDone={() => {
                setAdding(false)
                refresh()
              }}
            />
          ) : (
            <Button variant="secondary" icon={<Plus />} onClick={() => setAdding(true)}>
              Add an address
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function AddAddressForm({ onDone }: { onDone: () => void }): React.JSX.Element {
  const form = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: 'Shop',
      line1: '',
      city: '',
      state: '',
      pincode: '',
      contactPhone: '',
      location: { latitude: 0, longitude: 0 },
    },
    mode: 'onBlur',
  })

  const create = useMutation({
    mutationFn: (values: AddressInput) => api.post('/profile/addresses', values),
    onSuccess: () => {
      notify.success('Address added.')
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
        form.setValue('location.latitude', Number(position.coords.latitude.toFixed(6)))
        form.setValue('location.longitude', Number(position.coords.longitude.toFixed(6)))
        notify.success('Location captured.')
      },
      () => notify.error('We could not read your location. Please type the coordinates instead.'),
    )
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
      className="flex flex-col gap-5 rounded-[--radius-lg] border border-border-default p-4"
      noValidate
    >
      <TextField
        field={{ label: 'Name for this address', helperText: 'Something like "Main Shop".' }}
        required
        error={form.formState.errors.label?.message}
        {...form.register('label')}
      />
      <TextField
        field={{ label: 'Address', helperText: 'The full address deliveries should come to.' }}
        required
        error={form.formState.errors.line1?.message}
        {...form.register('line1')}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          field={{ label: 'City', helperText: 'The city.' }}
          required
          error={form.formState.errors.city?.message}
          {...form.register('city')}
        />
        <TextField
          field={{ label: 'State', helperText: 'The state.' }}
          required
          error={form.formState.errors.state?.message}
          {...form.register('state')}
        />
        <TextField
          field={{ label: 'PIN Code', helperText: 'The 6-digit PIN code.' }}
          required
          inputMode="numeric"
          error={form.formState.errors.pincode?.message}
          {...form.register('pincode')}
        />
        <TextField
          field={{ label: 'Contact Number', helperText: 'Who the delivery person should call.' }}
          required
          type="tel"
          inputMode="numeric"
          error={form.formState.errors.contactPhone?.message}
          {...form.register('contactPhone')}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-[--radius-lg] border border-border-default p-4">
        <legend className="px-1 text-sm font-medium text-content-primary">Shop location</legend>
        <p className="text-sm text-content-secondary">
          This decides which distributors can deliver to you Same-Day. Stand at the shop and tap the
          button, or type the coordinates.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            field={{ label: 'Latitude', helperText: 'Between 8 and 37 for India.' }}
            required
            type="number"
            step="any"
            error={form.formState.errors.location?.latitude?.message}
            {...form.register('location.latitude', { valueAsNumber: true })}
          />
          <TextField
            field={{ label: 'Longitude', helperText: 'Between 68 and 97 for India.' }}
            required
            type="number"
            step="any"
            error={form.formState.errors.location?.longitude?.message}
            {...form.register('location.longitude', { valueAsNumber: true })}
          />
        </div>
        <Button type="button" variant="secondary" icon={<Crosshair />} onClick={useMyLocation}>
          Use my current location
        </Button>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" loading={create.isPending}>
          Add Address
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
