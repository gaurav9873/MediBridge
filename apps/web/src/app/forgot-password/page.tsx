'use client'

import { copy } from '@medibridge/copy'
import type { ChallengeIssued } from '@medibridge/types'
import { Alert, Button, TextField, notify } from '@medibridge/ui'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { AuthShell } from '@/components/auth-shell'
import { CodeStep } from '@/components/code-step'
import { ApiClientError, api } from '@/lib/api-client'

/**
 * Resetting a forgotten password.
 *
 * The code and the new password are submitted together, so a valid code is
 * never left spent-but-unused: either the password changes or the code is
 * still good. Splitting it into "verify code" then "set password" would burn
 * the code on the first step and strand anyone whose second step failed.
 *
 * The confirmation deliberately says "if that number is registered with us" —
 * the same message either way, so this page cannot be used to find out who
 * has an account.
 */
export default function ForgotPasswordPage(): React.JSX.Element {
  const router = useRouter()
  const c = copy.auth.forgotPassword

  const [phone, setPhone] = React.useState('')
  const [phoneError, setPhoneError] = React.useState<string>()
  const [challenge, setChallenge] = React.useState<ChallengeIssued | null>(null)
  const [code, setCode] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string>()

  const request = useMutation({
    mutationFn: () => api.post<{ challenge: ChallengeIssued }>('/account/forgot-password', { phone }),
    onSuccess: (result) => {
      setChallenge(result.challenge)
      setCode('')
      setFieldError(undefined)
    },
    onError: (error) => {
      setPhoneError(error instanceof ApiClientError ? error.message : 'Something went wrong.')
    },
  })

  const reset = useMutation({
    mutationFn: () =>
      api.post('/account/reset-password', { phone, code, newPassword, confirmPassword }),
    onSuccess: () => {
      notify.success(c.success)
      router.replace('/login')
    },
    onError: (error) => {
      setFieldError(error instanceof ApiClientError ? error.message : 'Something went wrong.')
    },
  })

  const footer = (
    <p className="text-center text-sm text-content-secondary">
      <Link
        href="/login"
        className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
      >
        {c.backToSignIn}
      </Link>
    </p>
  )

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  if (challenge) {
    return (
      <AuthShell page={c.page} help={copy.auth.signIn.help} footer={footer}>
        <Alert tone="success" title={c.sentNeutral} />
        <div className="mt-5">
          <CodeStep
            challenge={challenge}
            code={code}
            onCodeChange={(next) => {
              setCode(next)
              setFieldError(undefined)
            }}
            onSubmit={() => reset.mutate()}
            onResend={() => request.mutate()}
            isVerifying={reset.isPending}
            isResending={request.isPending}
            error={fieldError}
            submitLabel={c.setPassword}
          >
            <TextField
              field={c.fields.newPassword}
              required
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <TextField
              field={copy.auth.signUp.fields.confirmPassword}
              required
              type="password"
              autoComplete="new-password"
              error={
                confirmPassword.length > 0 && !passwordsMatch
                  ? copy.validation.password.doesNotMatch
                  : undefined
              }
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </CodeStep>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell page={c.page} help={copy.auth.signIn.help} footer={footer}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setPhoneError(undefined)
          request.mutate()
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        <TextField
          field={c.fields.phone}
          required
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          autoFocus
          error={phoneError}
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={request.isPending}
          disabled={phone.length !== 10}
        >
          {c.submit}
        </Button>
      </form>
    </AuthShell>
  )
}
