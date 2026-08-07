/**
 * Short-lived codes sent out of band.
 *
 * One shape covers signing in with an OTP, confirming a new mobile number and
 * resetting a forgotten password, because all three are the same thing: prove
 * you control an identifier, once, within a few minutes. Splitting them into
 * three tables would have triplicated the expiry, attempt-limit and
 * single-use rules — and those are exactly the rules worth having in one place.
 *
 * The purpose is what keeps them apart. A code issued to reset a password
 * cannot be spent to sign in, even if it is still valid and the identifier
 * matches, because verification always names the purpose it expects.
 */

export const ChallengePurpose = {
  /** Signing in with a code instead of a password. */
  SIGN_IN: 'SIGN_IN',
  /** Confirming a mobile number during sign-up. */
  VERIFY_PHONE: 'VERIFY_PHONE',
  /** Setting a new password after forgetting the old one. */
  RESET_PASSWORD: 'RESET_PASSWORD',
} as const
export type ChallengePurpose = (typeof ChallengePurpose)[keyof typeof ChallengePurpose]

/**
 * How long a code lives, and how many wrong guesses it survives.
 *
 * Five minutes is long enough for an SMS to arrive on a slow network and short
 * enough that a code read off a shoulder is usually dead. Five attempts stops
 * a brute force of the 10^6 space long before it becomes feasible, while still
 * forgiving a genuine misread of a 6-digit code.
 */
export const CHALLENGE_TTL_SECONDS = 5 * 60
export const CHALLENGE_MAX_ATTEMPTS = 5

/**
 * How long before another code can be requested for the same identifier.
 *
 * Matches the "Send code again" countdown in the copy layer, so the button
 * re-enables at the moment the server would actually accept a new request.
 */
export const CHALLENGE_RESEND_SECONDS = 60

/** What issuing a challenge tells the caller. Never includes the code. */
export interface ChallengeIssued {
  /** Masked for display: "98765 43210" becomes "•••••43210". */
  sentTo: string
  /** When the code was sent. Identifies one issue from the next. */
  issuedAt: string
  expiresInSeconds: number
  /** Seconds until "Send code again" should re-enable. */
  resendInSeconds: number
  /**
   * Development only. The code, so nobody has to read server logs to sign in.
   * The API omits this outside development; the UI shows it when present.
   */
  devCode?: string
}

/**
 * Delivers a code to whoever asked for it.
 *
 * The one thing an SMS gateway has to do. A real provider — MSG91, Twilio,
 * AWS SNS — is one class implementing this and one line in the module, with no
 * change to how challenges are issued, expired or verified.
 */
export interface OtpSenderContract {
  readonly channel: 'SMS' | 'EMAIL' | 'CONSOLE'
  send(identifier: string, code: string, purpose: ChallengePurpose): Promise<void>
}

/** Hides all but the last four digits of a mobile number. */
export function maskIdentifier(identifier: string): string {
  const at = identifier.indexOf('@')
  if (at > 0) {
    const name = identifier.slice(0, at)
    const domain = identifier.slice(at + 1)
    return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`
  }
  return `${'•'.repeat(Math.max(0, identifier.length - 4))}${identifier.slice(-4)}`
}
