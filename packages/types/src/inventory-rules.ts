/**
 * What stock is, and when there is enough of it.
 *
 * Deliberately NOT in `medicine-rules.ts`. Quantity, reservation and low-stock
 * thresholds are platform concerns — surgical supplies would count stock the
 * same way. What is pharmaceutical is *expiry*, and that lives with the
 * medicine rules. The split is the same one MODULE-STANDARD draws: the
 * platform ships orders, stock and money; the medicine domain knows what
 * Schedule H means.
 *
 * Nothing here touches a database, a tenant or a request.
 */

/** A batch as far as these rules are concerned. */
export interface StockCounts {
  /** Physical units on the shelf. */
  quantity: number
  /** Units held for carts mid-checkout. Never sold twice. */
  reservedQuantity: number
}

export interface StockLevels extends StockCounts {
  lowStockThreshold: number
}

/**
 * What a retailer can actually buy right now.
 *
 * Physical stock minus what other people already have in their carts. Selling
 * against the physical count is how one unit gets promised to two buyers, and
 * the second one finds out at delivery.
 *
 * Clamped at zero: a reservation can briefly exceed the count when stock is
 * corrected downwards mid-checkout, and a negative "available" would read as a
 * debt rather than as nothing to sell.
 */
export function availableQuantity(item: StockCounts): number {
  return Math.max(0, item.quantity - item.reservedQuantity)
}

export type StockLevel = 'outOfStock' | 'lowStock' | 'inStock'

/**
 * How a batch's stock reads.
 *
 * Keys match `stockPresentation` in the design system, so a level never has to
 * be turned into an icon and a colour at the call site.
 *
 * Judged on AVAILABLE rather than physical stock: a distributor whose entire
 * shelf is reserved has nothing to sell, and telling them they are well
 * stocked is how it stays that way.
 */
export function stockLevel(item: StockLevels): StockLevel {
  const available = availableQuantity(item)
  if (available === 0) return 'outOfStock'
  if (available <= item.lowStockThreshold) return 'lowStock'
  return 'inStock'
}

export function isLowStock(item: StockLevels): boolean {
  return stockLevel(item) === 'lowStock'
}

/**
 * Whether stock can be corrected down to `next` without breaking a promise.
 *
 * Reserved units belong to carts that are already mid-checkout. Setting the
 * count below them would oversell stock that has effectively been sold, so a
 * correction that low has to wait for those carts to resolve.
 */
export function canSetQuantityTo(item: StockCounts, next: number): boolean {
  return next >= 0 && next >= item.reservedQuantity
}

/**
 * How much of a batch may be moved to another warehouse.
 *
 * The same answer as "how much can be sold": reserved units belong to carts
 * that are mid-checkout at THIS warehouse, and moving them would leave those
 * orders to be picked from a shelf that no longer has the stock.
 */
export function transferableQuantity(item: StockCounts): number {
  return availableQuantity(item)
}

/** Whether a proposed transfer is a whole, positive, affordable amount. */
export function canTransfer(item: StockCounts, quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= transferableQuantity(item)
}
