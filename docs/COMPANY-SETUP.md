# Company setup

Phase 2.3. A company looking after itself.

---

## Configuration, not branches

Everything here is a row, not an `if`. That is the whole reason one codebase
serves a marketplace and a private distributor: payment terms, delivery radius,
cut-off time and branding are data.

| Section | What it decides |
| --- | --- |
| **Business details** | The name and support contacts customers see |
| **Payment terms** | Token %, prepaid, COD, or credit days |
| **Warehouses** | Where stock ships from, and who gets Same-Day |
| **Bank account** | Where the weekly settlement is paid |
| **Branding** | One seed colour; the tokens derive the rest |

Five small forms, each saving on its own. Someone fixing a typo in a support
phone number should not have to re-confirm their bank details to do it.

## No companyId, anywhere

`CompanyService` never takes a company id. The company is always the one on the
session, so no crafted request can edit someone else's business. Verified: a
`PATCH` at another tenant's warehouse returns `NOT_FOUND`, not a 403 — the row
is not visible to begin with.

## Rules worth knowing

**Changing the token percentage does not touch orders already placed.** Every
order carries its own `tokenPercent` snapshot, so raising 20% to 30% can never
retroactively ask a retailer for more money.

**A warehouse holding stock cannot be closed.** The stock would become
unreachable rather than moving somewhere, and an order already placed against
it has to stay fulfillable. The message offers the reversible alternative —
pausing — next to the button that failed.

**A company cannot close its last warehouse.** Imports and stock need somewhere
to land.

**Closing the default warehouse promotes another.** Something has to be the
default or a bulk import has nowhere to go.

**The bank account number is masked everywhere**, including in the audit log.
An audit trail should not become the second place a bank number leaks.

## Endpoints

| Route | What |
| --- | --- |
| `GET /company` | Settings as configured today |
| `PATCH /company/profile` | Name and support contacts |
| `PATCH /company/terms` | Payment terms |
| `PATCH /company/bank` | Settlement destination |
| `PATCH /company/branding` | Logo, colour, login image |
| `GET /company/warehouses` | Places stock ships from |
| `POST /company/warehouses` | Add one |
| `PATCH /company/warehouses/:id` | Change it, or pause it |
| `DELETE /company/warehouses/:id` | Close it |

Every write records what changed **and what it changed from**. An audit entry
that only says "settings updated" is no use the day someone asks why the token
percentage is different.

## Screen

`/account/company` — verified at 390px, 768px and 1280px with no horizontal
overflow.

Each warehouse states what its numbers mean rather than only showing them:
"Same-Day within 25 km if ordered before 14:00 · delivery ₹50, free above
₹5000 · 20 batches".
