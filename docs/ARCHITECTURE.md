# Architecture

The platform foundation: how a request finds its tenant, proves who it is, is
authorised, and reaches the database without ever being able to see another
tenant's data.

Read this before adding a module. The rules at the end are not style
preferences — two of them are enforced by lint, and one by the API refusing to
start.

---

## Tenant request flow

```
  HTTP request
      │
      ▼
  TenantMiddleware                    runs BEFORE guards, so everything
      │  resolve tenant from          downstream already knows the tenant
      │  header → domain → subdomain
      │  → /t/slug → default
      ▼
  TenantContextService.run({ companyId })     AsyncLocalStorage — ambient, so
      │                                        no service takes a companyId
      │                                        parameter and none can forget one
      ▼
  AuthGuard          reads the session cookie, loads the user,
      │              REFINES the tenant: most API calls carry no host or
      │              path hint, so this is where they actually get scoped.
      │              A portal/session mismatch is refused here.
      ▼
  PermissionGuard    checks permission keys held via roles
      │
      ▼
  Controller         translates HTTP ⇄ service call. No business logic.
      │
      ▼
  Service            business rules. Transport-agnostic.
      │
      ▼
  TenantPrismaService.run(tx => …)
      │  BEGIN
      │  SELECT set_config('app.company_id', <id>, true)   ← transaction-local
      │  …queries…
      │  COMMIT
      ▼
  PostgreSQL + Row-Level Security     the database itself refuses other
                                      tenants' rows
```

**Why middleware and not an interceptor:** Nest runs middleware before guards.
An interceptor would run _after_ `AuthGuard`, which already needs the tenant.

**Why AsyncLocalStorage:** with 40 tables, threading a `companyId` parameter
through every call means one forgotten argument is a leak, and changing the
signature touches every service.

---

## Authentication flow

```
  POST /auth/sign-in
      │
      ▼
  AuthProviderRegistry.identify(credentials, companyId)
      │
      ├── is this method built?          AuthMethod → provider
      ├── does THIS TENANT offer it?     CompanyAuthMethod
      │
      ▼
  Provider.identify()                    PASSWORD today; OTP, GOOGLE,
      │  looks up UserIdentity           MICROSOFT, SSO, API_TOKEN slot in
      │  verifies the secret             here unchanged
      ▼
  IdentityResult { userId }              ← the provider's ONLY job
      │
      ▼
  AuthService — the access rules, once, for every method:
      │   • account suspended?
      │   • signing in on the wrong tenant's portal?
      │   • wrong role for this portal?
      ▼
  TokenService                           access JWT + rotating refresh token,
      │                                  both httpOnly cookies
      ▼
  Session
```

**The load-bearing separation:** a provider answers _"which user is this?"_ and
nothing else. Every access rule lives after the providers, so adding Google
cannot accidentally skip the suspension check — there is nowhere to skip it
from.

**Identities, not a password column.** `User.passwordHash` assumed one login
method forever. A user now has many `UserIdentity` rows; adding a method is a
new row type.

---

## Authorization flow

```
  @RequirePermission(Permission.ORDER_ACCEPT)
      │
      ▼
  PermissionGuard
      │  user → UserRoleAssignment → Role → RolePermission
      ▼
  Set<permission key>  ⊇  required?   → allow / FORBIDDEN
```

Guards check **permission keys**, never role names. The seven fixed roles are
bundles of keys seeded per company:

| Role              | Holds                                        |
| ----------------- | -------------------------------------------- |
| Company Admin     | everything except `platform.*`               |
| Sales Executive   | customers, orders, accept                    |
| Warehouse Manager | inventory, dispatch, delivery, bulk import   |
| Inventory Manager | products, inventory, bulk import, reports    |
| Accountant        | orders, payments, invoices, reports          |
| Delivery Staff    | delivery, order view                         |
| Customer Support  | read-only across customers, orders, delivery |

Custom roles later are rows in the same table with `isSystem = false`. No guard
and no table changes — which is why the MVP can ship fixed roles without
painting itself into a corner.

---

## RLS flow

```
  Policy on every tenant table:

    USING (
      current_setting('app.bypass_rls', true) = 'on'
      OR "companyId" = nullif(current_setting('app.company_id', true), '')::uuid
    )
```

Two shapes, because a NULL `companyId` means two different things:

| Shape      | Tables                  | NULL means                               |
| ---------- | ----------------------- | ---------------------------------------- |
| **SHARED** | `medicines`, `settings` | platform-owned, readable by every tenant |
| **STRICT** | everything else         | platform-only, invisible to tenants      |

Writes are strict in both, so a tenant cannot insert into the global catalogue
by leaving the column empty. Verified: the database rejects it.

**Transaction-local, always.** `set_config(..., true)` scopes the setting to the
transaction. A plain `SET` would persist on the pooled connection and leak into
whoever borrows it next.

**Checked at boot.** `unprotected_tenant_tables()` returns any table with a
`companyId` and no policy. The API refuses to start if it returns anything —
this already caught `company_auth_methods` shipping without a policy.

---

## Database access flow

```
  Tenant data          Service → TenantPrismaService.run()      RLS applies
  Background job       Worker  → TenantPrismaService.runAs(id)  RLS applies
  Before a tenant      Auth,   → runPreTenant()                 RLS bypassed
                       resolver
  Platform-wide        Admin   → runAsPlatform(reason)          RLS bypassed, logged
  Infrastructure       PrismaService                            job bookkeeping only
```

**Two database roles.** The API connects as `medibridge_app`
(`APP_DATABASE_URL`), which has DML and neither `SUPERUSER` nor `BYPASSRLS`.
Migrations and the seed connect as the owner (`DATABASE_URL`). This is not
tidiness: Postgres exempts superusers from every policy, and the API ran as one
for a while, which made every tenant policy inert. `TenantPrismaService` now
refuses to boot as a role that can bypass RLS.

`runPreTenant()` covers the three lookups that legitimately precede tenancy —
resolving a host to a company, reading that company's branding, and identifying
a user. Scoping them would be circular. It is separate from `runAsPlatform()`
so that "we had no tenant yet" never gets confused with "we chose to read
everything".

One direct `PrismaService` import in a feature service is a cross-tenant leak
that no test would notice, because the query looks perfectly correct — so lint
forbids it. The exception list is four files: `tenant-prisma.service.ts`, which
wraps the client; `token.service.ts` and `password.provider.ts`, whose tables
have no `companyId` to scope by; and the health controller.

---

## Module dependencies

```
                    ┌─────────────┐
                    │  Tenancy    │  global
                    │  context ·  │
                    │  resolver · │
                    │  capability │
                    └──────┬──────┘
                           │ every module depends on it
        ┌──────────┬───────┼────────┬──────────┐
        ▼          ▼       ▼        ▼          ▼
     ┌──────┐  ┌──────┐ ┌─────┐ ┌──────┐  ┌────────┐
     │ Auth │  │ Bulk │ │Admin│ │Search│  │ Health │
     └──────┘  └──────┘ └─────┘ └──────┘  └────────┘
        │          │       │        │
        └──────────┴───────┴────────┘
                    ▼
            ┌───────────────┐
            │ Prisma· Redis │  infrastructure
            └───────────────┘

  @medibridge/types  ← contracts, shared with the web app
  @medibridge/copy   ← every user-facing word
```

Nothing depends on Auth except through the guards, and no feature module
depends on another. A module that needs another's data calls its **service**,
never its repository or its tables.

---

## Service dependency rules

```
  Controller  ──▶  Service  ──▶  TenantPrismaService  ──▶  Postgres
   (HTTP)         (rules)          (isolation)

  Worker      ──▶  Service          same service, no HTTP
  Mobile/API  ──▶  Controller ──▶   same service
```

A service never sees `Request`, `Response`, cookies or headers. That is what
lets the mobile app, the public API and background jobs reuse it instead of
re-implementing the rules — the bulk engine already proves this, running the
same handlers from an HTTP upload and from the worker process.

---

## The rules

**1. Tenant modules must never import `PrismaService`.**
Use `TenantPrismaService`. _Enforced:_ `no-restricted-imports` in
`eslint.config.mjs`. Exceptions are listed there with reasons.

**2. All tenant data access goes through `TenantPrismaService`.**
`run()` in a request, `runAs(companyId)` in a job, `runAsPlatform(reason)` for
deliberate platform-wide reads.

**3. Business services stay transport-agnostic.**
No `Request`, no cookies, no HTTP status codes. Inputs are plain objects,
outputs are DTOs, failures are `AppException` with a code.

**4. Controllers hold no business logic.**
Parse, call a service, shape the response. _Enforced:_ a 30-line warning per
controller method.

**5. Every tenant table carries `companyId` and a policy.**
_Enforced:_ the API refuses to start otherwise.

**6. User-facing text comes from `@medibridge/copy`; validation from
`@medibridge/types`.**
So the browser and the server never disagree about wording.

---

## Known gaps

Honest list, as of this commit:

| Gap                                      | Impact                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **No CI**                                | Nothing re-runs `typecheck`, lint, build, the drift guard or `verify:isolation` on push. This is why three false "verified" claims survived. |
| **No automated tests**                   | `jest` is configured, zero spec files. Tests begin with Phase 2 per MODULE-STANDARD.md; isolation is covered by `verify:isolation`.         |
| `@Roles()` still used on existing routes | `PermissionGuard` is registered and roles are seeded, but no route uses `@RequirePermission()` yet.                                         |
| Web app is **not tenant-aware**          | `/tenant/branding` exists and is verified per tenant; the UI does not consume it.                                                           |
| **No platform-owner account**            | `runAsPlatform()` and the `PLATFORM_*` keys exist, but no user has `companyId = NULL`, so nothing reaches them by login.                    |
| Medicine rules are not a module          | Specified in MULTI-TENANCY.md; still inside the medicine bulk handler.                                                                     |
