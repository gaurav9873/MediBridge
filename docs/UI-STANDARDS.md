# UI standards

The rule behind all of this: **good UX should be the path of least resistance.** If a
developer can ship a form field without helper text, eventually one will. So wherever
possible the standard is enforced by the type system rather than by discipline.

---

## What the code enforces for you

| Rule                                        | How it is enforced                                                                | Fails as      |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| Every field has helper text                 | `TextField` etc. require a `FieldHelp` object, whose `helperText` is non-optional | Compile error |
| No hardcoded user-facing copy in components | Field components take copy objects, not `label` strings                           | Compile error |
| Every page says what it is for              | `PageShell` requires `page.title` **and** `page.subtitle`                         | Compile error |
| Every page has a Help section               | `PageShell` requires a `help: PageHelp` prop                                      | Compile error |
| Every list has an empty state               | `DataView` requires an `emptyState` prop                                          | Compile error |
| Empty states point somewhere                | `EmptyState` renders `copy.action` when present                                   | Review        |
| No double submissions                       | `Button` disables itself and shows a spinner while `loading`                      | Runtime       |
| Tables work on mobile                       | `ResponsiveTable` renders cards below `md`                                        | Runtime       |
| Status is never colour alone                | `StatusBadge` always renders icon + word + colour                                 | Runtime       |
| No technical errors shown to users          | API error codes map to copy; `AllExceptionsFilter` catches everything             | Runtime       |
| Tap targets are ≥ 44px                      | Every `Button` and input size has `min-h-[--size-touch]`                          | Runtime       |
| Inputs never trigger iOS zoom               | Base font size is 16px, enforced in `styles.css`                                  | Runtime       |

---

## Writing copy

All user-facing text lives in `packages/copy/src/en/`. Nothing is written inline.

**Use very simple English.** Write for a pharmacy owner who is busy, possibly on a
phone, and who has never been trained on this software.

| Write this                                         | Not this                                   |
| -------------------------------------------------- | ------------------------------------------ |
| Upload Drug License                                | Upload Regulatory Document                 |
| Save Changes                                       | Persist Data                               |
| Order Confirmed                                    | Order Successfully Processed               |
| Quantity cannot be greater than available stock.   | ValidationError: qty exceeds inventory.qty |
| We could not find that page.                       | 404 Not Found                              |
| Something went wrong at our end. Please try again. | Internal Server Error                      |

**Validation messages say what to do**, not what went wrong. "Please enter your GST
number." beats "GST number is required." One sentence, ending in a full stop, no error
codes, no field names in code style.

**Success messages confirm the specific thing that happened.** "Inventory updated."
beats "Success."

**Helper text is one short sentence** describing exactly what to type. Anything longer
or more rule-heavy goes in `tooltip`, which appears behind the ⓘ icon — never _only_
in the tooltip, since the helper line is what most people will read.

---

## Using the components

### A form field

```tsx
import { copy } from '@medibridge/copy'
import { TextField } from '@medibridge/ui'

;<TextField
  field={copy.auth.signUp.fields.gstNumber} // label + helperText + placeholder + tooltip
  error={errors.gstNumber?.message} // friendly sentence, from the Zod schema
  required
  {...register('gstNumber')}
/>
```

You cannot render this without helper text, and you cannot pass it an inline string.

### A page

```tsx
<PageShell
  page={copy.orders.list.retailerPage} // title + subtitle, both required
  help={copy.orders.list.retailerHelp} // Help panel content, required
  primaryAction={{ label: copy.common.actions.add, href: '/inventory/new' }}
>
  …
</PageShell>
```

On mobile the primary action is hidden here and rendered by `StickyActionBar` at the
bottom of the screen instead, where a thumb can reach it.

### A list

```tsx
<DataView
  data={orders}
  isLoading={isPending}
  error={error?.message} // already friendly — see api-client.ts
  emptyState={copy.orders.list.retailerEmpty} // required
  isFiltered={hasFilters}
>
  {(orders) => <ResponsiveTable columns={columns} rows={orders} rowKey={(o) => o.id} />}
</DataView>
```

### A table column

Each column declares its mobile behaviour, so the card layout is derived rather than
hand-built:

```tsx
{ key: 'orderNumber', header: '…', mobile: 'primary',   render: (o) => o.orderNumber }
{ key: 'distributor', header: '…', mobile: 'secondary', render: (o) => o.name }
{ key: 'total',       header: '…', align: 'right',      render: (o) => formatPaise(o.total) }
{ key: 'delivery',    header: '…', mobile: 'hidden',    render: (o) => o.mode }
```

### Errors from the API

`api-client.ts` converts every failure into an `ApiClientError` whose `message` is
already a friendly sentence. Show it directly:

```tsx
catch (error) {
  // Field-level errors go inline on the form; anything else becomes a toast.
  if (!applyFieldErrors(error, form.setError)) {
    notify.error(error instanceof ApiClientError ? error.message : undefined)
  }
}
```

Never render a caught `Error`'s own message, a status code, or a stack.

---

## Mobile

Design mobile-first. Retailers and distributors will often be on a phone behind a
counter.

- Bottom navigation, not a hamburger menu. Five items maximum.
- The screen's important action goes in `StickyActionBar`.
- Tables become cards below `md` — use `ResponsiveTable`, never a raw `<table>`.
- Dialogs and panels are bottom sheets on mobile, centred or side-anchored on desktop.
- Respect the notch and home indicator: `pb-safe`, `pb-safe-nav`, `viewportFit: cover`.
- Never set `maximumScale: 1` — it locks out anyone who needs to magnify text.

---

## Accessibility

Most of this comes free from the primitives, but when building something new:

- Every input needs a label and `aria-describedby` pointing at its helper text.
- Errors need `role="alert"` so screen readers announce them.
- Interactive elements need a visible `:focus-visible` ring — the global one is in
  `styles.css`; do not remove it.
- Status must never be communicated by colour alone.
- Honour `prefers-reduced-motion` — already handled globally.
- Keep the 44px minimum tap target.

---

## Definition of done

A feature is not complete until all of these are true:

- [ ] Every field has helper text, and a tooltip where a rule needs explaining
- [ ] Every user-facing string comes from `@medibridge/copy`
- [ ] The page has a title, a subtitle, and Help content
- [ ] Every list has an empty state that tells the user what to do next
- [ ] Loading uses skeletons, not a bare spinner
- [ ] Every action that changes something raises a success toast
- [ ] Validation messages are friendly, and identical on client and server
- [ ] No technical error can reach the user on any path
- [ ] Submit buttons cannot be double-tapped
- [ ] Checked at 390px, 768px and 1280px
- [ ] Fully operable by keyboard
- [ ] Works in light and dark mode
