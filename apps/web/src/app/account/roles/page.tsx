'use client'

import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageShell,
  Skeleton,
  notify,
} from '@medibridge/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ApiClientError, api } from '@/lib/api-client'
import { useSession } from '@/lib/use-session'

interface RoleSummary {
  id: string
  key: string
  name: string
  isSystem: boolean
  permissions: string[]
  memberCount: number
}

interface PermissionGroup {
  key: string
  label: string
  permissions: Array<{ key: string; label: string }>
}

/**
 * Who can do what.
 *
 * The permission catalogue is fetched once and kept — it ships with the code,
 * so it cannot change while someone is looking at it. The roles are refetched
 * after every edit, because they can.
 *
 * Editing happens in place rather than on a second page: the question being
 * answered is "what should a Warehouse Manager be able to do?", and answering
 * it while looking at the other roles is the whole point.
 */
export default function RolesPage(): React.JSX.Element {
  const { isLoading: sessionLoading, isSignedIn } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [editing, setEditing] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    if (!sessionLoading && !isSignedIn) router.replace('/login')
  }, [sessionLoading, isSignedIn, router])

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleSummary[]>('/roles'),
    enabled: isSignedIn,
  })

  const catalogue = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => api.get<PermissionGroup[]>('/roles/permissions'),
    enabled: isSignedIn,
    // Ships with the code, so it cannot go stale within a session.
    staleTime: Infinity,
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['roles'] })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      notify.success('Role deleted.')
      refresh()
    },
    onError: (error) => {
      const message =
        error instanceof ApiClientError ? (error.fields?.[0]?.message ?? error.message) : undefined
      notify.error(message)
    },
  })

  if (sessionLoading || roles.isLoading || catalogue.isLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }

  const groups = catalogue.data ?? []
  const labelFor = new Map(
    groups.flatMap((group) => group.permissions.map((entry) => [entry.key, entry.label] as const)),
  )

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageShell
        page={{
          title: 'Roles and Permissions',
          subtitle: 'Decide what each kind of person on your team can do.',
        }}
        help={{
          whatIsThis:
            'A role is a bundle of things someone is allowed to do. Give each team member the role closest to their job, and they see only what they need.',
          topics: [
            {
              question: 'Can I change what a built-in role does?',
              answer:
                'Yes. The seven built-in roles are a starting point — tick and untick whatever suits how you actually work. You cannot rename or delete them.',
            },
            {
              question: 'Why can Company Admin not lose "Manage roles"?',
              answer:
                'Because nobody would be able to change permissions again, including this screen. It is the one setting that can lock you out permanently.',
            },
            {
              question: 'Why will it not let me delete a role?',
              answer:
                'Someone still holds it. Move them to another role on the team page first, then delete it.',
            },
            {
              question: 'When does a permission change take effect?',
              answer:
                'Immediately. The next thing that person does is checked against the new list.',
            },
          ],
        }}
      >
        {(roles.data ?? []).map((role) =>
          editing === role.id ? (
            <RoleEditor
              key={role.id}
              role={role}
              groups={groups}
              onDone={() => {
                setEditing(null)
                refresh()
              }}
            />
          ) : (
            <Card key={role.id}>
              <CardHeader
                title={role.name}
                description={`${role.permissions.length} permissions · ${role.memberCount} ${role.memberCount === 1 ? 'person' : 'people'}${role.isSystem ? ' · built-in' : ''}`}
              />
              <CardBody>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.length === 0 ? (
                      <span className="text-sm text-content-secondary">
                        No permissions yet — this role can do nothing.
                      </span>
                    ) : (
                      role.permissions.map((permission) => (
                        <span
                          key={permission}
                          className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-content-secondary"
                        >
                          {labelFor.get(permission) ?? permission}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="md" onClick={() => setEditing(role.id)}>
                      Change permissions
                    </Button>
                    {role.isSystem ? null : (
                      <Button
                        variant="secondary"
                        size="md"
                        loading={remove.isPending && remove.variables === role.id}
                        onClick={() => remove.mutate(role.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          ),
        )}

        {creating ? (
          <RoleEditor
            groups={groups}
            onDone={() => {
              setCreating(false)
              refresh()
            }}
          />
        ) : (
          <Button variant="secondary" icon={<Plus />} onClick={() => setCreating(true)}>
            Create a role
          </Button>
        )}

        <Alert tone="info" title="Changes apply straight away">
          The next thing someone does is checked against their new permissions — nobody has to sign
          out and back in.
        </Alert>
      </PageShell>
    </main>
  )
}

/**
 * Ticking permissions for one role.
 *
 * Grouped the way the catalogue groups them, because "Orders" is how someone
 * thinks about it and `order.dispatch` is not.
 */
function RoleEditor({
  role,
  groups,
  onDone,
}: {
  role?: RoleSummary
  groups: PermissionGroup[]
  onDone: () => void
}): React.JSX.Element {
  const [name, setName] = React.useState(role?.name ?? '')
  const [chosen, setChosen] = React.useState<Set<string>>(new Set(role?.permissions ?? []))

  const save = useMutation({
    mutationFn: () => {
      const body = { name, permissions: [...chosen] }
      return role
        ? api.patch<RoleSummary[]>(`/roles/${role.id}`, body)
        : api.post<RoleSummary[]>('/roles', body)
    },
    onSuccess: () => {
      notify.success(role ? 'Permissions updated.' : 'Role created.')
      onDone()
    },
    onError: (error) => {
      const message =
        error instanceof ApiClientError ? (error.fields?.[0]?.message ?? error.message) : undefined
      notify.error(message)
    },
  })

  const toggle = (key: string) =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Card>
      <CardHeader
        title={role ? `Editing ${role.name}` : 'New role'}
        description={
          role?.isSystem
            ? 'A built-in role. You can change what it does, but not its name.'
            : 'Give it a name your team will recognise.'
        }
      />
      <CardBody>
        <div className="flex flex-col gap-5">
          {role?.isSystem ? null : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-content-primary" htmlFor="role-name">
                Role Name
              </label>
              <input
                id="role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Night Shift Packer"
                className="min-h-[--size-touch] rounded-[--radius-md] border border-border-default bg-surface-raised px-3 text-base text-content-primary"
              />
              <p className="text-sm text-content-secondary">
                Something that describes the job, not the person.
              </p>
            </div>
          )}

          {groups.map((group) => (
            <fieldset key={group.key} className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-content-primary">{group.label}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <label
                    key={permission.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[--radius-md] border border-border-default p-2.5"
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={chosen.has(permission.key)}
                      onChange={() => toggle(permission.key)}
                    />
                    <span className="text-sm text-content-primary">{permission.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex gap-3">
            <Button
              icon={<ShieldCheck />}
              loading={save.isPending}
              disabled={!role?.isSystem && name.trim().length < 2}
              onClick={() => save.mutate()}
            >
              {role ? 'Save permissions' : 'Create role'}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
