# Foundation v1.0 — freeze checklist

Status of every foundation item. **The foundation is NOT ready to freeze**: one
critical item is outstanding.

Last updated at commit `51bd2b6`.

---

## Multi-tenancy

| Item                                        | Status       | Evidence                                                                                  |
| ------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `Company` as the tenant, with business mode | **Complete** | 2 tenants seeded, one per mode                                                            |
| `Warehouse`, `Customer`, `CompanyLink`      | **Complete** | In schema and migrated                                                                    |
| `companyId` on every business table         | **Complete** | 26 tables, backfilled inside the migration                                                |
| Row-Level Security policies                 | **Complete** | Every tenant table; verified a tenant cannot read another's rows with the `WHERE` removed |
| SHARED vs STRICT policy shapes              | **Complete** | Global catalogue readable by all; writes strict                                           |
| Boot-time coverage check                    | **Complete** | API refuses to start; already caught `company_auth_methods`                               |
| Tenant resolution strategies                | **Complete** | header → domain → subdomain → path → session → default                                    |
| Tenant context on every request             | **Complete** | `TenantMiddleware` before guards; whole request inside `run()`                            |
| Cross-tenant request rejection              | **Complete** | Verified: tenant A's session on tenant B's portal is refused                              |

## Database access

| Item                                          | Status       | Evidence                                                                     |
| --------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `TenantPrismaService` as the only tenant path | **Complete** | Lint exception list is auth + health only                                    |
| Search module migrated                        | **Complete** | Both raw SQL queries now under RLS                                           |
| Bulk engine migrated                          | **Complete** | Worker uses `runAs(job.companyId)`; verified on a 5,001-row import           |
| Admin module migrated                         | **Complete** | Every platform query wrapped in `runAsPlatform(reason)`, logged              |
| Handlers hold no client                       | **Complete** | All hooks receive the scoped `tx`; `PrismaTx` aliased from the tenancy layer |

## Authentication and authorisation

| Item                                | Status       | Evidence                                                                                                                           |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pluggable auth providers            | **Complete** | `UserIdentity` + registry; adding Google is one class                                                                              |
| Per-tenant auth methods             | **Complete** | `CompanyAuthMethod`; branding returns the offered list                                                                             |
| Access rules centralised            | **Complete** | Suspension, tenant and role checks live once, after every provider                                                                 |
| Permission keys + system roles      | **Complete** | 14 roles, 126 permissions seeded                                                                                                   |
| `PermissionGuard` registered        | **Complete** | Global, after `AuthGuard`                                                                                                          |
| Routes using `@RequirePermission()` | **Pending**  | Existing routes still use `@Roles()`. Not blocking: the guard and data are in place, and routes migrate as each module is touched. |

## White label

| Item                        | Status       | Evidence                                                           |
| --------------------------- | ------------ | ------------------------------------------------------------------ |
| Branding stored per company | **Complete** | Name, logo, colour, login image, support details                   |
| Public bootstrap endpoint   | **Complete** | `/tenant/branding`; verified per tenant                            |
| Web app consumes it         | **Pending**  | Endpoint exists; UI does not use it. Feature work, not foundation. |

## Architecture rules

| Item                                      | Status       | How                                            |
| ----------------------------------------- | ------------ | ---------------------------------------------- |
| No `PrismaService` in tenant modules      | **Complete** | Lint `no-restricted-imports`                   |
| All tenant data via `TenantPrismaService` | **Complete** | Same rule                                      |
| Controllers hold no business logic        | **Complete** | 30-line lint warning                           |
| Services transport-agnostic               | **Complete** | No `Request`/`Response`/cookies in any service |
| Every tenant table has a policy           | **Complete** | Enforced at boot                               |
| Documented                                | **Complete** | `docs/ARCHITECTURE.md`                         |

---

## Blocking freeze

### Retire `DistributorProfile` and `RetailerProfile` — **NOT STARTED**

Two parallel models for the same concepts are live:

| Old                  | New                     |
| -------------------- | ----------------------- |
| `DistributorProfile` | `Company` + `Warehouse` |
| `RetailerProfile`    | `Customer`              |

Every existing feature still reads the old ones. `InventoryItem.distributorId`,
`Order.distributorId` and `MedicineOffer.distributorId` all point at
`DistributorProfile`.

**Why this blocks the freeze:** it is exactly the problem the freeze is meant to
prevent. Every new module would have to decide which model to use, and different
authors would decide differently. Freezing with both present bakes the ambiguity
into everything built afterwards.

**Scope**, honestly:

1. Migration: one `Company` + `Warehouse` per `DistributorProfile`; one
   `Customer` per `RetailerProfile`; repoint the three foreign keys.
2. Rename `distributorId` → `warehouseId` across schema, services and the
   `medicine_offers` projection and its triggers.
3. Update roughly twenty source files, the seed, and the search read model.
4. Drop the two old tables.

Roughly the size of the bulk-engine migration. It was deliberately not started
in the previous commit rather than half-finished, because a partial migration
would leave _three_ models instead of two.

---

## Recommendation

Complete the item above, re-run this checklist, then freeze as **Foundation
v1.0**.

The two `Pending` items outside it — routes on `@RequirePermission()`, and the
web app consuming branding — are safe to leave. Both are additive: they change
no schema and no contract, so doing them during feature work carries no
architectural risk.
