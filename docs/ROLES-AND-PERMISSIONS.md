# Roles and permissions

Phase 2.5. Who can do what, inside one company.

---

## Per company, not global

Roles are rows scoped to a company. Two companies can both have a "Warehouse
Manager" meaning slightly different things, and one editing theirs must never
touch the other's. Row-Level Security enforces that — another company's role is
not merely forbidden, it is invisible. A `PATCH` at one returns `NOT_FOUND`.

The seven system roles are seeded per company. They cannot be renamed or
deleted, because the platform assumes they exist. Their **permissions can still
be changed**: a company knowing its own business better than we do is the normal
case, not the exception.

## The platform boundary

Four `platform.*` keys — companies, plans, the global catalogue and read-all —
exist for the MediBridge team and **no company role may hold them**.

That is enforced in two places, both structural rather than by naming:

1. `RoleService` refuses any permission outside `COMPANY_PERMISSIONS`, so a
   company admin holding `ROLE_MANAGE` cannot POST `["platform.catalogue"]` and
   grant it to themselves. The request body is plain strings; without this check
   it was a privilege escalation.
2. The only role carrying them, `PLATFORM_OWNER`, is seeded on the platform
   tenant alone — deliberately **not** part of `SystemRole`, which is created
   inside every company.

This is what gates the global medicine catalogue. `PRODUCT_MANAGE` is not enough
and never was: `COMPANY_ADMIN` bundles every non-platform key, so every
distributor's owner holds it, and the catalogue is one shared list where editing
a row edits everybody's.

## Two guards worth having

**Company Admin cannot lose "Manage roles".** It is the one permission that can
grant permissions back, including on this screen. Removing it locks the company
out of its own settings permanently.

**A role held by somebody cannot be deleted.** The message says how many people
hold it and where to move them.

## The catalogue lives with the code

`PERMISSION_GROUPS` in `@medibridge/types` is the list of what exists, grouped
and in plain words. It is read from there rather than the database, because
these are keys the guards check against: a key in the database that no guard
reads would be a lie on the screen.

`role.service.spec.ts` holds that together — eight tests that fail if a
permission has no label, a label names a key that does not exist, a
platform-only key is offered to a company or reaches a seeded company role, the
platform role loses the catalogue key, or `COMPANY_ADMIN` loses `ROLE_MANAGE`.
None of those show up until someone is wrongly allowed or wrongly refused.

## Performance

**The permission lookup is cached.** `PermissionGuard` runs on every protected
route, and answering "may they?" meant a two-level join — assignments to roles
to permissions — before the handler did anything.

Measured locally: **0.47 ms from Postgres, 0.38 ms from Redis.** A 1.2x
improvement, which is honest and small. Localhost Postgres is fast and the join
is tiny. Where it actually pays:

- a managed database at 1–5 ms round trip makes this 5–15x
- a Redis GET does not consume a database connection, and connections are the
  scarce resource under load, not milliseconds

Invalidation is **explicit**, not a short TTL, so a permission taken away
applies to the very next request:

| When | What is forgotten |
| --- | --- |
| A role is assigned to a user | That user |
| A role's permissions are edited | Everyone holding it |
| A role is deleted | Everyone holding it |

The one-hour TTL is a backstop for a missed invalidation, not the mechanism.
Holders are looked up in the database rather than found by scanning Redis:
`SCAN` over a production keyspace to find three users is the kind of thing that
looks fine until the keyspace is large.

**The roles list is one query.** Permissions and member counts come back as
nested selects rather than a count per role — seven roles would otherwise be
fifteen round trips, and the page would slow down every time a company added a
custom role.

**The catalogue is cached forever in the browser** (`staleTime: Infinity`). It
ships with the code, so it cannot change while someone is looking at it.

## Endpoints

| Route | What |
| --- | --- |
| `GET /roles` | Roles with permissions and member counts |
| `GET /roles/permissions` | The catalogue, grouped |
| `POST /roles` | Create one of the company's own |
| `PATCH /roles/:id` | Change what it can do |
| `DELETE /roles/:id` | Delete a custom role |
| `POST /roles/assign` | Give a team member a role |

## Screens

| Route | What |
| --- | --- |
| `/account/roles` | Every role, edited in place |
| `/account/team` | Assign a role beside the person it applies to |

One role per person keeps "what can they do?" answerable by looking at one
word. `UserRoleAssignment` is a join table, so stacking several later needs a
different screen, not a migration.

Verified at 390px, 768px and 1280px with no horizontal overflow.
