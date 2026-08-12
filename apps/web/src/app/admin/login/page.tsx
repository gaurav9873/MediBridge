'use client'

import { copy } from '@medibridge/copy'
import { type SessionUser, type SignInInput, signInSchema } from '@medibridge/types'
import { Button, Card, CardBody, HelpPanel, TextField, notify } from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'
import { SignedOutNotice } from '@/components/signed-out-notice'

/**
 * Admin sign-in.
 *
 * Uses the shared `signInSchema` from @medibridge/types, so the phone-number
 * and password rules — and their wording — are byte-identical to what the
 * server enforces. A field the server rejects lands back on the same input
 * with the same sentence.
 */
export default function AdminLoginPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const c = copy.admin.signIn

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { phone: '', password: '' },
    // Validate on blur rather than on every keystroke: shouting "invalid" at
    // someone halfway through typing their number is unpleasant.
    mode: 'onBlur',
  })

  const signIn = useMutation({
    mutationFn: (values: SignInInput) =>
      api.post<{ user: SessionUser }>('/auth/admin/sign-in', values, { auth: true }),
    onSuccess: (result) => {
      queryClient.setQueryData(['session'], result.user)
      notify.success(c.success)
      router.replace('/admin')
    },
    onError: (error) => {
      // Field-level problems go inline on the input; anything else is a toast.
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-sunken px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-(--radius-xl) bg-brand-600 text-white">
            <ShieldCheck className="size-7" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
              {c.page.title}
            </h1>
            <p className="text-base text-content-secondary">{c.page.subtitle}</p>
          </div>
        </div>

        <SignedOutNotice />

        <Card>
          <CardBody>
            <form
              onSubmit={form.handleSubmit((values) => signIn.mutate(values))}
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
                error={form.formState.errors.phone?.message}
                {...form.register('phone')}
              />

              <TextField
                field={c.fields.password}
                required
                type="password"
                autoComplete="current-password"
                error={form.formState.errors.password?.message}
                {...form.register('password')}
              />

              {/* `loading` disables the button, so a slow network cannot
                  produce two sign-in attempts from one impatient double-tap. */}
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={signIn.isPending}
                loadingLabel={c.signingIn}
              >
                {signIn.isPending ? c.signingIn : c.submit}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-center text-sm text-content-secondary">
            {c.retailerHint}{' '}
            <Link
              href="/login"
              className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
            >
              {c.retailerHintLink}
            </Link>
          </p>
          <HelpPanel help={c.help} />
        </div>
      </div>
    </main>
  )
}
