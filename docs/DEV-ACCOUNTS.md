# Development accounts

Sign-in details for the seeded development data.

> **Development only.** These accounts exist only in your local database, created
> by `npm run db:seed`. The shared password below is a convenience for local
> testing and must never be used on staging or production. Nothing here is a real
> credential.

## Password

Every seeded account uses the same password:

```
Medibridge@123
```

You sign in with a **10-digit mobile number**, not an email address.

## Accounts

### Admin — sign in at `/admin/login`

| Mobile       | Name       | Email               |
| ------------ | ---------- | ------------------- |
| `9000000001` | Priya Nair | admin@medibridge.in |

### Distributors — sign in at `/login`

| Mobile       | Business                  | City             | Same-Day radius | Cut-off |
| ------------ | ------------------------- | ---------------- | --------------- | ------- |
| `9000000010` | MedPlus Wholesale Pvt Ltd | Pune (Hadapsar)  | 25 km           | 14:00   |
| `9000000011` | Wellness Distributors LLP | Mumbai (Andheri) | 15 km           | 12:00   |

### Retailers — sign in at `/login`

| Mobile       | Business             | City             | Status                               |
| ------------ | -------------------- | ---------------- | ------------------------------------ |
| `9000000020` | Sharma Medical Store | Pune (Camp)      | Active, licence valid                |
| `9000000021` | Kumar Pharmacy       | Mumbai (Andheri) | Active, licence valid                |
| `9000000022` | New Life Chemists    | Thane (Kalyan)   | **Awaiting approval** — cannot order |

`9000000022` exists on purpose: it is how you test the verification gate and the
"we are checking your documents" screens without having to register a new account.

## Which portal accepts which account

The two sign-in pages are not interchangeable. A retailer typing their details
into `/admin/login` gets the ordinary "mobile number or password is not correct"
message — deliberately, so the page cannot be used to discover which numbers have
admin access.

| Page           | Accepts                      |
| -------------- | ---------------------------- |
| `/admin/login` | `ADMIN` only                 |
| `/login`       | `RETAILER` and `DISTRIBUTOR` |

## Delivery geography

The seeded addresses are real coordinates, chosen so the Same-Day radius logic
produces a mix of outcomes without any setup:

| Retailer                | Distributor       | Distance | Result     |
| ----------------------- | ----------------- | -------- | ---------- |
| Sharma Medical (Pune)   | MedPlus (Pune)    | 5.0 km   | `SAME_DAY` |
| Sharma Medical (Pune)   | Wellness (Mumbai) | 125.4 km | `NEXT_DAY` |
| Kumar Pharmacy (Mumbai) | Wellness (Mumbai) | 4.9 km   | `SAME_DAY` |
| Kumar Pharmacy (Mumbai) | MedPlus (Pune)    | 134.8 km | `NEXT_DAY` |

## Tenants

Four companies are seeded. A distributor is a **tenant of its own**, not a row
inside MediBridge's tenant — its staff, stock and payouts belong to it, and
Row-Level Security keeps one seller out of another's data.

| Company                     | Mode                  | What it is                            |
| --------------------------- | --------------------- | ------------------------------------- |
| `MediBridge`                | `MARKETPLACE`         | Tenant #1 — the marketplace operator  |
| `HealthPlus Distributors`   | `PRIVATE_DISTRIBUTOR` | The other mode, so both have real data |
| `MedPlus Wholesale Pvt Ltd` | `MARKETPLACE`         | Seller, linked to MediBridge          |
| `Wellness Distributors LLP` | `MARKETPLACE`         | Seller, linked to MediBridge          |

Retailers are `Customer` rows on MediBridge; the two distributors' logins belong
to their own companies. To act as a specific tenant against the API, send its id:

```bash
curl -H "x-tenant-id: <company uuid>" http://localhost:4100/api/v1/tenant/branding
```

## Database access

**Two roles, deliberately.** The application must not be able to bypass
Row-Level Security — for a while it could, and every tenant policy was inert as
a result.

| Role             | Use it for                                    | Password             |
| ---------------- | --------------------------------------------- | -------------------- |
| `medibridge`     | Migrations, seed, DBeaver, Prisma Studio      | `medibridge_dev`     |
| `medibridge_app` | The running API only (`APP_DATABASE_URL`)     | `medibridge_app_dev` |

| Field    | Value        |
| -------- | ------------ |
| Host     | `localhost`  |
| Port     | `5433`       |
| Database | `medibridge` |

`medibridge` is the owner and **bypasses RLS** — which is what makes it useful
for browsing, and useless for testing isolation. To check isolation, use the
application role:

```bash
npm run verify:isolation
```

Prisma Studio (`npm run db:studio`) reads `DATABASE_URL`, so it sees everything.
Treat it as a viewer.

## Changing the password

The password is defined in [`apps/api/prisma/seed.ts`](../apps/api/prisma/seed.ts)
and can be overridden per-run:

```bash
SEED_PASSWORD='YourOwnPassword1' npm run db:seed
```

If you change it, update this file too — it is the only place the team looks.

## Resetting

```bash
npm run db:seed      # wipes and reloads the data, keeps the schema
```

Re-running the seed recreates every account above with a freshly hashed password,
so this is the fix if a sign-in ever stops working.
