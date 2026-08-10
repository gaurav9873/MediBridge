# Licence verification

Phase 2.4. Checking what people upload before they can trade in medicines.

---

## Per document, not per application

The older approvals screen decides a whole application at once. That is the
right shape when both documents are fine, and the wrong shape when one is:
rejecting the application to fix a blurry GST certificate also throws away a
perfectly good drug licence, and the applicant uploads both again.

So each document is accepted or refused on its own, and the account becomes
active only once **every** document it needs is approved — a rule stated in
`LicenceService.activateIfComplete` rather than left to whoever clicks last.

```
licence approved   ->  accountActivated: false   (GST still pending)
GST approved       ->  accountActivated: true    ACTIVE, canPlaceOrders
```

## Refusing is not closing

A refused document leaves the account `PENDING_VERIFICATION`, not `REJECTED`.
They keep their sign-in, read the reviewer's reason verbatim, upload a
replacement, and it returns to the queue with the old reason cleared.

Closing an account because a photograph was blurry is a very expensive way to
ask for a better one.

## An expired licence cannot be approved

Approving one would activate an account that immediately fails the ordering
guard — which reads as a bug to the reviewer, the applicant and support alike.
The reviewer is told to ask for a renewed one instead.

The same check runs at upload, so an applicant finds out while still on the
page rather than a day later.

## The list nobody asks for

`GET /admin/licences/expiring` shows approved licences with 90 days or less to
run. Without it, the first anyone hears about an expiry is a blocked checkout
on the day it happens.

## Where the licence ends up

Approving a drug licence copies its number and expiry onto the record the
ordering guard reads — the `Customer` for a buyer, the `Company` for a seller.
That keeps the check on every checkout a single cheap read instead of a join.

## Endpoints

| Route | What |
| --- | --- |
| `GET /admin/licences/pending` | Documents waiting for a decision, oldest first |
| `GET /admin/licences/expiring?days=` | Approved licences about to lapse |
| `POST /admin/licences/:id/approve` | Accept one; returns whether the account activated |
| `POST /admin/licences/:id/reject` | Refuse one, with a reason |

Documents are viewed through `GET /onboarding/documents/:id/file`, which checks
who is asking. The files are never on a public path.

## Screen

`/admin/licences` — two lists, because they are two different jobs. Verified at
390px, 768px and 1280px with no horizontal overflow.
