'use client'

import { copy } from '@medibridge/copy'
import { type SessionUser, type SignInInput, signInSchema } from '@medibridge/types'
import { Button, Card, CardBody, HelpPanel, TextField, notify } from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pill } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'

/**
 * Retailer and distributor sign-in.
 *
 * Same shared schema and the same shape as the admin page — only the endpoint
 * and the copy differ. Keeping them as two pages rather than one with a role
 * toggle means neither portal has to explain the other.
 */
export default function LoginPage(): React.JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const c = copy.auth.signIn

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { phone: '', password: '' },
    mode: 'onBlur',
  })

  const signIn = useMutation({
    mutationFn: (values: SignInInput) => api.post<{ user: SessionUser }>('/auth/sign-in', values),
    onSuccess: (result) => {
      queryClient.setQueryData(['session'], result.user)
      notify.success(c.success)
      router.replace('/account')
    },
    onError: (error) => {
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
            <Pill className="size-7" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
              {c.page.title}
            </h1>
            <p className="text-base text-content-secondary">{c.page.subtitle}</p>
          </div>
        </div>

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

              <Button type="submit" size="lg" fullWidth loading={signIn.isPending}>
                {c.submit}
              </Button>

              {/* Both routes out of a forgotten password, next to the box that
                  just failed rather than buried in the help panel. */}
              <div className="flex flex-col items-center gap-2 text-sm">
                <Link
                  href="/forgot-password"
                  className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
                >
                  {c.forgotPassword}
                </Link>
                <Link
                  href="/login/otp"
                  className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
                >
                  {c.useOtpInstead}
                </Link>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-center text-sm text-content-secondary">
            {c.noAccount}{' '}
            <Link
              href="/signup"
              className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
            >
              {c.createAccount}
            </Link>
          </p>
          <p className="text-center text-sm text-content-secondary">
            MediBridge staff?{' '}
            <Link
              href="/admin/login"
              className="font-medium text-brand-600 underline underline-offset-4 dark:text-brand-400"
            >
              Sign in to the admin panel
            </Link>
          </p>
          <HelpPanel help={c.help} />
        </div>
      </div>
    </main>
  )
}
