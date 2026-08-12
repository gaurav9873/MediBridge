# Local testing — Phases 2, 3.1, 3.2 and 3.3

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
npm run test               # expect: Tests: 63 passed
npm run verify:isolation   # expect: All 18 isolation checks passed
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

### 4.7 Medicine master — Phase 3.1

The shared catalogue and its six screens. Full detail in
[MEDICINE-MASTER.md](MEDICINE-MASTER.md).

Sign in as the admin (`9000000001`) at `/admin/login` unless a step says
otherwise.

#### Browse, search and filter — `/admin/medicines`

- [ ] The list loads 25 medicines, sorted A–Z, with "Showing 1–25 of 54"
- [ ] Type `dolo` in Search → narrows to Dolo 650 without a full-page skeleton
- [ ] Type `zzzz` → the empty state says **"No medicines match what you are
      looking for"** (not "no medicines yet") and offers **Clear filters**
- [ ] Set Type = Syrup → 2 results; set Drug Schedule = Schedule H → 29
- [ ] Set Status = Archived → only archived rows; Status = Both → everything
- [ ] **Next** / **Previous** move through pages; Previous is disabled on page 1
- [ ] Changing any filter resets you to page 1 (never "page 4 of 1")

#### Add — `/admin/medicines/new`

- [ ] Every field has a label, a one-line explanation and, where useful, an example
- [ ] Submit empty → friendly messages per field, nothing technical
- [ ] HSN code `12` → **"Please enter a valid 4 to 8 digit HSN code."**
- [ ] Set Drug Schedule = Schedule H → "Needs a Prescription" ticks itself and
      locks, with a sentence saying why
- [ ] Set Drug Schedule = Schedule X → a red panel explains the Form 2C register
      and the submit button is disabled
- [ ] Add `Dolo 650` / brand `Dolo` / strength `650mg` / pack `15 tablets` →
      refused **under the name field** with "…is already in the catalogue…"
- [ ] Add something genuinely new → toast, and you land on its edit screen

#### Edit, archive and restore — `/admin/medicines/[id]`

- [ ] Open Dolo 650 → form prefilled, status badge, "2 distributors stock this"
- [ ] Rename it to an existing medicine's exact identity → refused with
      "Merge them instead of keeping both."
- [ ] **Archive** → the confirmation warns about the 2 sellers holding stock,
      and confirming is refused with a sentence naming the count
- [ ] Archive a medicine nobody stocks → succeeds; the banner says it is archived
- [ ] **Restore** → it comes back

#### Duplicate review — `/admin/medicines/[id]/duplicates`

Set this up first, as the admin:

```bash
# Add a near-duplicate of Dolo 650 from Swagger, or:
#   POST /medicines  { "name":"Dolo-650","brand":"Micro Labs",
#     "composition":"Paracetamol 650mg","form":"TABLET","strength":"650 mg",
#     "hsnCode":"30049099","gstRate":12,"schedule":"NONE" }
```

- [ ] Open the new medicine → **Check duplicates** → Dolo 650 appears, tagged
      "Looks similar" with a percentage
- [ ] A medicine with no near-misses shows "Nothing looks like a duplicate"
- [ ] Nothing on this screen changes any data

#### Merge — `/admin/medicines/[id]/merge/[otherId]`

- [ ] **Compare and merge** shows both rows field by field
- [ ] Fields that differ are tinted; identical ones are not
- [ ] **Swap which one is kept** exchanges the two panels
- [ ] Confirming shows a dialog naming both medicines and the stock to move
- [ ] After merging: the survivor keeps the stock, the other is **archived**
      (search for it with Status = Archived — it is not deleted)
- [ ] Merging a medicine into itself is refused

#### Requests — distributor side

Sign in as `9000000010` (MedPlus) at `/login`, then **Medicine Requests** on
`/account`.

- [ ] Ask for `Dolo 650` / brand `Dolo` → answered immediately with **"Good news
      — this is already on the list"**, no queue, no waiting
- [ ] Ask for something genuinely missing → toast, and it appears as
      **"Being checked"**
- [ ] Name and brand are required; everything else is marked optional

#### Requests — admin side — `/admin/medicines/requests`

- [ ] The queue shows both tenants' requests, oldest first, with who asked and
      from which company
- [ ] **Refuse** with a 3-character reason → refused, "at least 10 characters"
- [ ] **Refuse** with a real sentence → the request leaves the queue
- [ ] **Add to the list** opens the full add form, prefilled, with "What was
      requested" shown above it
- [ ] Completing it creates the medicine and lands you on it
- [ ] Back as the distributor: the approved one reads **"Added to the list"**,
      the refused one shows your reason **verbatim**

#### Permission checks

The catalogue is gated on `platform.catalogue`, which **no company role can
hold** — not on a role name. The seeded admin holds it through `PLATFORM_OWNER`,
seeded on the MediBridge tenant alone.

With the distributor (`9000000010`) signed in, from Swagger or `curl`:

```bash
# allowed — every seller and buyer can read the catalogue
GET  /medicines
GET  /medicines/{id}/duplicates
GET  /medicines/requests/mine
POST /medicines/requests

# refused with FORBIDDEN — writing needs PRODUCT_MANAGE *and* the ADMIN role
POST  /medicines
PATCH /medicines/{id}
POST  /medicines/{id}/archive
POST  /medicines/merge
GET   /medicines/requests/pending
```

- [ ] All four reads succeed; all five writes return **FORBIDDEN**
- [ ] A company admin at a distributor holds `PRODUCT_MANAGE` and is *still*
      refused — the catalogue is shared, so `platform.catalogue` gates it

Then try to escalate, still as the distributor:

- [ ] `PATCH /roles/{their COMPANY_ADMIN id}` with
      `permissions: ["role.manage", "platform.catalogue"]` → **FORBIDDEN**,
      "reserved for the MediBridge platform team"
- [ ] `POST /roles` with `permissions: ["platform.catalogue"]` → **FORBIDDEN**
- [ ] `POST /roles` with `permissions: ["order.view"]` → still works, so the
      check blocks platform keys rather than role editing

#### Tenant isolation

- [ ] As MedPlus (`9000000010`), `/account/medicine-requests` shows **only**
      MedPlus requests
- [ ] As Wellness (`9000000011`), **only** Wellness requests — neither sees the
      other's, though both sit in the same table
- [ ] The admin queue shows **both**, because it is platform-scoped on purpose

### 4.8 Inventory — Phase 3.2

A distributor's own stock. Full detail in [INVENTORY.md](INVENTORY.md).

Sign in as `9000000010` (MedPlus) at `/login`, then go to `/inventory`.

#### Stock list

- [ ] Four tiles: 20 batches listed, 1 running low, 1 expiring soon, stock value ~4.2L
- [ ] The list is sorted **soonest expiry first**, not newest first
- [ ] Ciplox 500 shows an amber "60 days left" badge; nothing else carries one
- [ ] Ondem 4 (6 units) shows **Running low**; everything else shows In stock
- [ ] Search `azithral` narrows to one row; search `OND4V771` finds it **by batch number**
- [ ] Stock level = Low stock -> only Ondem 4
- [ ] Expiry = Expiring within 90 days -> only Ciplox 500
- [ ] Clear filters restores the full list

#### Add a batch — `/inventory/new`

- [ ] Type `shel` in the medicine box -> Shelcal appears -> pick it, and it stays shown
- [ ] Search something that does not exist -> offered **Request a new medicine**
- [ ] Warehouse is pre-selected, because MedPlus has one
- [ ] Enter an expiry **20 days away** -> refused, "expires too soon to be sold"
- [ ] Enter a selling price **above** the MRP -> refused under the price box
- [ ] Fill it in properly (MRP 150.50, price 120.25, quantity 75, warn below 80) -> saved
- [ ] Back on the list it reads **Running low** (75 available against a threshold of 80)
      and **20% below MRP** — rupees were converted to paise correctly
- [ ] Add the same batch number again at the same warehouse -> refused as already listed

#### Edit a batch — `/inventory/[id]`

- [ ] Medicine, batch number, expiry and MRP are shown but **not editable**, with a
      sentence saying why
- [ ] Change the price above MRP -> refused inline
- [ ] Change quantity and price -> saved, and the list reflects it
- [ ] Switch off **Available to Order** -> the row reads "Retailers cannot order this"

#### Reserved stock

Stock held in a retailer's cart cannot be oversold. Simulate one:

```bash
docker compose exec postgres psql -U medibridge -d medibridge -c \
  'UPDATE inventory_items SET "reservedQuantity" = 30 WHERE "batchNumber" = '"'"'DL650B117'"'"';'
```

- [ ] The Dolo 650 row now shows how much is free to sell versus held
- [ ] Open it -> a note says 30 units are in retailers' carts
- [ ] Try to set the quantity **below 30** -> refused, naming the 30 units
- [ ] Try to **remove** the batch -> refused for the same reason
- [ ] Set it back to 0 reserved -> both work again

#### Expiring soon — `/inventory/expiring`

- [ ] Ciplox 500 appears under "Expiring within 90 days" with days remaining
- [ ] With nothing expired, no red panel is shown
- [ ] **Edit** on a card opens that batch

#### Permission checks

Inventory splits reading from changing, so a sales executive can quote stock
without repricing it.

- [ ] `/account/roles` -> open **Company Admin** -> untick **"Change stock and prices"** -> save
- [ ] `/inventory` still loads
- [ ] **Add Medicine** -> saving returns `FORBIDDEN`
- [ ] Tick it back -> saving works again on the very next request, with no sign-out

#### Tenant isolation

- [ ] As MedPlus, note a batch id from `/inventory`
- [ ] Sign in as `9000000011` (Wellness) -> `/inventory` shows **completely different** stock
- [ ] Open MedPlus's batch id directly, e.g. `/inventory/<that id>` -> **not found**,
      not "forbidden". The row is invisible, not merely off-limits.

#### Stock by warehouse and transfers — Phase 3.3

MedPlus is seeded with one warehouse, so add a second under
`/account/company` first (any Pune address will do).

- [ ] `/warehouses` totals each location: batches, units free to sell, running
      low, expiring soon, and value
- [ ] The new warehouse shows all zeros
- [ ] **Move Stock** -> search `DL650B117` -> pick the Dolo 650 batch
- [ ] It shows where the batch currently is and how many units are free to move
- [ ] Try to move it to the warehouse it is already in -> refused
- [ ] Try to move more units than are free -> refused, naming the number
- [ ] Move 200 units -> both warehouses update, and the totals still add up to
      what you started with
- [ ] The batch now appears at **both** locations with the same batch number,
      expiry and MRP
- [ ] Move another 50 -> the destination row goes to 250 rather than a second
      row appearing
- [ ] **Recent moves** lists both, with who moved them and any note

### 4.9 Mobile layout

The quickest honest check is a real phone-sized viewport, not a narrow window.

In Chrome: **⌥⌘I** → the phone icon (**⇧⌘M**) → choose **iPhone SE (375×667)**.

Walk these and confirm **nothing scrolls sideways** and every button is
reachable with a thumb:

- [ ] `/login`, `/signup`, `/forgot-password`, `/login/otp`
- [ ] `/account`, `/account/profile`, `/account/company`, `/account/team`, `/account/roles`
- [ ] `/account/medicine-requests`, `/account/medicine-requests/new`
- [ ] `/admin`, `/admin/licences`, `/admin/approvals`, `/admin/users`
- [ ] `/admin/medicines`, `/admin/medicines/new`, `/admin/medicines/requests`
- [ ] a medicine's edit, duplicates and merge screens
- [ ] `/inventory`, `/inventory/new`, `/inventory/expiring`, and a batch's edit screen
- [ ] `/warehouses`, including the Move Stock dialog

Then repeat at **iPad (768px)** and a normal desktop window.

On the medicine screens specifically:

- [ ] The list is **stacked cards**, not a squeezed table
- [ ] The primary action (**Add Medicine**, **Send Request**, **Merge them**)
      sits in a bar at the bottom of the screen, above the navigation
- [ ] The merge comparison stacks the two medicines vertically, keeping the one
      being kept first
- [ ] Every button and input is at least 44px tall

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
- **No ordering or search screens.** Medicine master (3.1), inventory (3.2) and warehouse transfers (3.3) are built; bulk import UI is 3.4 and the rest follows.
- **Inventory has no bulk edit and no stock history screen.** See [INVENTORY.md](INVENTORY.md#known-limitations) for that module's full list.
- **Medicine list sorting is fixed** at name A–Z, and page size at 25. The API supports neither a sort parameter nor a page-size control yet. See [MEDICINE-MASTER.md](MEDICINE-MASTER.md#known-limitations) for the full list of that module's limitations.
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

**After `db:seed`, flush Redis.** Seeding truncates and recreates every row, so
company and user ids change — but tenant resolution, capabilities and
permissions are cached in Redis against the *old* ids. The symptom is every
sign-in failing with "That mobile number or password is not correct" while the
password is perfectly correct, and `Cross-tenant sign-in blocked` in the API
log naming a company id that no longer exists.

```bash
docker compose exec redis redis-cli FLUSHALL
```

**The API does not hot-reload if you started it with `node dist/main.js`.** Use
`npm run dev` while working, or rebuild and restart after changing API code —
otherwise you are testing the previous build and will not know it.

---

## 7. What "done" looks like

Phases 2, 3.1, 3.2 and 3.3 pass locally when:

- all five automated checks pass
- every box in section 4 is ticked
- nothing scrolls sideways at 375px, 390px, 768px or 1280px
- one tenant cannot see another's anything — including medicine requests and stock transfers

At that point Phase 3.4 can start: bulk import UI, then search, cart, orders,
payments, delivery and notifications in that order.
