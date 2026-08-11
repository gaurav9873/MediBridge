'use client'

import { copy } from '@medibridge/copy'
import {
  type ChallengeIssued,
  type SignUpAccountInput,
  UserRole,
  signUpAccountSchema,
} from '@medibridge/types'
import { Alert, Button, TextField, notify } from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { AuthShell } from '@/components/auth-shell'
import { CodeStep } from '@/components/code-step'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'

/**
 * Creating an account.
 *
 * Two steps, not four. The copy layer describes a longer wizard — business
 * details, licence upload — but those need a GST number and a document review,
 * which is onboarding rather than sign-up. This produces a person who can sign
 * in; onboarding produces a business that can trade.
 *
 * The step is derived from whether a challenge exists, not stored separately.
 * Mirroring server state into a second piece of local state is how a wizard
 * ends up showing step 2 for a request that failed.
 */
export default function SignUpPage(): React.JSX.Element {
  const router = useRouter()
  const c = copy.auth.signUp

  const [challenge, setChallenge] = React.useState<ChallengeIssued | null>(null)
  const [phone, setPhone] = React.useState('')
  const [code, setCode] = React.useState('')
  const [codeError, setCodeError] = React.useState<string>()

  const form = useForm<SignUpAccountInput>({
    resolver: zodResolver(signUpAccountSchema),
    defaultValues: {
      role: UserRole.RETAILER,
      fullName: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: true,
    },
    mode: 'onBlur',
  })

  const signUp = useMutation({
    mutationFn: (values: SignUpAccountInput) =>
      api.post<{ challenge: ChallengeIssued }>('/account/sign-up', values),
    onSuccess: (result, values) => {
      setPhone(values.phone)
      setChallenge(result.challenge)
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  const verify = useMutation({
    mutationFn: () => api.post('/account/verify-phone', { phone, code }),
    onSuccess: () => {
      notify.success(copy.auth.otp.success)
      router.replace('/login?verified=1')
    },
    onError: (error) => {
      setCodeError(error instanceof ApiClientError ? error.message : 'Something went wrong.')
    },
  })

  const resend = useMutation({
    mutationFn: () => api.post<{ challenge: ChallengeIssued }>('/account/resend-phone-code', { phone }),
    onSuccess: (result) => {
      setChallenge(result.challenge)
      setCode('')
      setCodeError(undefined)
    },
    onError: (error) => {
      notify.error(error instanceof ApiClientError ? error.message : undefined)
    },
  })

  const footer = (
    <p className="text-center text-sm text-content-secondary">
      {c.haveAccount}{' '}
      <Link
        href="/login"
        className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
      >
        {c.signInInstead}
      </Link>
    </p>
  )

  if (challenge) {
    return (
      <AuthShell page={copy.auth.otp.page} help={c.help} footer={footer}>
        <CodeStep
          challenge={challenge}
          code={code}
          onCodeChange={(next) => {
            setCode(next)
            setCodeError(undefined)
          }}
          onSubmit={() => verify.mutate()}
          onResend={() => resend.mutate()}
          isVerifying={verify.isPending}
          isResending={resend.isPending}
          error={codeError}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell page={c.page} help={c.help} footer={footer}>
      <form
        onSubmit={form.handleSubmit((values) => signUp.mutate(values))}
        className="flex flex-col gap-5"
        noValidate
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-content-primary">{c.fields.role.label}</legend>
          <p className="text-sm text-content-secondary">{c.fields.role.helperText}</p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {[
              { value: UserRole.RETAILER, label: 'Retailer', hint: 'I buy medicines' },
              { value: UserRole.DISTRIBUTOR, label: 'Distributor', hint: 'I sell medicines' },
            ].map((option) => {
              const selected = form.watch('role') === option.value
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-(--radius-lg) border p-3 text-left transition ${
                    selected
                      ? 'border-brand-600 bg-brand-50 dark:bg-brand-950'
                      : 'border-border-default hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    value={option.value}
                    checked={selected}
                    onChange={() => form.setValue('role', option.value)}
                  />
                  <span className="text-sm font-medium text-content-primary">{option.label}</span>
                  <span className="text-xs text-content-secondary">{option.hint}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <TextField
          field={c.fields.fullName}
          required
          autoComplete="name"
          error={form.formState.errors.fullName?.message}
          {...form.register('fullName')}
        />
        <TextField
          field={c.fields.phone}
          required
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          error={form.formState.errors.phone?.message}
          {...form.register('phone')}
        />
        <TextField
          field={c.fields.email}
          required
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          field={c.fields.password}
          required
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <TextField
          field={c.fields.confirmPassword}
          required
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />

        <Alert tone="info" title="What happens next">
          We will confirm your mobile number, then ask for your GST number and drug licence. You can
          browse prices straight away; ordering opens once your licence is approved.
        </Alert>

        <Button type="submit" size="lg" fullWidth loading={signUp.isPending}>
          {c.submit}
        </Button>
      </form>
    </AuthShell>
  )
}
