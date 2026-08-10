'use client'

import { copy } from '@medibridge/copy'
import type { ChallengeIssued } from '@medibridge/types'
import { Button, Card, CardBody, CardHeader, TextField, notify } from '@medibridge/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { CodeStep } from '@/components/code-step'
import { ApiClientError, api } from '@/lib/api-client'

/**
 * Changing the number you sign in with.
 *
 * The code goes to the NEW number, because the point is to prove they hold it.
 * Sending it to the old one would only prove they still have the phone they
 * are trying to stop using.
 */
export function PhoneChange({
  currentPhone,
  verified,
}: {
  currentPhone: string
  verified: boolean
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [phone, setPhone] = React.useState('')
  const [phoneError, setPhoneError] = React.useState<string>()
  const [challenge, setChallenge] = React.useState<ChallengeIssued | null>(null)
  const [code, setCode] = React.useState('')
  const [codeError, setCodeError] = React.useState<string>()

  const request = useMutation({
    mutationFn: () => api.post<{ challenge: ChallengeIssued }>('/profile/phone/request', { phone }),
    onSuccess: (result) => {
      setChallenge(result.challenge)
      setCode('')
      setCodeError(undefined)
    },
    onError: (error) =>
      setPhoneError(error instanceof ApiClientError ? error.message : 'Something went wrong.'),
  })

  const confirm = useMutation({
    mutationFn: () => api.post('/profile/phone/confirm', { phone, code }),
    onSuccess: () => {
      notify.success('Your mobile number has been changed. Use it to sign in from now on.')
      setOpen(false)
      setChallenge(null)
      setPhone('')
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
    onError: (error) =>
      setCodeError(error instanceof ApiClientError ? error.message : 'Something went wrong.'),
  })

  return (
    <Card>
      <CardHeader
        title="Mobile number"
        description={`You sign in with ${currentPhone}${verified ? '' : ' — not yet confirmed'}.`}
      />
      <CardBody>
        {!open ? (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Change my mobile number
          </Button>
        ) : challenge ? (
          <CodeStep
            challenge={challenge}
            code={code}
            onCodeChange={(next) => {
              setCode(next)
              setCodeError(undefined)
            }}
            onSubmit={() => confirm.mutate()}
            onResend={() => request.mutate()}
            isVerifying={confirm.isPending}
            isResending={request.isPending}
            error={codeError}
            submitLabel="Confirm new number"
          />
        ) : (
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
              field={{
                label: 'New Mobile Number',
                helperText: 'We will send a 6-digit code to this number to confirm it is yours.',
              }}
              required
              type="tel"
              inputMode="numeric"
              autoFocus
              error={phoneError}
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
            />
            <div className="flex gap-3">
              <Button type="submit" loading={request.isPending} disabled={phone.length !== 10}>
                {copy.auth.forgotPassword.submit}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
