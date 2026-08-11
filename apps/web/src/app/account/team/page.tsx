'use client'

import { copy } from '@medibridge/copy'
import { type EmployeeInviteInput, employeeInviteSchema } from '@medibridge/types'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageShell,
  Skeleton,
  TextField,
  notify,
} from '@medibridge/ui'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { ApiClientError, api, applyFieldErrors } from '@/lib/api-client'
import { useSession } from '@/lib/use-session'

interface EmployeeSummary {
  id: string
  fullName: string
  phone: string
  email: string
  roleKey: string | null
  roleName: string | null
  accountStatus: string
  lastLoginAt: string | null
  isSelf: boolean
}

const ROLES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'COMPANY_ADMIN', label: 'Company Admin', hint: 'Can do everything, including adding staff' },
  { key: 'WAREHOUSE_MANAGER', label: 'Warehouse Manager', hint: 'Stock and dispatch' },
  { key: 'INVENTORY_MANAGER', label: 'Inventory Manager', hint: 'Stock and prices' },
  { key: 'SALES_EXECUTIVE', label: 'Sales Executive', hint: 'Orders and customers' },
  { key: 'ACCOUNTANT', label: 'Accountant', hint: 'Payments and settlements' },
  { key: 'CUSTOMER_SUPPORT', label: 'Customer Support', hint: 'Orders and problem reports' },
  { key: 'DELIVERY_STAFF', label: 'Delivery Staff', hint: 'Deliveries assigned to them' },
]

/**
 * The people who work here.
 *
 * Everyone gets their own sign-in. Sharing the owner's password means the
 * audit log records "the owner did it" for everything, which is worse than
 * useless the day something needs explaining.
 */
export default function TeamPage(): React.JSX.Element {
  const { isLoading: sessionLoading, isSignedIn } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [temporaryPassword, setTemporaryPassword] = React.useState<{ name: string; password: string }>()

  React.useEffect(() => {
    if (!sessionLoading && !isSignedIn) router.replace('/login')
  }, [sessionLoading, isSignedIn, router])

  const employees = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get<EmployeeSummary[]>('/onboarding/employees'),
    enabled: isSignedIn,
  })

  const form = useForm<EmployeeInviteInput>({
    resolver: zodResolver(employeeInviteSchema),
    defaultValues: { fullName: '', phone: '', email: '', roleKey: 'SALES_EXECUTIVE' },
    mode: 'onBlur',
  })

  const invite = useMutation({
    mutationFn: (values: EmployeeInviteInput) =>
      api.post<{ employee: EmployeeSummary; temporaryPassword: string }>(
        '/onboarding/employees',
        values,
      ),
    onSuccess: (result) => {
      // Shown once, deliberately: it is never stored anywhere it could be read
      // again, and the person is expected to change it on first sign-in.
      setTemporaryPassword({
        name: result.employee.fullName,
        password: result.temporaryPassword,
      })
      form.reset()
      void queryClient.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (error) => {
      if (!applyFieldErrors(error, form.setError)) {
        notify.error(error instanceof ApiClientError ? error.message : undefined)
      }
    },
  })

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Array<{ id: string; key: string; name: string }>>('/roles'),
    enabled: isSignedIn,
  })

  const assign = useMutation({
    mutationFn: (input: { userId: string; roleId: string }) => api.post('/roles/assign', input),
    onSuccess: () => {
      notify.success('Role updated. It applies from their next action.')
      void queryClient.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (error) => notify.error(error instanceof ApiClientError ? error.message : undefined),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/onboarding/employees/${id}`),
    onSuccess: () => {
      notify.success('That person no longer has access.')
      void queryClient.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (error) => notify.error(error instanceof ApiClientError ? error.message : undefined),
  })

  if (sessionLoading || employees.isLoading) {
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
        page={copy.account.team.page}
        help={copy.account.team.help}
      >
        {temporaryPassword ? (
          <Alert tone="success" title={`${temporaryPassword.name} can now sign in.`}>
            Their temporary password is{' '}
            <span className="font-mono font-semibold">{temporaryPassword.password}</span>. Write it
            down now — we cannot show it again. Ask them to change it after signing in.
          </Alert>
        ) : null}

        <Card>
          <CardHeader title="Add someone" description="They can sign in straight away." />
          <CardBody>
            <form
              onSubmit={form.handleSubmit((values) => invite.mutate(values))}
              className="flex flex-col gap-5"
              noValidate
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  field={{ label: 'Full Name', helperText: 'Their name, as you would write it.' }}
                  required
                  error={form.formState.errors.fullName?.message}
                  {...form.register('fullName')}
                />
                <TextField
                  field={{
                    label: 'Mobile Number',
                    helperText: 'They will sign in with this number.',
                  }}
                  required
                  type="tel"
                  inputMode="numeric"
                  error={form.formState.errors.phone?.message}
                  {...form.register('phone')}
                />
                <TextField
                  field={{ label: 'Email Address', helperText: 'For their notifications.' }}
                  required
                  type="email"
                  error={form.formState.errors.email?.message}
                  {...form.register('email')}
                />
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-sm font-medium text-content-primary"
                    htmlFor="employee-role"
                  >
                    Role
                  </label>
                  <select
                    id="employee-role"
                    className="min-h-(--size-touch) rounded-(--radius-md) border border-border-default bg-surface-raised px-3 text-base text-content-primary"
                    {...form.register('roleKey')}
                  >
                    {ROLES.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-content-secondary">
                    {ROLES.find((role) => role.key === form.watch('roleKey'))?.hint}
                  </p>
                </div>
              </div>

              <Button type="submit" icon={<UserPlus />} loading={invite.isPending}>
                Add to Team
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Everyone here" description="Including you." />
          <CardBody>
            {(employees.data ?? []).length === 0 ? (
              <EmptyState
                icon={<Users />}
                copy={{
                  title: 'Just you so far',
                  body: 'Add a colleague above and they can sign in with their own number.',
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {/* Cards on a phone, a row per person on a wider screen. */}
                {(employees.data ?? []).map((employee) => (
                  <div
                    key={employee.id}
                    className="flex flex-col gap-3 rounded-(--radius-lg) border border-border-default p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-content-primary">
                        {employee.fullName}
                        {employee.isSelf ? (
                          <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                            You
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-content-secondary">
                        {employee.roleName ?? 'No role'} · {employee.phone} ·{' '}
                        {employee.lastLoginAt ? 'has signed in' : 'never signed in'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {/* Changing someone's role is the common edit; removing
                          them is the rare one. */}
                      <select
                        aria-label={`Role for ${employee.fullName}`}
                        className="min-h-(--size-touch) rounded-(--radius-md) border border-border-default bg-surface-raised px-2 text-sm text-content-primary"
                        value={roles.data?.find((r) => r.key === employee.roleKey)?.id ?? ''}
                        onChange={(event) =>
                          assign.mutate({ userId: employee.id, roleId: event.target.value })
                        }
                      >
                        <option value="" disabled>
                          No role
                        </option>
                        {(roles.data ?? []).map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      {employee.isSelf ? null : (
                        <Button
                          variant="secondary"
                          size="md"
                          loading={remove.isPending && remove.variables === employee.id}
                          onClick={() => remove.mutate(employee.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </PageShell>
    </main>
  )
}
