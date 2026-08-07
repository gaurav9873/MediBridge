# Authentication

Phase 2.1. Everything about proving who someone is, and looking after the
account afterwards.

---

## The shape

Signing in is always the same three steps, whatever the method:

```
resolve tenant  ->  a provider identifies the user  ->  a session is issued
```

Only the middle step differs between a password, a one-time code, and the
Google sign-in that does not exist yet. Suspension, tenant and role checks live
once, in `AuthService`, **after** the provider returns — so a new login method
cannot skip them by accident. Adding one is a class implementing
`AuthProviderContract` and a line in `AuthProviderRegistry`.

| Method                | Provider           | Status                       |
| --------------------- | ------------------ | ---------------------------- |
| Mobile + password     | `PasswordProvider` | Live                         |
| Mobile + one-time code| `OtpProvider`      | Live                         |
| Google, Microsoft, SSO| —                  | `AuthMethod` reserves the key|

## One-time codes

Three flows need a short-lived code — signing in, confirming a number at
sign-up, and resetting a password — and all three are the same rule: prove you
control an identifier, once, within a few minutes.

So there is **one** table, `verification_challenges`, and one service.
Splitting it three ways would have triplicated the rules that actually matter:

| Rule                    | Where                                     |
| ----------------------- | ----------------------------------------- |
| Expires after 5 minutes | `CHALLENGE_TTL_SECONDS`                   |
| Dies after 5 wrong guesses | `CHALLENGE_MAX_ATTEMPTS`               |
| Works exactly once      | `consumedAt`, marked rather than deleted  |
| Stored hashed           | SHA-256; a database leak yields no codes  |
| Cannot cross purposes   | `ChallengePurpose` is part of every lookup|
| One code at a time      | Issuing consumes the previous one         |
| No free SMS button      | `CHALLENGE_RESEND_SECONDS`                |

The purpose check is the one that is easy to miss: a code issued to reset a
password is live, and the identifier matches, but it must not sign anyone in.
`challenge.service.spec.ts` tests exactly that.

**Delivery** is behind `OtpSenderContract`. Locally `ConsoleOtpSender` logs the
code, and the API returns it as `devCode` so nobody has to read server logs —
omitted outside development, and the UI's yellow box disappears with it.
Swapping in MSG91 or Twilio is one class and one line in `auth.module.ts`.

## Signing up

Sign-up produces a **person who can sign in**. Onboarding — Phase 2.2 —
produces a **business that can trade**.

```
account details  ->  confirm mobile  ->  PENDING_VERIFICATION
                                           |
                     onboarding: GST, licence, documents (2.2)
                                           |
                     admin approves (2.4)  ->  ACTIVE, can order
```

Confirming the phone proves the number is real. It does not make the account
able to buy medicines: that needs a drug licence an admin has seen. The two are
different questions, and the account status only answers the second.

Self-registration is refused on a `PRIVATE_DISTRIBUTOR` portal. Those customers
are invited; letting anyone walk in would put strangers inside a private store.

## Not saying who exists

Requesting a sign-in code, or a password reset, **succeeds identically** for a
registered and an unregistered number. So does a wrong password and an unknown
one — both give `INVALID_CREDENTIALS`.

Otherwise the login page becomes a way to enumerate which pharmacies use
MediBridge, which is competitive intelligence we should not be handing out. The
copy layer carries this: "If that number is registered with us, we have sent it
a 6-digit code."

Sign-up is the exception, and deliberately: someone claiming an identifier is
theirs needs to be told it is already taken.

## Passwords

Changing or resetting a password **revokes every session**. If the reset
happened because someone else had the account, leaving their session alive
would make the new password pointless.

The reset code and the new password are submitted together, so a valid code is
never left spent-but-unused.

## Sessions

`/account` lists every live refresh token as a device someone recognises —
"Chrome on Android", not a user-agent string — and offers to end any of them.
The current session is never offered a sign-out button in that list; the button
at the bottom of the page already does that.

## Endpoints

| Route                                | Public | What                                |
| ------------------------------------ | ------ | ----------------------------------- |
| `POST /auth/sign-in`                 | yes    | Mobile + password                   |
| `POST /auth/admin/sign-in`           | yes    | Same, admin portal only             |
| `POST /account/sign-up`              | yes    | Create an account, send a code      |
| `POST /account/verify-phone`         | yes    | Confirm the number                  |
| `POST /account/resend-phone-code`    | yes    | Send it again                       |
| `POST /account/request-sign-in-code` | yes    | One-time sign-in code               |
| `POST /account/sign-in-with-code`    | yes    | Sign in with it                     |
| `POST /account/forgot-password`      | yes    | Reset code                          |
| `POST /account/reset-password`       | yes    | Code + new password                 |
| `POST /account/change-password`      | no     | Current + new password              |
| `GET  /account/sessions`             | no     | Devices signed in                   |
| `DELETE /account/sessions/:id`       | no     | End one                             |
| `POST /account/sessions/revoke-others` | no   | End all but this one                |

Every public route is rate-limited harder than the global default: each one
either sends an SMS we pay for, or is worth guessing at.

## Screens

| Route              | What                                                    |
| ------------------ | ------------------------------------------------------- |
| `/login`           | Password, with links to both other routes in            |
| `/login/otp`       | Number, then code                                       |
| `/signup`          | Details, then code                                      |
| `/forgot-password` | Number, then code and new password together             |
| `/account`         | Details, licence gate, and the session list             |

`CodeStep` is shared by all three code screens, so the resend countdown cannot
drift out of step with the server's own window in two of three places. All
verified at 390px, 768px and 1280px with no horizontal overflow.

## Tenancy

Authentication genuinely precedes tenancy — the tenant is derived from the host
or from the user — so those lookups run through `runPreTenant()` rather than
being scoped. What makes that safe is the check immediately after:
`AuthController` passes the resolved tenant into `AuthService.signIn`, which
refuses a credential belonging to a different company.

On localhost there is no subdomain to read, so `DEFAULT_TENANT_SLUG` decides
which store a request belongs to. Without it, sign-up cannot tell which
marketplace it is joining.

## What is tested

`apps/api/src/auth/challenge.service.spec.ts` — seven tests, all on rules that
cost something if they break: hashed storage, single use, expiry, the attempt
limit, purpose separation, previous-code invalidation, and the resend window.

Not tested: that Prisma saves a row, that Nest routes a request. Those are the
framework's tests.
