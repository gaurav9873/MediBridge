'use client'

import { copy } from '@medibridge/copy'
import { Alert, Button, Card, CardBody, CardHeader, PageShell, Skeleton } from '@medibridge/ui'
import { LogOut, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { AccountSessions } from '@/components/account-sessions'
import { useSession, useSignOut } from '@/lib/use-session'

/**
 * Where a retailer or distributor lands after signing in.
 *
 * A placeholder on purpose: the real retailer dashboard is Phase 3. Rather
 * than a fake dashboard of invented numbers, this shows the actual session the
 * API returned — which is genuinely useful for checking that the licence gate
 * and account status work against the seeded accounts.
 */
export default function AccountPage(): React.JSX.Element {
  const { user, isLoading, isSignedIn } = useSession()
  const router = useRouter()
  const { signOut, isPending } = useSignOut()

  React.useEffect(() => {
    if (!isLoading && !isSignedIn) router.replace('/login')
  }, [isLoading, isSignedIn, router])

  if (isLoading || !user) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-48 w-full" />
      </main>
    )
  }

  const rows: Array<[string, string]> = [
    ['Name', user.fullName],
    ['Business', user.businessName ?? '—'],
    ['Mobile', user.phone],
    ['Email', user.email],
    ['Account type', copy.admin.users.role[user.role] ?? user.role],
    [
      'Status',
      copy.admin.users.accountStatus[
        user.accountStatus as keyof typeof copy.admin.users.accountStatus
      ] ?? user.accountStatus,
    ],
    ['Licence valid until', user.licenseExpiresOn ?? '—'],
  ]

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <PageShell
        page={{
          title: 'My Account',
          subtitle: 'Your business details as we hold them.',
        }}
        help={copy.account.license.help}
      >
        {/* The ordering gate, shown as the user actually experiences it. */}
        {user.canPlaceOrders ? (
          <Alert tone="success" title="Your account is active.">
            Your licence is valid, so you can place orders once the ordering screens are live.
          </Alert>
        ) : user.accountStatus === 'PENDING_VERIFICATION' ? (
          <Alert tone="warning" title={copy.auth.pendingVerification.statusPending}>
            {copy.auth.pendingVerification.statusPendingBody}
          </Alert>
        ) : (
          <Alert tone="danger" title={copy.auth.licenseExpired.title}>
            {copy.auth.licenseExpired.body}
          </Alert>
        )}

        <Card>
          <CardHeader title="Your details" description="Held on your MediBridge account." />
          <CardBody>
            <dl className="flex flex-col">
              {rows.map(([label, value], index) => (
                <div
                  key={label}
                  className={`flex flex-wrap items-baseline justify-between gap-2 py-3 ${
                    index > 0 ? 'border-t border-border-default' : ''
                  }`}
                >
                  <dt className="text-sm text-content-secondary">{label}</dt>
                  <dd className="text-base font-medium text-content-primary">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        {/* The way out of a half-finished account, next to the alert that
            says it is half-finished. */}
        {user.accountStatus !== 'ACTIVE' ? (
          <Button variant="primary" onClick={() => router.push('/onboarding')}>
            Finish setting up my account
          </Button>
        ) : null}

        <Card>
          <CardHeader title="Your team" description="Give each person their own sign-in." />
          <CardBody>
            <Button variant="secondary" icon={<Users />} onClick={() => router.push('/account/team')}>
              Manage team
            </Button>
          </CardBody>
        </Card>

        <AccountSessions />

        <Card>
          <CardHeader
            title="Coming next"
            description="Search, cart, checkout and order tracking arrive in Phases 3 and 4."
          />
        </Card>

        <Button variant="secondary" icon={<LogOut />} loading={isPending} onClick={signOut}>
          {copy.common.nav.signOut}
        </Button>
      </PageShell>
    </main>
  )
}
