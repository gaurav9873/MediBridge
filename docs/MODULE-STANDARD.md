# Module standard

From Phase 2 onwards, a module is **not done** until every line below is true.

The point is to avoid the two failure modes that show up months later: a backend
with no usable screen, and a screen wired to nothing. One module, end to end,
before the next one starts.

---

## Definition of done

A module ships when **all ten** are true. Nine of ten is not done.

| #   | Item                  | What "done" means                                                                              |
| --- | --------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | **Backend APIs**      | Endpoints exist, are documented in Swagger, and return the `{ success, data }` envelope        |
| 2   | **Frontend UI**       | Every endpoint a user needs has a screen; nothing is API-only                                  |
| 3   | **Mobile-responsive** | Checked at 390px, 768px and 1280px. Tables become cards; the primary action is thumb-reachable |
| 4   | **Validation**        | Shared Zod schema in `@medibridge/types`, used by both the browser and the server              |
| 5   | **Help text**         | Every field has `helperText`; every page has `PageHelp`. Enforced by the component types       |
| 6   | **Friendly errors**   | Every failure path has a copy-layer sentence. No technical error reaches a user                |
| 7   | **Audit logging**     | Every state change writes an `AuditLog` row with actor, entity and before/after                |
| 8   | **Permissions**       | Routes use `@RequirePermission()`; the permission key exists and is in a system role           |
| 9   | **Unit tests**        | The business rules, not the framework. See below                                               |
| 10  | **Documentation**     | A section in the module's own doc, or in `docs/` if it introduces a concept                    |

---

## What to test, and what not to

Nine of the ten items above are mechanical. This one needs judgement, so it is
worth being specific.

**Test the rules that would cost money or break the law if wrong:**

- money arithmetic — a token/balance split must always sum back to the total
- state machines — an order cannot go from `PACKED` back to `CANCELLED`
- compliance gates — a Schedule X medicine must never become sellable
- tenant isolation — a service called with tenant A's context must never return
  tenant B's rows
- anything with a `HAVING`, a `reduce`, or a date comparison in it

**Do not test:** that Prisma saves a row, that Nest routes a request, that a
required field is required. Those are the framework's tests, not ours.

A module with three tests covering its actual rules is better than thirty
covering its getters.

---

## Order of work within a module

Backend and UI in the same pass, not in separate phases:

```
1. copy         the words first — writing them surfaces the flows
2. types        Zod schema + DTOs, shared by both sides
3. schema       migration if needed; run the drift guard
4. service      business rules, transport-agnostic, TenantPrismaService only
5. controller   thin: parse, call, respond
6. UI           screens using the design system's enforced components
7. tests        the rules from the list above
8. verify       run it in a browser at all three widths
```

Writing the copy first is not ceremony. Naming every empty state, error and
confirmation forces the edge cases out before any code exists — and they are
the cases that otherwise get discovered in production.

---

## Architecture rules still apply

Everything in [ARCHITECTURE.md](ARCHITECTURE.md) holds for every new module:

- never import `PrismaService` — lint blocks it
- all tenant data through `TenantPrismaService`
- services take plain objects and return DTOs; no `Request`, no cookies
- controllers hold no business logic
- user-facing text from `@medibridge/copy`, validation from `@medibridge/types`

A module that breaks one of these is not "done with a caveat". It is not done.

---

## Phase 2 order

Each module is finished end to end before the next begins.

| #   | Module                        | Notes                                                                                                                                                                                           |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Authentication completion** | OTP provider, sign-up flow, password reset, login UX, session management. The provider registry, identities and tenant-aware sign-in already exist — this fills the gaps rather than rebuilding |
| 2   | **Registration & onboarding** | Company, customer and employee registration                                                                                                                                                     |
| 3   | **Company setup wizard**      | Profile, warehouses, business settings, payment terms, branding                                                                                                                                 |
| 4   | **Licence verification**      | Upload, review, approve/reject, expiry tracking. An approvals screen exists and will be reworked onto `Customer`                                                                                |
| 5   | **Roles & permissions UI**    | The data model and guard are done; this is the screens                                                                                                                                          |
| 6   | **Profile management**        | User, company and warehouse profiles                                                                                                                                                            |

Then, and only then: medicine master, inventory, warehouse, bulk import UI,
search, cart, orders, payments, delivery, notifications.

---

## What already exists

So Phase 2 does not rebuild it:

| Already built                                            | Where                           |
| -------------------------------------------------------- | ------------------------------- |
| Pluggable auth providers + `UserIdentity`                | `auth/providers/`               |
| Tenant-aware sign-in, cross-tenant rejection             | `auth/auth.service.ts`          |
| Session cookies + refresh rotation with replay detection | `auth/token.service.ts`         |
| Permission guard, keys, 7 seeded system roles            | `auth/permission.guard.ts`      |
| Tenant resolution + white-label bootstrap                | `tenancy/`                      |
| Capability and payment-term resolution                   | `tenancy/capability.service.ts` |
| Design system with enforced help text and empty states   | `packages/ui`                   |
| Bulk engine (backend complete, wizard UI built)          | `bulk/`, `apps/web/.../imports` |
| Search with the offer projection                         | `search/`                       |

Phase 2 module 1 is genuinely small because of this. Modules 2–6 are mostly new.
