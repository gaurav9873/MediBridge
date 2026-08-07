# Registration and onboarding

Phase 2.2. Turning an account into a business that can trade.

---

## Two things, not one

```
sign-up (2.1)   ->  a person who can sign in
onboarding (2.2) ->  a business that can trade
```

Confirming a mobile number proves the number is real. Verifying a drug licence
proves the business may buy medicines. Different questions, different evidence,
wildly different timescales — so they are separate steps and the account status
only answers the second.

## What gets created

`OnboardingService` is the only place the two sides of the market differ:

| Who | What onboarding creates |
| --- | --- |
| **Retailer** | a `Customer` of the marketplace they signed up on, plus their shop `Address` |
| **Distributor** | a `Company` of its own, a `Warehouse`, a `CompanyLink` to the marketplace, the seven system roles, and `COMPANY_ADMIN` for the owner |

A seller is a tenant in its own right. So onboarding a distributor **moves
their user, addresses and documents** to the company it creates — otherwise
Row-Level Security hides the seller's own data from them at the next sign-in.
That is the same trap Step 4's migration had to avoid.

The address is not paperwork: its latitude and longitude are one half of every
Same-Day radius check.

## Signing in after becoming a tenant

Completing onboarding used to lock a seller out. Their company was now their
own, so the cross-tenant check refused them on the marketplace's own login
page — the only page they knew.

`CompanyLinkService` decides who may use whose portal, at sign-in and on every
request. A seller trading through a marketplace may use its portal; the link
governs which **door** they come through. The session still governs what they
can **read**, so a seller on the marketplace portal sees only its own rows.

## Documents

Streamed through an endpoint that checks who is asking, never served from a
path. The storage key is built from ids we generate, so an uploader cannot
choose where their file lands.

| Rule | Why |
| --- | --- |
| 5 MB, PDF or image | A phone photo of a licence is under 3 MB |
| Expired licence refused at upload | The applicant finds out while still on the page |
| One licence number, one account | Otherwise approving one account licenses two |
| Re-upload replaces and re-queues | Fixing a blurry photo should not need an admin first |
| Rejection reason cleared on replace | Nobody should read yesterday's verdict as today's |

## Employees

An employee is an ordinary `User` with the company's id and a role from that
company's own role table. No second concept — same guard, same permissions,
same RLS.

Created rather than emailed a link, because the owner is usually standing next
to them. The temporary password is shown **once** and never stored anywhere it
could be read again.

Removal is a soft delete with sessions revoked: their name stays on the orders
they packed, their access ends immediately.

## Endpoints

| Route | What |
| --- | --- |
| `GET /onboarding/status` | What the wizard should show next |
| `POST /onboarding/business` | Business details and trading address |
| `GET /onboarding/documents` | What is on file |
| `POST /onboarding/documents` | Upload or replace one |
| `GET /onboarding/documents/:id/file` | Stream it, access checked |
| `GET /onboarding/employees` | Who works here |
| `POST /onboarding/employees` | Add a colleague |
| `DELETE /onboarding/employees/:id` | Remove one |

## Screens

| Route | What |
| --- | --- |
| `/onboarding` | Business step, documents step, awaiting review |
| `/account/team` | Add, list and remove colleagues |

The wizard step comes from the server, never from local state — a wizard that
remembers where it thinks you are eventually disagrees with the database.

Verified at 390px, 768px and 1280px with no horizontal overflow.

## Still to come

Approving what is uploaded here is **Phase 2.4**. Today an admin approves via
the existing approvals screen, which will be reworked onto `Customer` and
`Company` in that phase.
