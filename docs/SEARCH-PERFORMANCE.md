# Search performance

How medicine search stays fast as the catalogue grows, and the measurements
behind the design.

Everything below was measured on a database loaded to realistic scale:

|                |           |
| -------------- | --------- |
| Medicines      | 200,000   |
| Inventory rows | 3,000,038 |
| Distributors   | 62        |

---

## The problem

The obvious query joins four tables and aggregates:

```sql
SELECT m.id, m.name, MIN(i."sellingPricePaise") AS best_price
FROM medicines m
JOIN inventory_items i   ON i."medicineId" = m.id
JOIN distributor_profiles dp ON dp.id = i."distributorId"
JOIN addresses hub       ON hub.id = dp."hubAddressId"
WHERE m."searchVector" @@ websearch_to_tsquery('english', $1)
  AND i."isActive" AND i.quantity > i."reservedQuantity" AND i."expiryDate" > now()
  AND ST_DWithin(hub.location, $2, $3)
GROUP BY m.id, m.name
ORDER BY best_price
LIMIT 20;
```

Measured:

| Query                                         | Time       |
| --------------------------------------------- | ---------- |
| Text search, 500 km radius                    | 374 ms     |
| **Browse everything nearby (no search term)** | **807 ms** |
| Deep pagination (OFFSET 5000)                 | 202 ms     |

The killer is `ORDER BY best_price`. Because the price is an aggregate, Postgres
must aggregate **every** matching inventory row before it can sort — roughly
100,000 rows touched to return 20. That cost grows linearly with the catalogue,
so 10× the data is 10× the wait: 8 seconds.

Indexes cannot fix this. The work is real; the query shape is wrong.

---

## The two ideas that fix it

### 1. Search is always bounded by geography

A retailer can only buy from distributors who can deliver to them. That is a
handful of rows, always — 4 in the seeded data, maybe 60 in a dense city. Never
thousands.

So the query does not start from the catalogue. It starts from _"who can reach
me?"_ — one PostGIS `ST_DWithin` against a GiST index returning tens of rows —
and everything after that is scoped to those distributors. An unbounded search
becomes a bounded one before it touches inventory.

### 2. Pre-aggregate the answer

`medicine_offers` holds **one row per (medicine, distributor)**: the best price,
what is available, the furthest expiry, plus the medicine's name and search
vector denormalised in.

```
inventory_items   3,000,038 rows   (batch-level, the source of truth)
        ↓ trigger
medicine_offers   1,500,038 rows   (offer-level, the read model)
```

Two things follow:

- **The aggregation is already done**, so `ORDER BY "bestPricePaise"` reads a
  plain indexed column instead of a computed one.
- **No join to `medicines`**, because the text and display fields are already
  on the row.

Sold-out and expired stock produce no row at all, so search never filters them
out at read time — they simply are not there.

---

## The query shape that makes the index work

Having the table was not enough. This still took 597 ms:

```sql
SELECT "medicineId", min("bestPricePaise") FROM medicine_offers
WHERE "distributorId" IN (...) GROUP BY "medicineId" ORDER BY 2 LIMIT 20;
```

`GROUP BY` forces every matching offer to be read before the sort can start, and
the planner chose a bitmap scan over 175,000 rows.

The fix is a **LATERAL top-N per distributor**:

```sql
SELECT o.* FROM unnest($1::uuid[]) AS d(id)
CROSS JOIN LATERAL (
  SELECT * FROM medicine_offers
  WHERE "distributorId" = d.id
  ORDER BY "bestPricePaise"
  LIMIT 100
) o
ORDER BY o."bestPricePaise"
LIMIT 400;
```

Each inner scan is an **ordered index scan** on
`(distributorId, bestPricePaise)` that stops after 100 rows. With 4 distributors
that is 400 rows read instead of 175,000, and the outer sort is trivial.

Collapsing to one row per medicine then happens in application code over a few
hundred rows — not hundreds of thousands.

```
EXPLAIN confirms:
  Index Scan using medicine_offers_distributor_price_idx
    (actual time=0.041..0.940 rows=82 loops=9)
```

---

## Results

Same database, same hardware, through the real HTTP endpoint with the Redis
cache flushed before every call:

| Query                        | Before | After      |
| ---------------------------- | ------ | ---------- |
| Browse cheapest nearby       | 807 ms | **31 ms**  |
| Text search, common term     | 374 ms | **35 ms**  |
| Text search, rare term       | —      | **7 ms**   |
| Sort by price, high to low   | —      | **8 ms**   |
| Same-Day only                | —      | **4 ms**   |
| No matches at all            | —      | **3 ms**   |
| Who else sells this medicine | —      | **0.1 ms** |
| Repeat search (Redis cache)  | —      | **1 ms**   |

The important property is not the absolute numbers — it is that the work is now
**bounded by the page size, not by the catalogue size**. Ten times the medicines
does not mean ten times the wait, because the query reads at most
`distributors × 100` rows regardless.

---

## Keeping the read model correct

Triggers, not a refresh job. A stale price is a real problem — a retailer could
order at a price the distributor no longer offers.

| Event                                | What happens                                                             |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Stock added, changed or deleted      | `refresh_medicine_offer(medicine, distributor)` recomputes that one pair |
| Medicine renamed                     | Its denormalised fields update across all offers                         |
| Medicine delisted, or set Schedule X | Every offer for it is deleted                                            |
| Stock hits zero, or expires          | The row disappears, so it leaves search                                  |

Each trigger call aggregates only that pair's batches — usually one to five
rows. Search volume is orders of magnitude higher than stock-change volume, so
paying on write is the right trade.

`rebuild_medicine_offers()` does a full rebuild (45 seconds for 1.5M rows) for
initial population, or repair after a bulk load that bypassed triggers.

### One thing to watch

A bulk import fires the trigger once per row. A 50,000-row import therefore does
50,000 small aggregates. That is acceptable today, but if imports get slow the
fix is to disable the trigger for the transaction and call
`rebuild_medicine_offers()` afterwards — noting it here so it is not
rediscovered later.

---

## Caching

Results are cached in Redis for 60 seconds, keyed by **address plus query** —
the address is part of the key because results are location-dependent, and two
retailers searching the same word must never share an entry.

Sixty seconds is long enough to absorb someone paging back and forth, short
enough that a price change is visible almost immediately.

---

## What is deliberately not done yet

- **Keyset pagination.** Page 1 is what retailers actually use; deep paging is
  currently an in-memory slice of the merged result. If usage shows deep paging
  matters, the cursor is `(bestPricePaise, medicineId)`.
- **Trigram fuzzy matching in the endpoint.** The index exists on
  `medicine_offers.name`, but the endpoint uses exact full-text today. Wiring
  "did you mean" is a small follow-up.
- **Search-as-you-type.** Needs a prefix index (`text_pattern_ops`) as well —
  worth adding when the search UI is built.
