# Search

Phase 3.5. The retailer's screen over the offer projection.

---

## What it answers

Not "does anyone stock Dolo" but **"who near my shop has it, at what price, and
how fast can it get here"**. That question is the reason the catalogue is
shared: two distributors stocking Dolo 650 point at the same medicine row, so
their prices sit side by side.

A real result from the seeded data:

| Distributor | Price | Distance | Delivery |
| ----------- | ----- | -------- | -------- |
| Wellness Distributors | ₹22.00 | 125.4 km | Next-Day |
| MedPlus Wholesale | ₹24.00 | 5.0 km | **Same-Day** |

Two rupees against a day. That trade-off is the product, so the card leads with
the best price and opens straight into the comparison rather than hiding it
behind a second screen.

---

## The screen

`/search`, in a `(retailer)` route group whose layout reuses the same AppShell
as the admin and distributor sides. Cart and Orders appear in the navigation
marked **Soon** rather than hidden — a menu that grows new items reads as
unfinished, and a link to a 404 reads as broken. The flag comes off as each
phase lands.

Search is debounced at 300 ms and keeps its previous results, so typing refines
a visible list instead of flashing a skeleton.

**There is no Add to Cart button yet.** Buying arrives in 3.6, and a dead
control is worse than an honest sentence saying so.

---

## API

| Method | Path | Permission |
| ------ | ---- | ---------- |
| `GET` | `/search/medicines` | `PRODUCT_VIEW` |

Query: `query`, `form`, `sameDayOnly`, `inStockOnly`, `minPricePaise`,
`maxPricePaise`, `sortBy` (`relevance` | `priceLow` | `priceHigh` | `fastest` |
`expiryLongest`), `page`, `pageSize`.

Returns each medicine with every nearby seller's offer — price, MRP, units
available, minimum order, expiry, distance in km, and whether Same-Day applies.
Plus `sellersInRange`, which is distinct sellers rather than warehouses: a
distributor shipping from two depots is one distributor to a retailer.

---

## Why the results are trustworthy

The search reads `medicine_offers`, a projection maintained by a database
trigger on `inventory_items`. It already excludes anything expired
(`expiryDate > CURRENT_DATE`), inactive, or with nothing free to sell.

So a result on this screen is genuinely buyable. That matters more than it
sounds: a search that lists stock which fails at checkout teaches people not to
trust the prices, which is the one thing this product sells.

Distance comes from PostGIS `ST_DWithin` against the warehouse's location, and
Same-Day is decided per warehouse by its own radius and cut-off time — so the
same medicine can be Same-Day from one depot and Next-Day from another.

---

## Known limitations

- **No paging in the UI.** The API takes `page`/`pageSize`; the screen shows the
  first page. Fine at seed scale, not at catalogue scale.
- **No price-range filter on screen**, though the API supports one.
- **Sorting is applied by the API, not re-sorted client-side.** The offers
  inside a card are always cheapest-first regardless of the chosen sort.
- **Nothing is saved for later** — no favourites, no reorder list. Reorder is
  Phase 3.7's territory.
- **`sameDayOnly` filters medicines, not offers.** A medicine survives the
  filter if any seller can do Same-Day; the card still lists the Next-Day
  sellers underneath.
- **No "tell me when available"** for a medicine nobody nearby stocks. The copy
  layer has the wording; there is no subscription behind it.

---

## See also

- [INVENTORY.md](INVENTORY.md) — where the offers come from, and why expired stock never appears
- [MEDICINE-MASTER.md](MEDICINE-MASTER.md) — the shared catalogue that makes comparison possible
- [LOCAL-TESTING.md](LOCAL-TESTING.md) — how to exercise this by hand
