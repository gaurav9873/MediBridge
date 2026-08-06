# MediBridge B2B

A B2B medicine procurement platform connecting pharmacy retailers with distributors.
Retailers search, order, and pay a 20% token to confirm; the remaining 80% is paid in
cash on delivery. Same-Day delivery is offered when a distributor is inside their
configured radius, otherwise Next-Day.

**Status:** Phases 0, 1 and 1.5 complete — foundation, database and design system.
Feature development starts at Phase 2.

---

## Getting started

Prerequisites: Node 20+, Docker Desktop.

```bash
cp .env.example .env
npm run setup      # installs, starts Postgres + Redis, migrates, seeds
npm run dev        # API on :4000, web on :3000
```

`npm run setup` is safe to re-run. If Docker Desktop is not running, start it first
(`open -a Docker`).

| URL                                       | What                                                 |
| ----------------------------------------- | ---------------------------------------------------- |
| http://localhost:3000                     | Web app — currently the design system reference page |
| http://localhost:4000/api/v1/health/ready | API health: database, PostGIS and Redis              |
| http://localhost:4000/docs                | Swagger API documentation                            |

### Signing in

Every seeded account uses the password **`Medibridge@123`** and signs in with a
10-digit mobile number.

| Role        | Mobile       | Page                              |
| ----------- | ------------ | --------------------------------- |
| Admin       | `9000000001` | http://localhost:3000/admin/login |
| Retailer    | `9000000020` | http://localhost:3000/login       |
| Distributor | `9000000010` | http://localhost:3000/login       |

**Full account list, database credentials and the seeded delivery geography:
[docs/DEV-ACCOUNTS.md](docs/DEV-ACCOUNTS.md).**

---

## Commands

| Command                     | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `npm run dev`               | Start everything in watch mode                  |
| `npm run build`             | Build all packages and apps                     |
| `npm run typecheck`         | Typecheck everything                            |
| `npm run lint`              | Lint everything                                 |
| `npm run format`            | Format with Prettier                            |
| `npm run db:up` / `db:down` | Start / stop Postgres and Redis                 |
| `npm run db:migrate`        | Create and apply a migration                    |
| `npm run db:seed`           | Reset and reseed development data               |
| `npm run db:studio`         | Browse the database in Prisma Studio            |
| `npm run db:reset`          | Destroy the containers and volumes, start fresh |

---

## Layout

```
MediBridge-B2B/
├── apps/
│   ├── api/            NestJS 11 · Prisma 7 · PostgreSQL 17 + PostGIS · Redis
│   └── web/            Next.js 16 · React 19 · Tailwind 4
├── packages/
│   ├── copy/           Every user-facing word in the product
│   ├── types/          Enums, Zod schemas, money helpers, API contract
│   ├── ui/             Design system
│   └── config/         Shared TypeScript configs
└── docs/
    ├── DEV-ACCOUNTS.md     Sign-in details for the seeded development data
    ├── BULK-OPERATIONS.md  The shared import/export engine, and why it is shaped that way
    ├── SEARCH-PERFORMANCE.md  How search stays fast as the catalogue grows, with measurements
    ├── UI-STANDARDS.md     The UX rules, and how the code enforces them
    └── DECISIONS.md        Architectural and product decisions, with reasoning
```

### The three shared packages

**`@medibridge/copy`** holds every label, helper text, empty state, success message,
validation error, page-help entry and onboarding tour. Nothing user-facing is written
inline in a component. This makes the entire product's wording reviewable in one place,
keeps it consistent, and means adding Hindi later is a new folder rather than a rewrite.

**`@medibridge/types`** holds the domain enums, the Zod schemas, and the API response
contract. The schemas run in **both** the browser and the server, so a retailer sees the
identical friendly sentence whether a check failed on their phone or in NestJS.

**`@medibridge/ui`** is the design system. Its components are shaped so the UX rules
are enforced by the type system — see [docs/UI-STANDARDS.md](docs/UI-STANDARDS.md).

---

## Architecture notes

**Money is always integer paise.** Never floats, never rupees in the database. A 20/80
split of a floating-point total drifts, and a drifting paisa becomes a balance the
retailer cannot pay exactly. See `packages/types/src/money.ts`.

**Inventory is batch-level.** Every `InventoryItem` is one batch of one medicine held by
one distributor, with its own expiry and price. Pharma requires a batch number and expiry
on every unit sold, and stock is picked oldest-expiry-first.

**Order lines are snapshots.** `OrderItem` copies the medicine name, batch, expiry, HSN
code and price at purchase time, so editing the catalogue can never rewrite someone's
order history or invoice.

**One cart can become several orders.** Items from different distributors are split into
separate `Order` rows under one `OrderGroup`. The retailer pays once; each distributor
fulfils and is settled independently.

**Geography is a generated column.** `addresses.location` is
`GENERATED ALWAYS AS ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)`, GiST-indexed,
derived from lat/lng so the two can never disagree. Radius checks are `ST_DWithin`, not
hand-rolled haversine.

**Search is a generated tsvector.** `medicines.searchVector` is weighted A/B/C/D across
name, brand, composition and strength, GIN-indexed, with `pg_trgm` for typo tolerance.

**Search reads a pre-aggregated projection, not the join.** `medicine_offers` holds one
trigger-maintained row per (medicine, distributor) with the best price already computed.
Measured at 200k medicines and 3M inventory rows, that took browse-nearby from 807 ms to
31 ms — and the work is now bounded by page size rather than catalogue size. See
[docs/SEARCH-PERFORMANCE.md](docs/SEARCH-PERFORMANCE.md).

**Invariants are enforced in the database too.** Selling price ≤ MRP, token + balance =
total, reserved ≤ quantity, and a payment belonging to exactly one parent are all CHECK
constraints — not only application rules. Application code can be bypassed by a script or
a future bug; money invariants are worth defending twice.

**No technical error ever reaches a user.** Every API failure carries a stable code that
maps to a sentence in the copy layer. `AllExceptionsFilter` catches everything — including
Prisma constraint violations and unhandled exceptions — logs the real error with a request
id, and returns only the friendly message.

---

## Product decisions currently in force

These were taken as the recommended defaults for the MVP and can be revisited:

- **Schedule X is blocked platform-wide.** Narcotics and psychotropics carry
  record-keeping duties (Form 2C register, duplicate prescriptions) that are out of MVP
  scope. Schedule H and H1 are allowed, since every buyer's drug licence is verified.
  A Schedule X medicine is seeded specifically so the block can be tested.
- **Distributors set their own selling price**, capped at MRP.
- **Marketplace settlement.** MediBridge collects the 20% token and pays distributors
  weekly, minus a platform fee. The 80% cash never passes through the platform.
- **Distributors deliver.** MediBridge tracks status and verifies handover with a
  4-digit code; there is no first-party logistics in the MVP.

---

## What is next

| Phase   | Scope                                                                               |
| ------- | ----------------------------------------------------------------------------------- |
| **2**   | Auth: OTP, JWT with refresh rotation, RBAC, licence verification gate               |
| **2.5** | **Bulk operations engine** — see [docs/BULK-OPERATIONS.md](docs/BULK-OPERATIONS.md) |
| **3**   | Catalogue: medicine master, distributor inventory, search                           |
| **4**   | Cart and orders: stock reservation, radius logic, multi-distributor split           |
| **5**   | Payments: Razorpay token flow, webhooks, refunds                                    |
| **6**   | Fulfilment: accept/pack/dispatch, FEFO picking, delivery OTP                        |
| **7**   | Notifications: SMS/email/WhatsApp on the queue built in 2.5                         |
| **8**   | Admin: users, medicine master, reports, settings                                    |
| **9**   | Testing and hardening                                                               |
| **10**  | Deployment and monitoring                                                           |

Phase 2.5 comes before the catalogue on purpose: the medicine master and
distributor inventory are the first two consumers of the bulk engine, and
building them first would mean two bespoke importers to unpick later.
