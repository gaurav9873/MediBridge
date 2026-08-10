# Local testing — Phase 2

Everything below runs on your machine. No staging, no cloud, no accounts to
create anywhere.

Work through it in order: **Start**, then **Automated checks**, then the
**Manual checklist**. Anything that does not behave as written is a bug — write
down what you did and what happened instead.

---

## 1. Start

```bash
cd ~/Development/MediBridge-B2B
open -a Docker          # if Docker Desktop is not already running
npm run db:up           # Postgres + Redis
npm run db:seed         # fresh data, every time you want a clean slate
npm run dev             # API and web together
```

| What | Where |
| --- | --- |
| Web app | http://localhost:3100 |
| API docs (Swagger) | http://localhost:4100/docs |
| API health | http://localhost:4100/api/v1/health/ready |
| Database | `localhost:5433` |

> Ports are deliberately 3100 / 4100 / 5433 so this project never fights
> another one on your machine. 3000, 4000 and 5432 are left free.

**Every account signs in with `Medibridge@123`** using a 10-digit mobile
number — never an email.

`npm run db:seed` wipes and reloads. Run it whenever you want to start over;
it is the fix if anything gets into a strange state.

---

## 2. Automated checks

Run these first. All five must pass before manual testing tells you anything
useful.

```bash
npm run typecheck          # expect: no output
npx eslint apps packages   # expect: 0 errors (warnings are fine)
npm run build              # expect: Tasks: 4 successful
npm run test               # expect: Tests: 12 passed
npm run verify:isolation   # expect: All 16 isolation checks passed
```

`verify:isolation` is the important one. It connects as the **restricted**
application role and proves one tenant cannot read or write another's rows. It
is the check that would have caught the bug where Row-Level Security was
switched on but never actually applied.

---

## 3. Accounts

| Mobile | Who | Sign in at |
| --- | --- | --- |
| `9000000001` | Priya Nair — platform admin | `/admin/login` |
| `9000000010` | MedPlus Wholesale — distributor, Pune, 25 km | `/login` |
| `9000000011` | Wellness Distributors — distributor, Mumbai, 15 km | `/login` |
| `9000000020` | Sharma Medical Store — retailer, Pune | `/login` |
| `9000000021` | Kumar Pharmacy — retailer, Mumbai | `/login` |
| `9000000022` | New Life Chemists — **awaiting approval** | `/login` |

`9000000022` exists so you can see the "we are checking your documents" state
without registering anything.

**No SMS is sent locally.** Every code appears on screen in a yellow
"Development mode" box, and also in the API log.

---

## 4. Manual checklist

Tick each one. Estimated: 30–40 minutes for all of it.

### 4.1 Authentication — Phase 2.1

- [ ] Sign in at `/login` with `9000000020` / `Medibridge@123` → lands on `/account`
- [ ] Sign out, then **Forgot your password?** → enter `9000000020` → code shows on screen → set a new password → sign in with it
- [ ] `/login` → **Sign in with an OTP instead** → enter `9000000020` → code appears → sign in without any password
- [ ] Enter a **wrong** code → "That code is not correct"
- [ ] Ask for a code twice quickly → "Please wait N more seconds"
- [ ] Use the **same code twice** → refused the second time
- [ ] `/signup` → create an account with a new number → confirm the code → returns to `/login`
- [ ] Sign in, go to `/account` → **Where you are signed in** lists your device
- [ ] Sign in from a second browser → both appear → **Sign out of all other devices** → only one left

> After the password reset, re-run `npm run db:seed` to put `9000000020` back
> to `Medibridge@123`.

### 4.2 Registration and onboarding — Phase 2.2

- [ ] Sign up as a **Retailer** with a new number → confirm phone → `/onboarding` shows step 1
- [ ] Fill business details with a GST number → step moves to Documents
- [ ] Try a GST number already used (`27AADCS9876P1ZQ`) → refused clearly
- [ ] Upload a drug licence with an **expiry in the past** → refused on the spot
- [ ] Upload licence + GST (any PDF or photo under 5 MB) → step becomes "waiting"
- [ ] Sign up as a **Distributor**, complete business details → check the database:

```bash
docker compose exec postgres psql -U medibridge -d medibridge -c \
  "SELECT name, slug, \"businessMode\" FROM companies ORDER BY \"createdAt\";"
```
  A new company should exist for that distributor — a seller is its own tenant.
- [ ] Sign out and sign back in as that distributor → **it must work** (a seller can use the marketplace's login page)
- [ ] `/account/team` → add a colleague → temporary password shown **once** → sign in as them in another browser
- [ ] Try to remove yourself → refused

### 4.3 Company setup — Phase 2.3

Sign in as `9000000010` (MedPlus).

- [ ] `/account/company` shows five sections: Business details, Payment terms, Warehouses, Bank account, Branding
- [ ] Change **Token Percentage** to 30 → saves → reload → still 30
- [ ] Bank account: enter IFSC `WRONG` → "An IFSC has 11 characters"
- [ ] Enter a valid account number → reload → only the **last four digits** show
- [ ] Add a warehouse (any city, use the location button) → appears in the list
- [ ] **Pause** a warehouse → shows "Paused" → **Resume**
- [ ] Try to **Close** the Hadapsar warehouse (it holds stock) → refused, and told to pause instead
- [ ] Close the empty warehouse you just added → works

### 4.4 Licence verification — Phase 2.4

Sign in as `9000000001` at `/admin/login`.

- [ ] `/admin/licences` shows documents waiting, and licences expiring
- [ ] Click **View** on a document → the file opens
- [ ] **Accept** only the drug licence of a pending applicant → toast says the account activates once the other is accepted too
- [ ] **Send back** their GST certificate with a reason
- [ ] Sign in as that applicant → `/onboarding` shows **your exact reason**
- [ ] Upload a replacement → back in the admin queue, old reason gone
- [ ] Accept it → toast says the account is now active
- [ ] Sign in as them → `/account` no longer shows "awaiting approval"

### 4.5 Roles and permissions — Phase 2.5

Sign in as `9000000010`.

- [ ] `/account/roles` lists seven built-in roles with permission counts
- [ ] Open **Warehouse Manager** → untick something → save → reload → it stayed
- [ ] **Create a role** with two or three permissions → appears in the list
- [ ] Try to delete a **built-in** role → refused
- [ ] `/account/team` → change a colleague's role from the dropdown
- [ ] Delete your new custom role while nobody holds it → works
- [ ] Assign it to someone, then try to delete → refused, and told how many hold it
- [ ] Open **Company Admin** → untick "Manage roles" → **refused**, with the reason

#### Permission enforcement (now active)

Routes check permissions, so removing one really does close a door.

- [ ] As `9000000010`, open **Company Admin** → untick **"Change business settings"** → save
- [ ] Go to `/account/company` → **refused**. The API returns `FORBIDDEN`
- [ ] `/account/roles`, `/account/team` and `/account/profile` still work — they need different permissions, and your own profile needs none
- [ ] Tick it back → `/account/company` works **immediately**, with no sign-out

> Your own profile is deliberately never permission-gated. Everyone may change
> their own name, email and mobile number.

### 4.6 Profile — Phase 2.6

Sign in as `9000000021` (Kumar Pharmacy).

- [ ] `/account/profile` shows your name, business, role and mobile number
- [ ] Change your name and email → save → reload → kept
- [ ] Use an email another account already has → refused
- [ ] **Change my mobile number** → enter a new one → code appears → confirm
- [ ] Sign out → sign in with the **new** number → works
- [ ] Sign in with the **old** number → refused
- [ ] Add a second address → **Use by default** → the badge moves
- [ ] Remove the non-default address → works
- [ ] Try to remove the last one → refused
- [ ] Turn off SMS for "Stock is running low" → reload → still off

> Re-seed afterwards to restore `9000000021`.

### 4.7 Mobile layout

The quickest honest check is a real phone-sized viewport, not a narrow window.

In Chrome: **⌥⌘I** → the phone icon (**⇧⌘M**) → choose **iPhone SE (375×667)**.

Walk these and confirm **nothing scrolls sideways** and every button is
reachable with a thumb:

- [ ] `/login`, `/signup`, `/forgot-password`, `/login/otp`
- [ ] `/account`, `/account/profile`, `/account/company`, `/account/team`, `/account/roles`
- [ ] `/admin`, `/admin/licences`, `/admin/approvals`, `/admin/users`

Then repeat at **iPad (768px)** and a normal desktop window.

### 4.8 Tenant isolation — the one that matters most

This is what stops one pharmacy seeing another's business.

```bash
npm run verify:isolation
```

All 16 checks must pass. Then confirm by hand:

- [ ] Sign in as `9000000010` (MedPlus) and note what `/account/company` shows
- [ ] Sign in as `9000000011` (Wellness) → **completely different** warehouse, bank details and settings
- [ ] As MedPlus, open a Wellness warehouse id directly:

```bash
# take a Wellness warehouse id
docker compose exec postgres psql -U medibridge -d medibridge -t -c \
  "SELECT w.id FROM warehouses w JOIN companies c ON c.id=w.\"companyId\" WHERE c.slug='wellness-distributors';"
```
  Then, signed in as MedPlus, `PATCH /company/warehouses/<that id>` from Swagger →
  must return **NOT_FOUND**, not "forbidden". The row is invisible, not merely off-limits.

- [ ] In Swagger as MedPlus, `GET /roles` → only MedPlus roles
- [ ] Sign in as a retailer → search returns **both** distributors' prices (a marketplace can see its sellers' shop windows), but no batch-level stock

---

## 5. Things that are deliberately not built yet

Do not report these as bugs:

- **No ordering.** Cart, checkout, orders and payments are Phase 3. A retailer can search but not buy.
- **No medicine add/edit screen.** The medicine master UI is Phase 3; today medicines change through bulk import.
- **No SMS or email actually sends.** Codes appear on screen; notification preferences are stored but nothing dispatches yet.
- **No super admin account.** `9000000001` is a tenant admin, not a platform owner.
- **The web app ignores tenant branding.** The endpoint works; the UI does not use it yet.
- **No CI.** By your decision — deployment work is deferred.
- **No audit log viewer.** Every change is recorded in `audit_logs` with who, what and the before/after — but there is no screen for it. Read it with `npm run db:studio`.
- **No email confirmation.** Changing your email clears the "verified" flag, but nothing sends a confirmation link yet. The mobile number does have a code flow.

---

## 6. When something is wrong

Collect these three things and it will usually be diagnosable straight away:

```bash
# 1. what the API said
tail -50 /tmp/api.log        # or the terminal running npm run dev

# 2. what the browser said
#    ⌥⌘I -> Console tab, and the Network tab entry for the failed request

# 3. what the data looks like
npm run db:studio            # opens Prisma Studio
```

Every API error carries a `requestId`. Quoting it makes the matching log line
findable immediately.

### If things get stuck

```bash
npm run db:seed              # reset the data, keep the schema
npm run db:reset             # destroy the containers and volumes, start over
```

---

## 7. What "done" looks like

Phase 2 passes locally when:

- all five automated checks pass
- every box in section 4 is ticked
- nothing scrolls sideways at 375px
- one tenant cannot see another's anything

At that point Phase 3 can start: medicine master, inventory, warehouse, bulk
import UI, search, cart, orders, payments, delivery, notifications.
