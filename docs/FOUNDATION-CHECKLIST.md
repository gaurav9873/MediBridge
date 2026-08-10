# Foundation v1.0 — freeze checklist

Status of every foundation item, re-run at commit `e4e27a1` after Step 4 and
the Row-Level Security enforcement fix.

**Read this first.** The previous revision of this document marked nine items
"Complete — verified". Three of them did not work at all. They are listed under
[What the last audit got wrong](#what-the-last-audit-got-wrong), because how a
review fails matters more than its result.

Every **Pass** below now names the command that proves it. Anything that cannot
be re-run on demand is marked **Asserted**, not **Complete**.

---

## What the last audit got wrong

| Claimed                                                                            | Reality                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| "Verified a tenant cannot read another's rows with the `WHERE` removed"            | The API connected as a SUPERUSER with `BYPASSRLS`. **No policy applied to anything.** |
| "Cross-tenant request rejection — verified: tenant A's session on tenant B's portal is refused" | `AuthController` never passed `companyId`, so the check was dead code.                |
| "Public bootstrap endpoint — verified per tenant"                                  | True, but it broke the moment RLS started applying, and nothing would have caught it. |

The common cause: **the checks were performed as the database owner.** Postgres
exempts superusers and `BYPASSRLS` roles from every policy, so testing isolation
as the owner tests nothing. Every isolation claim looked correct and was.

The fix was not only the code. `npm run verify:isolation` now performs these
checks as the restricted application role, and the API refuses to boot as a role
that can bypass RLS. A document cannot fail; those can.

---

## Multi-tenancy

| Item                                        | Status       | Proof                                                            |
| ------------------------------------------- | ------------ | ---------------------------------------------------------------- |
| `Company` as the tenant, with business mode | **Complete** | 4 tenants seeded across both modes                               |
| `Warehouse`, `Customer`, `CompanyLink`      | **Complete** | The only models for their concepts — see Step 4 below            |
| `companyId` on every business table         | **Complete** | 26 tables                                                        |
| Row-Level Security policies                 | **Complete** | `verify:isolation` — 16 checks                                   |
| **RLS actually applies to the application** | **Complete** | App runs as `medibridge_app` (NOSUPERUSER, NOBYPASSRLS)          |
| Boot refuses a bypassing role               | **Complete** | `assertRlsApplies()` throws; log line names the role every boot  |
| SHARED vs STRICT vs MARKETPLACE shapes      | **Complete** | Global catalogue shared; seller offers readable; writes strict   |
| Boot-time policy coverage check             | **Complete** | `unprotected_tenant_tables()`; already caught `company_auth_methods` |
| Tenant resolution strategies                | **Complete** | header → domain → subdomain → path → session → default           |
| Tenant context on every request             | **Complete** | `TenantMiddleware` before guards                                 |
| Cross-tenant sign-in rejection              | **Complete** | Re-tested after the controller fix; refused on both portals      |

## Database access

| Item                                          | Status       | Proof                                                                 |
| --------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `TenantPrismaService` as the only tenant path | **Complete** | Lint exception list is down to 4 files that hold the raw client       |
| Owner and application roles separated         | **Complete** | `DATABASE_URL` migrates; `APP_DATABASE_URL` serves                    |
| Pre-tenant reads are explicit                 | **Complete** | `runPreTenant()` — auth, tenant resolution, branding, capabilities    |
| Search module under RLS                       | **Complete** | Both raw SQL queries; verified returning 2 sellers post-fix           |
| Bulk engine under RLS                         | **Complete** | Worker uses `runAs(job.companyId)`                                    |
| Admin module                                  | **Complete** | Platform queries wrapped in `runAsPlatform(reason)`, logged           |
| Handlers hold no client                       | **Complete** | All hooks receive the scoped `tx`                                     |

## Authentication and authorisation

| Item                                | Status       | Proof                                                                     |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------- |
| Pluggable auth providers            | **Complete** | `UserIdentity` + registry; adding Google is one class                     |
| Per-tenant auth methods             | **Complete** | `CompanyAuthMethod`; branding returns the offered list                    |
| Access rules centralised            | **Complete** | Suspension, tenant and role checks run once, after every provider         |
| Sign-in carries the portal's tenant | **Complete** | Controller passes `companyId`; cross-tenant sign-in refused               |
| Permission keys + system roles      | **Complete** | 7 system roles seeded per company, 4 companies                            |
| `PermissionGuard` registered        | **Complete** | Global, after `AuthGuard`                                                 |
| Routes using `@RequirePermission()` | **Complete** | 19 routes across company, roles, employees, bulk, search and admin review. Verified by removing a permission and watching the route refuse. |

## Product architecture

| Item                                     | Status       | Notes                                                                |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------- |
| Single source of truth for **Company**   | **Complete** | `Company` is the only tenant model                                   |
| Single source of truth for **Warehouse** | **Complete** | `DistributorProfile` dropped; stock and orders point at `Warehouse`  |
| Single source of truth for **Customer**  | **Complete** | `RetailerProfile` dropped                                            |
| Single source of truth for **Users**     | **Complete** | One `User`; login methods are `UserIdentity` rows                    |
| No duplicate business entities           | **Complete** | Both pairs retired in one commit                                     |
| A seller is a tenant                     | **Complete** | Own company, own staff, own stock, linked by `CompanyLink`           |
| Business rules configuration-driven      | **Complete** | Payment terms, capabilities, radius, cut-off, token % are all data   |
| Both business modes on one architecture  | **Complete** | A private portal is a marketplace with one seller                    |

## Extensibility

| Item                                               | Status                  | How a change lands                                                     |
| -------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| New payment method without touching order logic    | **Complete**            | `PaymentTermType` + `splitByTerms()`                                   |
| New auth method without touching the sign-in flow  | **Complete**            | One `AuthProviderContract` class + a registry line                     |
| New tenant resolution strategy                     | **Complete**            | One `TenantResolutionStrategyContract` class                           |
| New bulk operation for any module                  | **Complete**            | One `BulkHandler` + a registry line                                    |
| A seller with several warehouses                   | **Complete**            | Modelled; the import wizard picks the default until it offers a choice |
| New delivery provider                              | **Not started**         | Delivery is modelled, no provider abstraction. Feature work.           |
| New product category without core changes          | **Designed, not built** | Medicine rules still live in the medicine handler.                     |
| White-label branding is configuration              | **Complete**            | Verified per tenant: MediBridge teal, HealthPlus purple                |

## Quality gates

| Gate                                                       | Result                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| No `TODO` / `FIXME` / `HACK` / `XXX` in foundation modules | **Pass** — zero                                                 |
| No `@ts-ignore` or `eslint-disable` escapes                | **Pass** — zero                                                 |
| `npm run typecheck`                                        | **Pass** — 0 errors                                             |
| `npx eslint packages apps`                                 | **Pass** — 0 errors (6 pre-existing controller-length warnings) |
| `npm run build`                                            | **Pass** — 4/4 tasks                                            |
| All 11 migrations replay on an empty database              | **Pass** — verified on a scratch database, twice                |
| Seed reproduces the migrated topology exactly              | **Pass** — same 4 companies, same counts                        |
| Same-Day radius assertions                                 | **Pass** — Pune→Pune SAME_DAY, Pune→Mumbai NEXT_DAY             |
| Compliance: no active Schedule X                           | **Pass** — 0                                                    |
| `npm run verify:isolation`                                 | **Pass** — 16/16                                                |
| No duplicate domain models                                 | **Pass** — both retired                                         |

---

## Outstanding, and honest about it

None of these block the freeze. All are additive: no schema change, no contract
change.

| Item                                | Why it is not blocking                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **No automated test suite**         | `jest` is configured and there are zero spec files. Per MODULE-STANDARD.md tests begin with Phase 2. The rules most worth testing — money splits, state machines, compliance gates — belong to modules that do not exist yet. Tenant isolation, the one foundation invariant that already had teeth, is covered by `verify:isolation`. |
| **No CI**                           | No workflow runs `typecheck`, `lint`, `build`, the drift guard or `verify:isolation` on push. Everything is run by hand. This is the single largest remaining gap, and the reason a broken isolation claim survived. |
| **Web app ignores branding**        | Endpoint verified per tenant; the UI does not consume it yet.                                                   |
| **No platform-owner account**       | `runAsPlatform()` and the `PLATFORM_*` keys exist, but no user has `companyId = NULL`, so nothing exercises them by login. Phase 2.5. |
| **Medicine rules not a module**     | Specified in MULTI-TENANCY.md; still inside the medicine handler.                                               |

---

## Verdict

Every blocking item is closed and every claim above is backed by a command that
can be re-run. **Foundation v1.0 is ready to freeze.**

Before starting Phase 2, run all of these and expect them to pass:

```bash
npm run typecheck && npx eslint packages apps && npm run build
npm run verify:isolation
```

The strongest recommendation coming out of this audit: **put those commands in
CI before writing Phase 2.** Three false "verified" claims survived precisely
because nothing re-ran them.
