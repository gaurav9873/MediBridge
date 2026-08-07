'use client'

import { copy } from '@medibridge/copy'
import type { ChallengeIssued, SessionUser } from '@medibridge/types'
import { Button, TextField, notify } from '@medibridge/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { AuthShell } from '@/components/auth-shell'
import { CodeStep } from '@/components/code-step'
import { ApiClientError, api } from '@/lib/api-client'

/**
 * Signing in with a code instead of a password.
 *
 * Useful for the pharmacist who has forgotten their password but still has
 * their phone — which, on a shared shop counter device, is most of them.
 *
 * Asking for a code succeeds whether or not the number is registered, so this
 * screen cannot be used to find out who has an account. The only place an
 * unknown number is refused is after a correct code, with the same wording as
 * a wrong password.
 */
export default function OtpSignInPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const c = copy.auth.signIn

  const [phone, setPhone] = React.useState('')
  const [phoneError, setPhoneError] = React.useState<string>()
  const [challenge, setChallenge] = React.useState<ChallengeIssued | null>(null)
  const [code, setCode] = React.useState('')
  const [codeError, setCodeError] = React.useState<string>()

  const request = useMutation({
    mutationFn: () =>
      api.post<{ challenge: ChallengeIssued }>('/account/request-sign-in-code', { phone }),
    onSuccess: (result) => {
      setChallenge(result.challenge)
      setCode('')
      setCodeError(undefined)
    },
    onError: (error) => {
      setPhoneError(error instanceof ApiClientError ? error.message : 'Something went wrong.')
    },
  })

  const signIn = useMutation({
    mutationFn: () => api.post<{ user: SessionUser }>('/account/sign-in-with-code', { phone, code }),
    onSuccess: (result) => {
      queryClient.setQueryData(['session'], result.user)
      notify.success(c.success)
      router.replace('/account')
    },
    onError: (error) => {
      setCodeError(error instanceof ApiClientError ? error.message : 'Something went wrong.')
    },
  })

  const footer = (
    <p className="text-center text-sm text-content-secondary">
      <Link
        href="/login"
        className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
      >
        Sign in with a password instead
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
          onSubmit={() => signIn.mutate()}
          onResend={() => request.mutate()}
          isVerifying={signIn.isPending}
          isResending={request.isPending}
          error={codeError}
          submitLabel={c.submit}
        />
        <div className="mt-4 text-center">
          <Button type="button" variant="ghost" size="md" onClick={() => setChallenge(null)}>
            {copy.auth.otp.wrongNumber}
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      page={{ title: 'Sign In with a Code', subtitle: 'We will send a 6-digit code by SMS.' }}
      help={c.help}
      footer={footer}
    >
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
          Send Code
        </Button>
      </form>
    </AuthShell>
  )
}
