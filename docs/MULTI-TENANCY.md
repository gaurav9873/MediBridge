# Multi-tenant architecture

Turning MediBridge from one distributor's platform into a white-label SaaS that
many distributors can run their own business on.

This document is the design. Nothing here is built yet — it changes the shape of
29 tables, so it needs agreeing before code.

---

## The decision that comes before everything else

The original brief and this one describe **two different products**, and the
difference is not cosmetic.

|                        | Marketplace (what is built)                                  | Tenant portals (what this brief describes)                        |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Who sees what          | A retailer searches across **every** distributor near them   | A customer belongs to **one** company and sees only its catalogue |
| Price comparison       | The core feature — "18% below MRP, 3 sellers"                | Meaningless; there is one seller                                  |
| Cart                   | Splits across distributors into an `OrderGroup`              | Never splits across companies                                     |
| Radius                 | Which _distributor_ can deliver Same-Day                     | Which _warehouse of my company_ can                               |
| Who takes the money    | Platform collects the 20% token, settles distributors weekly | The company collects its own money                                |
| How the platform earns | A cut of every order                                         | A subscription from each company                                  |

> "Customers belong to only one company."

That single line retires cross-distributor price comparison, the multi-seller
cart split, and the marketplace settlement model — the three things the current
build is shaped around.

**This is not a reason to avoid the change.** It is a much larger business, and
the sequencing is right: a marketplace can be built on top of multi-tenancy
later (the marketplace is simply a tenant that aggregates), but multi-tenancy
cannot be retrofitted onto a marketplace cheaply. Doing tenancy first is
correct.

It does need saying out loud, because roughly a third of what exists changes
meaning, and the revenue model changes with it.

### Recommendation

Build **tenant portals** as the foundation. Keep marketplace behaviour as a
per-tenant _mode_ the platform can switch on later, not as the default. Concretely:

- A company can have many warehouses. The radius logic survives intact — it just
  picks the nearest warehouse of _that_ company rather than the nearest distributor.
- `medicine_offers` survives too, keyed on warehouse instead of distributor. It
  still answers "cheapest available near this customer", now within one company.
- `OrderGroup` survives as the multi-**warehouse** split.
- `Settlement` is retired for now and replaced by platform billing.

---

## Isolation: how a leak becomes impossible

> "Every query must automatically filter by Company ID. No company should ever
> be able to see another company's data."

There are three ways to do this, and only one of them is safe by construction.

| Approach                                        | Isolation                                      | Cost                                      | Verdict                             |
| ----------------------------------------------- | ---------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| `companyId` filter in application code          | One forgotten `where` leaks everything         | Cheapest                                  | **No**                              |
| **`companyId` + PostgreSQL Row-Level Security** | Database refuses to return other tenants' rows | Small per-request setup                   | **Yes**                             |
| Schema per tenant                               | Strong                                         | Migrations × N tenants, connection sprawl | Later, if a big customer demands it |
| Database per tenant                             | Strongest                                      | Operationally heavy at 50+ tenants        | Only for enterprise plans           |

Application-level filtering is how tenant data leaks happen. It only takes one
missed `where` in one endpoint, and this codebase already runs **raw SQL** for
search and PostGIS, where Prisma's typed filters do not help at all.

### Row-Level Security

Every tenant table gets `companyId`, and a policy the database enforces:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING ("companyId" = current_setting('app.company_id', true)::uuid);
```

The API sets the current company once per request, inside the transaction:

```sql
SET LOCAL app.company_id = '<uuid>';
```

After that, `SELECT * FROM orders` returns only that company's orders — from
Prisma, from raw SQL, from a mistaken query, from a bug. The wrong data is not
filtered out; it is never returned.

**Cost, honestly:** every request runs inside a transaction with one extra
`SET LOCAL`. With a pooled connection that is a few hundred microseconds. In
exchange, tenant isolation stops depending on every developer remembering
something.

### The role matters more than the policies

Postgres exempts **superusers** and roles with **`BYPASSRLS`** from every policy,
and `FORCE ROW LEVEL SECURITY` does not change that — it only subjects the table
owner. So a correct, complete set of policies protects nothing if the
application connects as the wrong role.

That is not hypothetical. This project ran that way: the API connected as the
owner, which was a superuser, and every policy was inert. Setting
`app.company_id` to one tenant and counting another tenant's rows returned all
of them.

Two roles, therefore:

| Role             | Privileges                        | Used by                             |
| ---------------- | --------------------------------- | ----------------------------------- |
| `medibridge`     | Owner. DDL. Bypasses RLS.         | Migrations, seed, tooling           |
| `medibridge_app` | DML only. `NOSUPERUSER`, `NOBYPASSRLS`. | The running API (`APP_DATABASE_URL`) |

And a boot check, because the failure mode is silence:

```
Row-Level Security applies to this connection (role: medibridge_app)
```

If that role could bypass RLS, the API **refuses to start**. `npm run
verify:isolation` performs the same checks as the application role, on demand.

### Three policy shapes

| Shape           | Rule                                            | Tables                                   |
| --------------- | ----------------------------------------------- | ---------------------------------------- |
| **STRICT**      | `companyId = current tenant`                    | Most tenant tables                       |
| **SHARED**      | `companyId IS NULL OR = current tenant`         | `medicines` — the global catalogue       |
| **MARKETPLACE** | STRICT, plus reads of linked sellers' rows      | `companies`, `warehouses`, `medicine_offers`, warehouse addresses |

MARKETPLACE exists because a seller is a tenant of its own. Without it, strict
isolation would hide a seller's shop window from the buyers meant to shop it.
It is a **`FOR SELECT`** policy only: permissive policies OR together for reads,
while `tenant_isolation` remains the only policy governing writes. A marketplace
reads its sellers' offers and writes none of them.

`inventory_items` is deliberately **not** marketplace-readable. The offer
projection is the shop window; batch numbers, costs and expiries stay private.

### Lookups from before a tenant exists

Three things happen before there is a tenant to scope by, and each is how the
tenant gets decided:

- resolving a host, domain or slug to a company
- fetching that company's branding for the login page
- identifying a user — the tenant is derived **from** the user

Scoping these would be circular, so they run through `runPreTenant()`: narrowly
named, unlogged, and distinct from `runAsPlatform()` which is for deliberate
platform-wide administration. What makes it safe is what follows — `AuthService`
refuses a credential whose company does not match the portal it arrived on.

---

## Data model changes

### New

```prisma
model Company {                      // the tenant
  id            String  @id
  name          String
  slug          String  @unique      // portal.abcpharma.com -> "abcpharma"
  status        CompanyStatus        // TRIAL | ACTIVE | SUSPENDED | CANCELLED
  gstNumber     String?
  drugLicenseNumber String?

  // White label
  logoUrl        String?
  brandColor     String?             // one seed colour; the design tokens derive the rest
  loginImageUrl  String?
  customDomain   String? @unique     // future

  planId         String
  trialEndsOn    DateTime?
  // ...
}

model Warehouse {                    // replaces "distributor location"
  id          String @id
  companyId   String
  name        String
  addressId   String                 // keeps the PostGIS geography + radius
  sameDayRadiusKm   Int
  sameDayCutoffTime String
  isActive    Boolean
}

model Customer {                     // what RetailerProfile becomes
  id          String @id
  companyId   String                 // belongs to exactly one company
  userId      String
  businessName String
  gstNumber   String?
  creditLimitPaise Int?              // B2B distribution needs this
  // Drug licence stays on Document, unchanged
}

model Role {                         // per-company, not a fixed enum
  id        String  @id
  companyId String?                  // null = a platform-wide system role
  name      String                   // "Warehouse Manager"
  isSystem  Boolean                  // seeded, not deletable
}

model Permission { key String @id }  // "orders.approve", "inventory.edit"
model RolePermission { roleId; permissionKey }
model UserRoleAssignment { userId; roleId; companyId }

model Plan { id; name; pricePaise; billingPeriod }
model PlanFeature { planId; featureKey; limit Int? }
model Subscription { companyId; planId; status; currentPeriodEnd }
```

### Changed

| Today                           | Becomes                                              |
| ------------------------------- | ---------------------------------------------------- |
| `DistributorProfile`            | `Company` + `Warehouse`                              |
| `RetailerProfile`               | `Customer` (scoped to a company)                     |
| `InventoryItem.distributorId`   | `warehouseId` + `companyId`                          |
| `UserRole` enum + `@Roles()`    | `Role` / `Permission`, guard checks permission keys  |
| `Settlement` / `SettlementItem` | Retired. Replaced by platform `Subscription` billing |
| `MedicineOffer.distributorId`   | `warehouseId`                                        |

### Unchanged

`Medicine` stays a **global** catalogue owned by the super admin — which is
already how it is built, and matches "Global Medicine Master" in the brief. A
company may add private products, so `Medicine.companyId` is nullable: null means
global, set means that company's own.

Also unchanged: `Document` (licences), `Address` and its PostGIS column,
`Order` / `OrderItem`, `Payment`, `Delivery`, `Notification`, `AuditLog`,
`BulkJob` — all simply gain `companyId`.

The **bulk engine, design system and copy layer need no structural change at
all.** The bulk handler contract already takes a `BulkScope`; it gains a
`companyId`. That is the payoff from having built it generically.

---

## An extensible catalogue without losing medicine safety

> "Medicine-specific validations should be domain rules rather than tightly
> coupled to the core platform."

```
Product            id, companyId?, productTypeId, name, brand, sku, hsnCode, gstRate
ProductType        MEDICINE | SURGICAL | DEVICE | LAB_CONSUMABLE | FMCG | VETERINARY
MedicineAttributes productId, composition, strength, form, schedule, isPrescriptionRequired
```

Medicine-specific fields go in a **typed satellite table, not JSONB.** JSONB is
tempting for "extensible", but `schedule` decides whether something may legally
be sold and `hsnCode` goes on every invoice — those need constraints, indexes
and foreign keys, which JSONB does not give. Genuinely open, per-type attributes
(a device's voltage, a consumable's sterility grade) do belong in JSONB.

Validation becomes a per-type rule module:

```ts
interface ProductTypeRules {
  type: ProductType
  attributeSchema: ZodType
  validateForSale(product, company): Issue[] // Schedule X block lives here
  requiresLicence(): boolean // medicines yes, FMCG no
}
```

The Schedule X block and licence gate become `MedicineRules`, not platform
rules — so a company selling only surgical items is not asked for a drug licence.

---

## White label

One seed colour per company, not a full theme editor. The design system already
derives every surface, border and state from tokens, so a company sets
`brandColor` and the whole portal follows — without letting anyone build an
unreadable palette.

| Configurable                     | How                                                                   |
| -------------------------------- | --------------------------------------------------------------------- |
| Name, logo, login background     | `Company` fields, served with the tenant bootstrap                    |
| Theme colour                     | One seed colour; tokens derive the ramp, contrast checked server-side |
| Email / SMS / WhatsApp templates | Per-company overrides layered over `@medibridge/copy` defaults        |
| Invoice design                   | Template id + logo; not a free-form editor                            |
| Domain mapping                   | Later. `slug.medibridge.in` first; custom domains need TLS automation |

**Subdomain resolution:** middleware reads the host, resolves the slug to a
company, and puts it in the request context before anything else runs. An unknown
subdomain gets a clear "this portal does not exist" page, not a 500.

---

## Migration path

Not a rewrite. Six ordered steps, each shippable.

| Step | What                                                                                                                     | Risk                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1    | Add `Company`, `Warehouse`, `Plan`, `Subscription`, `Role`, `Permission`. Create one company from the existing data.     | Low                                  |
| 2    | Add `companyId` to all 29 tables, backfilled to that company. Nullable first, then `NOT NULL`.                           | Low                                  |
| 3    | Enable RLS + policies. Add the Prisma extension and request context.                                                     | **Highest** — needs a test per table |
| 4    | `DistributorProfile` → `Company`+`Warehouse`; `RetailerProfile` → `Customer`. Rewrite the ~20 files that reference them. | High                                 |
| 5    | Replace the role enum with `Role`/`Permission`; seed system roles per company.                                           | Medium                               |
| 6    | White-label bootstrap, subdomain routing, plan feature gates.                                                            | Medium                               |

Steps 1–3 can land while the current app keeps working, because a single-company
deployment behaves identically. Step 4 is the breaking one.

**Cost, honestly:** steps 1–3 are roughly the size of the bulk engine. Step 4
touches every module. This is a substantial piece of work, not an afternoon —
and it is much cheaper now, at 29 tables and no production data, than in six
months.

---

## Decisions needed before step 1

1. **Marketplace or tenant portals?** If customers truly belong to one company,
   cross-distributor price comparison, the multi-seller cart split and the
   marketplace settlement model all retire. Confirm that is intended.

2. **Who collects the money?** If each company collects its own, the platform's
   revenue is subscriptions, and the 20/80 token becomes a _per-company
   configurable_ payment term rather than a platform rule. Should the 20% token
   stay the default for new companies?

3. **Is your own business tenant #1?** Recommended: yes. Running your own
   distribution as an ordinary tenant is the only reliable way to keep the
   white-label path honest.

4. **How many tenants in year one?** Under ~50 → shared schema with RLS, as
   designed. If an enterprise customer demands physical separation on day one,
   that changes step 3.

5. **Custom roles in the MVP, or fixed roles per company?** Fixed roles
   (Sales, Warehouse, Accounts…) with a permission map is much less work than a
   role builder, and covers most distributors. The schema above supports both;
   only the UI differs.
