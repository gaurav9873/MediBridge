'use client'

import { copy } from '@medibridge/copy'
import type { ChallengeIssued } from '@medibridge/types'
import { Alert, Button, TextField } from '@medibridge/ui'
import * as React from 'react'

/**
 * The "enter the 6-digit code we sent you" step.
 *
 * Three flows need it — signing up, signing in with a code, and resetting a
 * password — and all three need the same fiddly parts: a numeric input that
 * behaves on a phone keyboard, a resend button that stays disabled until the
 * server would actually accept a new request, and a countdown that says how
 * long that is. Writing it once means the countdown cannot drift out of step
 * with the server's own resend window in two of the three places.
 */
export interface CodeStepProps {
  challenge: ChallengeIssued
  code: string
  onCodeChange: (code: string) => void
  onSubmit: () => void
  onResend: () => void
  isVerifying: boolean
  isResending: boolean
  error?: string
  /** Label for the confirm button. Defaults to the OTP screen's wording. */
  submitLabel?: string
  /** Rendered between the code box and the button — the reset flow puts the
   *  new-password fields here, so the code and the password are one submit. */
  children?: React.ReactNode
}

export function CodeStep(props: CodeStepProps): React.JSX.Element {
  // A new challenge is a new countdown. Remounting is React's own answer to
  // "reset state when a prop changes" — simpler and harder to get wrong than
  // syncing inside an effect.
  return <CodeStepInner key={props.challenge.issuedAt} {...props} />
}

function CodeStepInner({
  challenge,
  code,
  onCodeChange,
  onSubmit,
  onResend,
  isVerifying,
  isResending,
  error,
  submitLabel,
  children,
}: CodeStepProps): React.JSX.Element {
  const c = copy.auth.otp
  const secondsLeft = useCountdown(challenge.resendInSeconds)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <Alert tone="info" title={c.sentTo(challenge.sentTo)}>
        The code is valid for {Math.round(challenge.expiresInSeconds / 60)} minutes.
      </Alert>

      {/* Development only: the API omits this in production, so the block
          disappears with it rather than needing a separate flag here. */}
      {challenge.devCode ? (
        <Alert tone="warning" title="Development mode">
          No SMS is sent locally. Your code is{' '}
          <span className="font-mono font-semibold tracking-widest">{challenge.devCode}</span>.
        </Alert>
      ) : null}

      <TextField
        field={c.fields.code}
        required
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        error={error}
        value={code}
        // Strip anything that is not a digit so a pasted "1 2 3 4 5 6" works.
        onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />

      {children}

      <Button type="submit" size="lg" fullWidth loading={isVerifying} disabled={code.length !== 6}>
        {submitLabel ?? c.submit}
      </Button>

      <div className="text-center text-sm text-content-secondary">
        {secondsLeft > 0 ? (
          <span>{c.resendIn(secondsLeft)}</span>
        ) : (
          <Button type="button" variant="ghost" size="md" onClick={onResend} loading={isResending}>
            {c.resend}
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * Seconds until another code may be requested.
 *
 * Starts from what the server said the window is, so the button re-enables at
 * the moment a new request would actually be accepted rather than at a number
 * guessed on the client. The reset on a new challenge is handled by the key in
 * CodeStep, which is why nothing here has to watch for one.
 */
function useCountdown(initialSeconds: number): number {
  const [secondsLeft, setSecondsLeft] = React.useState(initialSeconds)

  React.useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return secondsLeft
}
