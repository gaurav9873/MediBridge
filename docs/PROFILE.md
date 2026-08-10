# Profile management

Phase 2.6. A person looking after their own account.

---

## Person, not company

`/account/profile` is "who am I". `/account/company` is "what does my business
do". A counter assistant has every right to change their own email and no
business touching the company's payment terms — so they are separate screens
with separate permissions.

Company and warehouse profiles were Phase 2.3. This is the person: their name,
how we reach them, where deliveries go, and which messages they want.

## No userId, anywhere

Every method on `ProfileService` acts on the caller. There is no `userId`
parameter on any public method, so editing your own name is never one crafted
request away from editing a colleague's.

## Changing the mobile number

It is the sign-in identifier, so it does not change with a Save button.

**The code goes to the NEW number.** Sending it to the old one would only prove
they still have the phone they are trying to stop using.

On confirmation the password identity moves with it — `UserIdentity.identifier`
IS the mobile number, so leaving it behind would let the old number keep
signing in. Verified: after a change, the new number signs in and the old one
returns `INVALID_CREDENTIALS`.

A number already registered to someone else is refused before any code is sent.

## Addresses

The coordinates are what every Same-Day radius check measures from. A pin in
the wrong place gives the **wrong delivery options, not an error** — which is
the hardest kind of mistake to notice — so each address shows its coordinates
rather than hiding them behind a map that is not built yet.

**The last address cannot be removed.** Search has to measure from somewhere.
Removal is soft, because an invoice must still show where the medicines went,
and removing the default promotes another.

## Notifications

Everything appears in the app whatever is ticked. These settings only decide
whether it *also* costs an SMS — and the screen says so, because otherwise
people turn everything off and then wonder why they missed an order.

**Absent rows mean ON.** The stored rows are only the opt-outs, so adding a new
event to `NOTIFIABLE_EVENTS` reaches people by default rather than silently not
reaching them until they find this screen.

Each toggle saves on its own. A page of tick-boxes with one Save button at the
bottom is how someone changes four things and loses three.

## Endpoints

| Route | What |
| --- | --- |
| `GET /profile` | Your account |
| `PATCH /profile` | Name and email |
| `POST /profile/phone/request` | Send a code to a new number |
| `POST /profile/phone/confirm` | Complete the change |
| `GET /profile/addresses` | Delivery addresses |
| `POST /profile/addresses` | Add one |
| `POST /profile/addresses/:id/default` | Use it by default |
| `DELETE /profile/addresses/:id` | Remove one |
| `GET /profile/notifications` | What we tell you about |
| `PATCH /profile/notifications` | Turn one on or off |

## Screen

`/account/profile` — details, mobile number, addresses, notifications.

Verified at 390px, 768px and 1280px with no horizontal overflow, signed in as a
retailer, a distributor and an admin.
