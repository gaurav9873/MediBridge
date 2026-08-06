/**
 * Money handling.
 *
 * Every amount in this system is an integer number of PAISE. Floating-point
 * rupees would drift — 0.1 + 0.2 !== 0.3 — and in a product where 20% of a
 * total is charged now and 80% later, a drifting paisa becomes a balance the
 * retailer can't pay exactly.
 *
 * Database columns are Int. Only the display layer converts to rupees.
 */

/** A whole number of paise. 100 paise = ₹1. */
export type Paise = number

export const PAISE_PER_RUPEE = 100

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * PAISE_PER_RUPEE)
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE
}

/** e.g. 12550 -> "₹125.50". Used everywhere a price is shown. */
export function formatPaise(paise: Paise, options?: { showDecimals?: boolean }): string {
  const showDecimals = options?.showDecimals ?? true
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(paiseToRupees(paise))
}

/** Compact form for dashboard tiles: 1250000 paise -> "₹12.5K". */
export function formatPaiseCompact(paise: Paise): string {
  const rupees = paiseToRupees(paise)
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1)}Cr`
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}K`
  return formatPaise(paise, { showDecimals: false })
}

/**
 * Splits a total into the token paid now and the balance paid on delivery.
 *
 * The token is rounded DOWN and the balance takes the remainder, so the two
 * always add back to exactly the total. Rounding the other way could ask a
 * retailer for one paisa more than the order is worth.
 */
export function splitTokenAndBalance(
  totalPaise: Paise,
  tokenPercent: number,
): { token: Paise; balance: Paise } {
  const token = Math.floor((totalPaise * tokenPercent) / 100)
  return { token, balance: totalPaise - token }
}

/**
 * GST on an amount, rounded to the nearest paisa.
 * `gstRate` is a whole percentage — 5, 12, 18.
 */
export function calculateGst(basePaise: Paise, gstRate: number): Paise {
  return Math.round((basePaise * gstRate) / 100)
}

/** Percentage saved against MRP, for the "18% below MRP" badge in search. */
export function discountPercent(mrpPaise: Paise, sellingPaise: Paise): number {
  if (mrpPaise <= 0) return 0
  return Math.round(((mrpPaise - sellingPaise) / mrpPaise) * 100)
}

/** Sums line totals without ever leaving integer arithmetic. */
export function sumPaise(amounts: readonly Paise[]): Paise {
  return amounts.reduce<Paise>((total, amount) => total + amount, 0)
}
