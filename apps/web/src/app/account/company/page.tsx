'use client'

import { copy } from '@medibridge/copy'
import {
  type CompanyBankInput,
  type CompanyBrandingInput,
  type CompanyProfileInput,
  type CompanyTermsInput,
  PaymentTermType,
  companyBankSchema,
  companyBrandingSchema,
  companyProfileSchema,
  companyTermsSchema,
} from '@medibridge/types'
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
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { type UseFormReturn, useForm } from 'react-hook-form'
import { WarehouseList } from '@/components/warehouse-list'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'
import { useSession } from '@/lib/use-session'

interface CompanySettings {
  id: string
  name: string
  slug: string
  businessMode: string
  gstNumber: string | null
  supportEmail: string | null
  supportPhone: string | null
  logoUrl: string | null
  loginImageUrl: string | null
  brandColor: string | null
  paymentTermType: string
  tokenPercent: number
  creditDays: number
  bankAccountHolder: string | null
  bankAccountNumberMasked: string | null
  bankIfsc: string | null
}

const TERM_LABELS: Record<string, { label: string; hint: string }> = {
  [PaymentTermType.TOKEN_PLUS_COD]: {
    label: 'Token now, rest on delivery',
    hint: 'The retailer pays a percentage online to confirm; the rest is cash on delivery.',
  },
  [PaymentTermType.PREPAID]: {
    label: 'Pay in full up front',
    hint: 'Nothing ships until the whole order is paid.',
  },
  [PaymentTermType.COD]: {
    label: 'Cash on delivery',
    hint: 'Nothing is collected online. Your delivery person collects everything.',
  },
  [PaymentTermType.CREDIT]: {
    label: 'Credit',
    hint: 'The retailer pays later, within the number of days you set.',
  },
}

/**
 * A company's own settings.
 *
 * Four small forms rather than one big one, each saving on its own. Someone
 * fixing a typo in a support phone number should not have to re-confirm their
 * bank details to do it — and a validation failure in one should not block the
 * other three.
 */
export default function CompanySettingsPage(): React.JSX.Element {
  const { isLoading: sessionLoading, isSignedIn } = useSession()
  const router = useRouter()

  React.useEffect(() => {
    if (!sessionLoading && !isSignedIn) router.replace('/login')
  }, [sessionLoading, isSignedIn, router])

  const settings = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get<CompanySettings>('/company'),
    enabled: isSignedIn,
  })

  if (sessionLoading || settings.isLoading || !settings.data) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageShell page={copy.account.company.page} help={copy.account.company.help}>
        <Alert tone="info" title={`${settings.data.name} · ${settings.data.slug}`}>
          {settings.data.gstNumber
            ? `GST ${settings.data.gstNumber}. `
            : 'No GST number on file yet. '}
          These settings apply to everything you sell.
        </Alert>

        <ProfileCard settings={settings.data} />
        <TermsCard settings={settings.data} />
        <WarehouseList />
        <BankCard settings={settings.data} />
        <BrandingCard settings={settings.data} />
      </PageShell>
    </main>
  )
}

/**
 * Saves one section and refreshes the whole settings object.
 *
 * Typed loosely on purpose: four differently shaped forms share it, and the
 * shape each one sends is already guaranteed by its own resolver.
 */
function useSection<TInput extends Record<string, unknown>>(
  path: string,
  form: Pick<UseFormReturn<never>, 'setError'>,
  successMessage: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: TInput) => api.patch<CompanySettings>(`/company/${path}`, values),
    onSuccess: () => {
      notify.success(successMessage)
      void queryClient.invalidateQueries({ queryKey: ['company'] })
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError as never)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })
}

function ProfileCard({ settings }: { settings: CompanySettings }): React.JSX.Element {
  const form = useForm<CompanyProfileInput>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      name: settings.name,
      supportEmail: settings.supportEmail ?? '',
      supportPhone: settings.supportPhone ?? '',
    },
    mode: 'onBlur',
  })
  const save = useSection('profile', form, 'Business details saved.')

  return (
    <Card>
      <CardHeader title="Business details" description="What your customers see." />
      <CardBody>
        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          <TextField
            field={{
              label: 'Business Name',
              helperText: 'As printed on your drug licence.',
            }}
            required
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={{
                label: 'Support Email',
                helperText: 'Where customers write when something goes wrong.',
              }}
              type="email"
              error={form.formState.errors.supportEmail?.message}
              {...form.register('supportEmail')}
            />
            <TextField
              field={{
                label: 'Support Phone',
                helperText: 'The number printed on order confirmations.',
              }}
              type="tel"
              inputMode="numeric"
              error={form.formState.errors.supportPhone?.message}
              {...form.register('supportPhone')}
            />
          </div>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function TermsCard({ settings }: { settings: CompanySettings }): React.JSX.Element {
  const form = useForm<CompanyTermsInput>({
    resolver: zodResolver(companyTermsSchema),
    defaultValues: {
      paymentTermType: settings.paymentTermType as CompanyTermsInput['paymentTermType'],
      tokenPercent: settings.tokenPercent,
      creditDays: settings.creditDays,
    },
    mode: 'onBlur',
  })
  const save = useSection('terms', form, 'Payment terms saved.')
  const chosen = form.watch('paymentTermType')

  return (
    <Card>
      <CardHeader title="Payment terms" description="How you expect to be paid." />
      <CardBody>
        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-content-primary">Terms</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              {Object.entries(TERM_LABELS).map(([value, meta]) => {
                const selected = chosen === value
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-[--radius-lg] border p-3 ${
                      selected
                        ? 'border-brand-600 bg-brand-50 dark:bg-brand-950'
                        : 'border-border-default hover:border-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      value={value}
                      checked={selected}
                      onChange={() =>
                        form.setValue(
                          'paymentTermType',
                          value as CompanyTermsInput['paymentTermType'],
                        )
                      }
                    />
                    <span className="text-sm font-medium text-content-primary">{meta.label}</span>
                    <span className="text-xs text-content-secondary">{meta.hint}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {/* Only the number the chosen term actually uses. Showing both means
              someone edits the one that does nothing. */}
          {chosen === PaymentTermType.TOKEN_PLUS_COD ? (
            <TextField
              field={{
                label: 'Token Percentage',
                helperText: 'How much of the order is paid online to confirm it.',
                tooltip:
                  'Orders already placed keep the percentage that applied at the time. Changing this never asks anyone for more money after the fact.',
              }}
              required
              type="number"
              min={1}
              max={100}
              error={form.formState.errors.tokenPercent?.message}
              {...form.register('tokenPercent', { valueAsNumber: true })}
            />
          ) : null}

          {chosen === PaymentTermType.CREDIT ? (
            <TextField
              field={{
                label: 'Credit Days',
                helperText: 'How long a retailer has to pay after delivery.',
              }}
              required
              type="number"
              min={1}
              max={180}
              error={form.formState.errors.creditDays?.message}
              {...form.register('creditDays', { valueAsNumber: true })}
            />
          ) : null}

          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function BankCard({ settings }: { settings: CompanySettings }): React.JSX.Element {
  const form = useForm<CompanyBankInput>({
    resolver: zodResolver(companyBankSchema),
    defaultValues: { bankAccountHolder: settings.bankAccountHolder ?? '', bankAccountNumber: '', bankIfsc: settings.bankIfsc ?? '' },
    mode: 'onBlur',
  })
  const save = useSection('bank', form, 'Bank details saved.')

  return (
    <Card>
      <CardHeader title="Bank account" description="Where your weekly settlement is paid." />
      <CardBody>
        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          {settings.bankAccountNumberMasked ? (
            <Alert tone="info" title={`Currently paying to ${settings.bankAccountNumberMasked}`}>
              We only ever show the last four digits. Type the full number again to change it.
            </Alert>
          ) : null}
          <TextField
            field={{
              label: 'Account Holder Name',
              helperText: 'Exactly as it appears on the bank account.',
            }}
            error={form.formState.errors.bankAccountHolder?.message}
            {...form.register('bankAccountHolder')}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              field={{
                label: 'Account Number',
                helperText: 'From your passbook or cheque book.',
              }}
              inputMode="numeric"
              error={form.formState.errors.bankAccountNumber?.message}
              {...form.register('bankAccountNumber')}
            />
            <TextField
              field={{
                label: 'IFSC Code',
                helperText: '11 characters, like HDFC0000123.',
                tooltip: 'The IFSC is printed on your cheque book and in your bank app.',
              }}
              error={form.formState.errors.bankIfsc?.message}
              {...form.register('bankIfsc')}
            />
          </div>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function BrandingCard({ settings }: { settings: CompanySettings }): React.JSX.Element {
  const form = useForm<CompanyBrandingInput>({
    resolver: zodResolver(companyBrandingSchema),
    defaultValues: {
      logoUrl: settings.logoUrl ?? '',
      loginImageUrl: settings.loginImageUrl ?? '',
      brandColor: settings.brandColor ?? '',
    },
    mode: 'onBlur',
  })
  const save = useSection('branding', form, 'Branding saved.')
  const colour = form.watch('brandColor')

  return (
    <Card>
      <CardHeader
        title="Branding"
        description="How your portal looks to your customers."
      />
      <CardBody>
        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <TextField
                field={{
                  label: 'Brand Colour',
                  helperText: 'One colour, like #0d7490. Everything else is derived from it.',
                  tooltip:
                    'We work out the lighter and darker shades, and check the text stays readable — so you cannot end up with an unreadable screen.',
                }}
                error={form.formState.errors.brandColor?.message}
                {...form.register('brandColor')}
              />
            </div>
            <span
              aria-hidden
              className="mb-7 size-11 shrink-0 rounded-[--radius-md] border border-border-default"
              style={{ background: /^#[0-9a-fA-F]{6}$/.test(colour ?? '') ? colour : undefined }}
            />
          </div>
          <TextField
            field={{ label: 'Logo URL', helperText: 'A link to your logo image.' }}
            error={form.formState.errors.logoUrl?.message}
            {...form.register('logoUrl')}
          />
          <TextField
            field={{
              label: 'Login Image URL',
              helperText: 'A link to the picture shown beside your sign-in form.',
            }}
            error={form.formState.errors.loginImageUrl?.message}
            {...form.register('loginImageUrl')}
          />
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
