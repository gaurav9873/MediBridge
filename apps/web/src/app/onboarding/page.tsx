'use client'

import { copy } from '@medibridge/copy'
import { type SignUpBusinessInput, signUpBusinessSchema } from '@medibridge/types'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageShell,
  Skeleton,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crosshair } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { DocumentUpload } from '@/components/document-upload'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'
import { useSession } from '@/lib/use-session'

interface OnboardingStatus {
  step: 'BUSINESS' | 'DOCUMENTS' | 'AWAITING_REVIEW' | 'REJECTED' | 'DONE'
  businessName: string | null
  gstNumber: string | null
  hasLicenceDocument: boolean
  hasGstDocument: boolean
  rejectionReason: string | null
  canPlaceOrders: boolean
}

/**
 * From an account to a business that can trade.
 *
 * The step comes from the server, never from local state. A wizard that
 * remembers where it thinks you are will eventually disagree with the
 * database — usually after a failed request, and usually by showing step 3 to
 * someone still stuck on step 2.
 */
export default function OnboardingPage(): React.JSX.Element {
  const { user, isLoading: sessionLoading, isSignedIn } = useSession()
  const router = useRouter()

  const status = useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: () => api.get<OnboardingStatus>('/onboarding/status'),
    enabled: isSignedIn,
  })

  React.useEffect(() => {
    if (!sessionLoading && !isSignedIn) router.replace('/login')
  }, [sessionLoading, isSignedIn, router])

  if (sessionLoading || status.isLoading || !user || !status.data) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <PageShell
        page={{
          title: 'Finish Setting Up',
          subtitle: 'A few details, then we check your licence. You only do this once.',
        }}
        help={copy.auth.signUp.help}
      >
        <StepIndicator step={status.data.step} />
        <StepContent status={status.data} />
      </PageShell>
    </main>
  )
}

/** Where they are, so the remaining work is never a surprise. */
function StepIndicator({ step }: { step: OnboardingStatus['step'] }): React.JSX.Element {
  const order: Array<[OnboardingStatus['step'], string]> = [
    ['BUSINESS', copy.auth.signUp.steps.business],
    ['DOCUMENTS', copy.auth.signUp.steps.license],
    ['AWAITING_REVIEW', copy.auth.signUp.steps.done],
  ]
  const currentIndex = order.findIndex(([key]) => key === step)

  return (
    <ol className="flex flex-wrap gap-2" aria-label="Progress">
      {order.map(([key, label], index) => {
        const done = currentIndex > index || step === 'DONE'
        const current = currentIndex === index
        return (
          <li
            key={key}
            aria-current={current ? 'step' : undefined}
            className={`flex-1 rounded-[--radius-md] border px-3 py-2 text-sm ${
              done
                ? 'border-success-600 bg-success-50 text-success-900 dark:bg-success-950 dark:text-success-100'
                : current
                  ? 'border-brand-600 bg-brand-50 font-medium text-brand-900 dark:bg-brand-950 dark:text-brand-100'
                  : 'border-border-default text-content-secondary'
            }`}
          >
            {index + 1}. {label}
          </li>
        )
      })}
    </ol>
  )
}

function StepContent({ status }: { status: OnboardingStatus }): React.JSX.Element {
  if (status.step === 'DONE') {
    return (
      <Alert tone="success" title="Your account is active." action={{ label: 'Go to my account', href: '/account' }}>
        Everything is verified. You can place orders as soon as the ordering screens are live.
      </Alert>
    )
  }

  if (status.step === 'AWAITING_REVIEW') {
    return (
      <>
        <Alert tone="info" title={copy.auth.pendingVerification.statusPending}>
          {copy.auth.pendingVerification.statusPendingBody}
        </Alert>
        <DocumentsStep status={status} />
      </>
    )
  }

  if (status.step === 'REJECTED') {
    return (
      <>
        <Alert tone="danger" title="We could not accept one of your documents.">
          {status.rejectionReason ?? 'Please upload a clearer copy and we will look again.'}
        </Alert>
        <DocumentsStep status={status} />
      </>
    )
  }

  if (status.step === 'DOCUMENTS') return <DocumentsStep status={status} />
  return <BusinessStep />
}

/**
 * Business details and the address everything is measured from.
 *
 * The coordinates are not decoration: they are one half of every Same-Day
 * radius check, so the field says so rather than looking like an optional
 * technicality someone can skip.
 */
function BusinessStep(): React.JSX.Element {
  const queryClient = useQueryClient()
  const c = copy.auth.signUp.fields

  const form = useForm<SignUpBusinessInput>({
    resolver: zodResolver(signUpBusinessSchema),
    defaultValues: {
      businessName: '',
      gstNumber: '',
      address: {
        label: 'Main Shop',
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

  const submit = useMutation({
    mutationFn: (values: SignUpBusinessInput) =>
      api.post<OnboardingStatus>('/onboarding/business', values),
    onSuccess: () => {
      notify.success('Business details saved.')
      void queryClient.invalidateQueries({ queryKey: ['onboarding', 'status'] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
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
    <Card>
      <CardHeader title="Business details" description="As printed on your drug licence." />
      <CardBody>
        <form
          onSubmit={form.handleSubmit((values) => submit.mutate(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          <TextField
            field={c.businessName}
            required
            error={form.formState.errors.businessName?.message}
            {...form.register('businessName')}
          />
          <TextField
            field={c.gstNumber}
            required
            error={form.formState.errors.gstNumber?.message}
            {...form.register('gstNumber')}
          />
          <TextField
            field={c.address}
            required
            error={form.formState.errors.address?.line1?.message}
            {...form.register('address.line1')}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={{ label: 'City', helperText: 'The city your shop is in.' }}
              required
              error={form.formState.errors.address?.city?.message}
              {...form.register('address.city')}
            />
            <TextField
              field={{ label: 'State', helperText: 'The state your shop is in.' }}
              required
              error={form.formState.errors.address?.state?.message}
              {...form.register('address.state')}
            />
            <TextField
              field={c.pincode}
              required
              inputMode="numeric"
              error={form.formState.errors.address?.pincode?.message}
              {...form.register('address.pincode')}
            />
            <TextField
              field={{
                label: 'Contact Number',
                helperText: 'The number our delivery person should call.',
              }}
              required
              type="tel"
              inputMode="numeric"
              error={form.formState.errors.address?.contactPhone?.message}
              {...form.register('address.contactPhone')}
            />
          </div>

          <fieldset className="flex flex-col gap-3 rounded-[--radius-lg] border border-border-default p-4">
            <legend className="px-1 text-sm font-medium text-content-primary">
              {c.location.label}
            </legend>
            <p className="text-sm text-content-secondary">{c.location.helperText}</p>
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

          <Button type="submit" size="lg" fullWidth loading={submit.isPending}>
            Save and Continue
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function DocumentsStep({ status }: { status: OnboardingStatus }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <DocumentUpload
        type="DRUG_LICENSE"
        field={copy.auth.signUp.fields.licenseFile}
        numberField={copy.auth.signUp.fields.licenseNumber}
        expiryField={copy.auth.signUp.fields.licenseExpiry}
        uploaded={status.hasLicenceDocument}
      />
      <DocumentUpload
        type="GST_CERTIFICATE"
        field={copy.auth.signUp.fields.gstFile}
        numberField={copy.auth.signUp.fields.gstNumber}
        uploaded={status.hasGstDocument}
      />
    </div>
  )
}
