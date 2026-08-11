# Medicine master

Phase 3.1. The shared catalogue every distributor stocks against, and the six
screens that maintain it.

---

## Why one shared list

A retailer's core question is "who near me has this, and at what price?". That
question is only answerable if two distributors stocking Dolo 650 point at the
**same catalogue row**. A per-tenant catalogue would make cross-seller price
comparison impossible, which is most of the product.

So the catalogue is owned by the platform, not by any tenant. Every read and
write goes through `TenantPrismaService.runAsPlatform()` — deliberately
verbose, and logged, because it is the one table everybody shares.

What stops a distributor editing everyone's catalogue is **the permission on
the route**, not the tenant scope. See [Permissions](#permissions).

---

## The screens

| # | Screen | Route | Who |
| - | ------ | ----- | --- |
| 1 | Medicine List | `/admin/medicines` | Admin |
| 2 | Add Medicine | `/admin/medicines/new` | Admin |
| 3 | Edit Medicine | `/admin/medicines/[id]` | Admin |
| 4 | Duplicate Review | `/admin/medicines/[id]/duplicates` | Admin |
| 5 | Merge Medicines | `/admin/medicines/[id]/merge/[otherId]` | Admin |
| 6 | Requests queue — review | `/admin/medicines/requests` | Admin |
|   | Requests queue — approve | `/admin/medicines/requests/[requestId]/approve` | Admin |
|   | Requests queue — mine | `/account/medicine-requests` | Distributor / retailer |
|   | Requests queue — ask | `/account/medicine-requests/new` | Distributor / retailer |

Archive and restore live on the **Edit** screen rather than the list, because
both need the medicine's live stock count in front of the person deciding.

### 1. Medicine List

Search (debounced, 300 ms), plus filters for type, drug schedule and status.
Paged 25 at a time. `keepPreviousData` means typing refines a visible list
instead of flashing a skeleton on every keystroke.

Ten columns did not fit at 1280 px, so strength and pack size ride under the
name rather than taking two more columns — they are only ever read together
with the name anyway.

### 4. Duplicate Review

A **review** screen: nothing here writes anything.

The unique constraint already stops exact repeats. This catches what it cannot
— "Dolo-650" against "Dolo 650", "Paracetamol 650mg" against "Paracetamol
650 mg" — which pass every constraint and then split one medicine's stock
across two rows, so neither shows the real best price.

Candidates are narrowed in the database by brand, first word or composition,
then ranked in memory by trigram similarity. Anything above
`DUPLICATE_THRESHOLD` (0.55), or matching exactly on the four identity columns,
is shown. A person decides; the score only decides what is worth showing them.

### 5. Merge Medicines

The one destructive action in the module, so it is the only screen that shows
**every field of both rows side by side** before asking. Fields that disagree
are tinted *and* marked up for screen readers — the decision is "which of these
two spellings is right", which is impossible to make from two names alone.

Which row survives is a choice, not an accident of which link was clicked, so
it can be swapped right up to the confirmation.

On confirm: stock, requests and history move onto the survivor, and the other
row is **archived, never deleted** — an order from last year still references
it, and an invoice that cannot resolve its own line items is worse than a tidy
catalogue.

**Batch collisions.** A warehouse cannot hold two batches with the same batch
number for one medicine. If both rows have batch `AB123` in the same warehouse,
that batch is *left on the loser* rather than dropped, and the count comes back
as `collided` so somebody can look. The success screen says so explicitly.

### 6. Requests queue

Approving is **not** a button. A request carries a name and a brand; the
catalogue also needs an HSN code, a GST rate and a schedule, and those are the
reviewer's judgement rather than the asker's — an invented HSN code follows
that medicine onto every invoice ever raised for it. So "approve" opens the
full add form with what the distributor told us prefilled and shown separately
above it.

Refusing *is* a button, but never a silent one: the reason is typed in the
confirmation dialog, validated against the same `rejectApplicationSchema` the
server uses, and the distributor reads it verbatim.

The distributor's own view answers a different question — not "what should I
decide?" but "what happened to the thing I asked for?" — so on a refused
request the reason is the loudest element on screen.

---

## API endpoints

All under `/api/v1`. Every response uses the `{ success, data }` envelope.

| Method | Path | Permission | Role |
| ------ | ---- | ---------- | ---- |
| `GET` | `/medicines` | `PRODUCT_VIEW` | any |
| `GET` | `/medicines/:id` | `PRODUCT_VIEW` | any |
| `GET` | `/medicines/:id/duplicates` | `PRODUCT_VIEW` | any |
| `POST` | `/medicines` | `PRODUCT_MANAGE` | `ADMIN` |
| `PATCH` | `/medicines/:id` | `PRODUCT_MANAGE` | `ADMIN` |
| `POST` | `/medicines/:id/archive` | `PRODUCT_MANAGE` | `ADMIN` |
| `POST` | `/medicines/:id/restore` | `PRODUCT_MANAGE` | `ADMIN` |
| `POST` | `/medicines/merge` | `PRODUCT_MANAGE` | `ADMIN` |
| `GET` | `/medicines/requests/mine` | `PRODUCT_VIEW` | any |
| `POST` | `/medicines/requests` | `PRODUCT_VIEW` | any |
| `GET` | `/medicines/requests/pending` | `PRODUCT_MANAGE` | `ADMIN` |
| `POST` | `/medicines/requests/:id/approve` | `PRODUCT_MANAGE` | `ADMIN` |
| `POST` | `/medicines/requests/:id/reject` | `PRODUCT_MANAGE` | `ADMIN` |

Query parameters on `GET /medicines`: `search`, `form`, `schedule`,
`status` (`active` | `archived` | `all`), `page`, `pageSize` (max 100).

---

## Permissions

Reading needs `PRODUCT_VIEW` — every seller and buyer has it.

Writing needs `PRODUCT_MANAGE` **and** the `ADMIN` role. The permission alone
is not enough: `COMPANY_ADMIN` bundles every non-platform key, so every company
owner holds `PRODUCT_MANAGE` — and this is one catalogue shared by all of them.
A distributor editing it would be editing everybody's.

A distributor who needs something added asks for it instead. That is what the
request endpoints are for.

The web app mirrors this rather than inventing its own rule: write screens live
under `/admin`, whose layout already requires an admin session. That guard is a
convenience, not the boundary — the API rejects the request either way.

---

## Rules that live in the domain, not the service

Per MODULE-STANDARD, medicine rules stay out of the platform core. They are in
`packages/types/src/medicine-rules.ts`, testable without a database, a tenant
or a request:

| Rule | What it decides |
| ---- | --------------- |
| `isSellable` | Schedule X can never be listed |
| `requiresPrescription` | Schedule H/H1 force the prescription flag on, whatever the form says |
| `medicineKey` | What makes two rows the same medicine: name + brand + strength + pack size |
| `similarity` / `DUPLICATE_THRESHOLD` | What is worth showing a human as a probable duplicate |
| `blankAsAbsent` / `normaliseMedicineOptionals` | A blank optional field is absent, not empty |
| `medicineDifferences` | Which fields two medicines disagree on, for the merge comparison |

### Why `blankAsAbsent` exists

`medicineKey` treats a missing strength and an empty one as the same thing.
Postgres does not: it compares `''` and `NULL` as different values, so a
medicine saved with strength `''` sits happily beside the same medicine saved
with strength `NULL`. Two rows for one medicine is the exact failure this
catalogue exists to prevent, and an untouched input box is the easiest way to
cause it. Every form normalises through this before submitting.

### Why `medicineDifferences` ignores blank-vs-missing

Highlighting a non-difference on a screen that cannot be undone teaches people
to ignore the highlighting. A missing pack size and an empty one are the same
absence, and are not flagged.

---

## Audit logging

Every state change writes an `AuditLog` row with actor, entity and before/after:
`CREATE_MEDICINE`, `UPDATE_MEDICINE`, `ARCHIVE_MEDICINE`, `RESTORE_MEDICINE`,
`MERGE_MEDICINE`, `REQUEST_MEDICINE`, `APPROVE_MEDICINE_REQUEST`,
`REJECT_MEDICINE_REQUEST`.

There is still no audit log *viewer* — read it with `npm run db:studio`.

---

## Known limitations

- **Sorting is fixed.** The list is always name A–Z. The API's `list()` hardcodes
  `orderBy: [{ name: 'asc' }]` and takes no sort parameter, so the UI does not
  offer one rather than pretending to. Adding it is an API change first.
- **Page size is fixed at 25.** The API accepts up to 100; the UI does not yet
  expose a control for it.
- **A merge cannot be undone from the UI.** The stock has genuinely moved. The
  losing row can be restored, but the batches stay where they went.
- **Colliding batches are reported, not resolved.** The merge screen tells you
  how many were left behind; moving them is a manual job with no screen yet.
- **The approve screen reads the pending list, not a single request.** There is
  no `GET /medicines/requests/:id`, so a direct link to an already-decided
  request shows "we could not find that page" rather than its outcome.
- **No bulk actions.** Archiving or merging many at once is not built; bulk
  import remains the way to load a catalogue.
- **Duplicate review is per-medicine.** There is no "show me every probable
  duplicate in the catalogue" sweep; you review one medicine at a time.
- **Requests cannot be edited or withdrawn** by the distributor once sent.
- **The legacy `/admin/medicines` list endpoint still exists** and is unused by
  the UI, which now reads `/medicines`. It is left in place rather than removed
  as part of a UI phase.

---

## See also

- [MODULE-STANDARD.md](MODULE-STANDARD.md) — the definition of done this module was built against
- [LOCAL-TESTING.md](LOCAL-TESTING.md) — how to exercise these screens by hand
- [MULTI-TENANCY.md](MULTI-TENANCY.md) — why the catalogue is platform-owned
- [ROLES-AND-PERMISSIONS.md](ROLES-AND-PERMISSIONS.md) — where `PRODUCT_MANAGE` sits
