'use client'

import { type ProfileInput, profileSchema } from '@medibridge/types'
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
import { useForm } from 'react-hook-form'
import { AddressBook } from '@/components/address-book'
import { NotificationSettings } from '@/components/notification-settings'
import { PhoneChange } from '@/components/phone-change'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'
import { useSession } from '@/lib/use-session'

interface ProfileSummary {
  id: string
  fullName: string
  phone: string
  email: string
  role: string
  accountStatus: string
  businessName: string | null
  roleName: string | null
  phoneVerified: boolean
  emailVerified: boolean
  lastLoginAt: string | null
  memberSince: string
}

/**
 * Your own account.
 *
 * Separate from Business Settings on purpose: one is "who am I", the other is
 * "what does my company do". A counter assistant has every right to change
 * their own email and no business touching the company's payment terms.
 */
export default function ProfilePage(): React.JSX.Element {
  const { isLoading: sessionLoading, isSignedIn } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!sessionLoading && !isSignedIn) router.replace('/login')
  }, [sessionLoading, isSignedIn, router])

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<ProfileSummary>('/profile'),
    enabled: isSignedIn,
  })

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    values: { fullName: profile.data?.fullName ?? '', email: profile.data?.email ?? '' },
    mode: 'onBlur',
  })

  const save = useMutation({
    mutationFn: (values: ProfileInput) => api.patch<ProfileSummary>('/profile', values),
    onSuccess: () => {
      notify.success('Your details have been saved.')
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  if (sessionLoading || profile.isLoading || !profile.data) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageShell
        page={{ title: 'My Profile', subtitle: 'Your details, addresses and what we tell you about.' }}
        help={{
          whatIsThis:
            'This is your own account — your name, how we reach you, where you want deliveries, and which messages you want. Your business details are on the Business Settings page.',
          topics: [
            {
              question: 'Why do I need a code to change my mobile number?',
              answer:
                'Because you sign in with it. The code goes to the NEW number, which is how we know you actually hold it.',
            },
            {
              question: 'What do the coordinates on an address do?',
              answer:
                'They decide which distributors can deliver to you Same-Day. A pin in the wrong place means the wrong delivery options, not an error message — so it is worth getting right.',
            },
            {
              question: 'Why can I not delete my only address?',
              answer:
                'We measure delivery distance from it. With no address, search cannot tell you who can reach you.',
            },
            {
              question: 'Will turning off SMS mean I miss something?',
              answer:
                'No. Everything still appears in the app. This only decides whether it also costs you an SMS.',
            },
          ],
        }}
      >
        {profile.data.businessName ? (
          <Alert
            tone="info"
            title={`${profile.data.businessName}${profile.data.roleName ? ` · ${profile.data.roleName}` : ''}`}
          >
            Signed in as {profile.data.phone}. Member since{' '}
            {new Date(profile.data.memberSince).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            .
          </Alert>
        ) : null}

        <Card>
          <CardHeader title="Your details" description="How we address you and where we write." />
          <CardBody>
            <form
              onSubmit={form.handleSubmit((values) => save.mutate(values))}
              className="flex flex-col gap-5"
              noValidate
            >
              <TextField
                field={{ label: 'Full Name', helperText: 'Your name as it appears on documents.' }}
                required
                autoComplete="name"
                error={form.formState.errors.fullName?.message}
                {...form.register('fullName')}
              />
              <TextField
                field={{
                  label: 'Email Address',
                  helperText: 'Order receipts and invoices go here.',
                }}
                required
                type="email"
                autoComplete="email"
                error={form.formState.errors.email?.message}
                {...form.register('email')}
              />
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            </form>
          </CardBody>
        </Card>

        <PhoneChange currentPhone={profile.data.phone} verified={profile.data.phoneVerified} />
        <AddressBook />
        <NotificationSettings />
      </PageShell>
    </main>
  )
}
