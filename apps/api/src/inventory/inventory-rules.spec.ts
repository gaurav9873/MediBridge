import {
  EXPIRY_WARNING_DAYS,
  MINIMUM_SHELF_LIFE_DAYS,
  availableQuantity,
  canSetQuantityTo,
  canTransfer,
  daysUntilExpiry,
  expiryStatus,
  hasMinimumShelfLife,
  isLowStock,
  stockLevel,
  transferableQuantity,
} from '@medibridge/types'

/**
 * Stock and expiry.
 *
 * Both sit squarely on MODULE-STANDARD's "test this" list: one is arithmetic
 * that decides what may be sold, the other is date comparison that decides
 * what may be sold legally. Getting the first wrong sells the same unit twice;
 * getting the second wrong puts an expired medicine on a pharmacy's shelf.
 *
 * Dates are passed in explicitly rather than relying on the clock, so these
 * cannot start failing overnight or on a leap day.
 */

/** A fixed "today" so every expectation below is stable. */
const NOW = new Date('2026-06-15T09:30:00Z')
const daysFromNow = (days: number): Date =>
  new Date(Date.UTC(2026, 5, 15 + days, 0, 0, 0))

describe('what is actually available to sell', () => {
  it('subtracts what is already in somebody else’s cart', () => {
    // Selling against the physical count is how one unit gets promised twice,
    // and the second retailer finds out at delivery.
    expect(availableQuantity({ quantity: 100, reservedQuantity: 30 })).toBe(70)
  })

  it('never goes negative when a correction lands mid-checkout', () => {
    // Stock corrected down while carts hold more than the new count. A
    // negative "available" would read as a debt rather than as nothing to sell.
    expect(availableQuantity({ quantity: 5, reservedQuantity: 20 })).toBe(0)
  })
})

describe('how stock reads', () => {
  const threshold = 10

  it('is out of stock when everything is reserved', () => {
    // The shelf is full, but none of it can be sold. Telling a distributor
    // they are well stocked here is how it stays that way.
    expect(stockLevel({ quantity: 50, reservedQuantity: 50, lowStockThreshold: threshold })).toBe(
      'outOfStock',
    )
  })

  it('warns at the threshold, not below it', () => {
    // "Warn me at 10" has to fire AT 10. Off by one here is a distributor
    // finding out they are empty one order too late.
    expect(stockLevel({ quantity: 10, reservedQuantity: 0, lowStockThreshold: threshold })).toBe(
      'lowStock',
    )
    expect(stockLevel({ quantity: 11, reservedQuantity: 0, lowStockThreshold: threshold })).toBe(
      'inStock',
    )
  })

  it('judges the warning on available stock, not physical', () => {
    // 40 on the shelf, 32 spoken for: 8 sellable, which is low.
    expect(isLowStock({ quantity: 40, reservedQuantity: 32, lowStockThreshold: threshold })).toBe(
      true,
    )
  })

  it('uses the design system’s own status keys', () => {
    // These feed stockPresentation directly. A renamed key would silently lose
    // the icon and the colour.
    expect(['outOfStock', 'lowStock', 'inStock']).toContain(
      stockLevel({ quantity: 1, reservedQuantity: 0, lowStockThreshold: 0 }),
    )
  })
})

describe('correcting a stock count', () => {
  const item = { quantity: 100, reservedQuantity: 20 }

  it('refuses to go below what is reserved', () => {
    // Those 20 belong to carts already mid-checkout. Dropping to 15 oversells
    // stock that has effectively been sold.
    expect(canSetQuantityTo(item, 15)).toBe(false)
    expect(canSetQuantityTo(item, 20)).toBe(true)
  })

  it('refuses a negative count', () => {
    expect(canSetQuantityTo({ quantity: 10, reservedQuantity: 0 }, -1)).toBe(false)
  })

  it('allows zero when nothing is reserved', () => {
    // Selling out is normal and must not need a workaround.
    expect(canSetQuantityTo({ quantity: 10, reservedQuantity: 0 }, 0)).toBe(true)
  })
})

describe('days until expiry', () => {
  it('counts calendar days, not elapsed hours', () => {
    // A batch expiring today, checked at 09:30, has 0 days left — not -1.
    // Comparing instants rounds the current day away and reports today's
    // stock as already expired.
    expect(daysUntilExpiry(daysFromNow(0), NOW)).toBe(0)
    expect(daysUntilExpiry(daysFromNow(1), NOW)).toBe(1)
  })

  it('goes negative once it has passed', () => {
    expect(daysUntilExpiry(daysFromNow(-3), NOW)).toBe(-3)
  })

  it('crosses a month boundary correctly', () => {
    expect(daysUntilExpiry(new Date(Date.UTC(2026, 6, 15)), NOW)).toBe(30)
  })
})

describe('expiry status', () => {
  it('calls today fresh enough to still be on the shelf, not expired', () => {
    // Stock expiring today is legally sellable today. Marking it expired
    // pulls a day of sellable stock off the list.
    expect(expiryStatus(daysFromNow(0), NOW)).toBe('expiringSoon')
  })

  it('is expired from the day after', () => {
    expect(expiryStatus(daysFromNow(-1), NOW)).toBe('expired')
  })

  it('warns inside the warning window and not outside it', () => {
    expect(expiryStatus(daysFromNow(EXPIRY_WARNING_DAYS), NOW)).toBe('expiringSoon')
    expect(expiryStatus(daysFromNow(EXPIRY_WARNING_DAYS + 1), NOW)).toBe('fresh')
  })
})

describe('minimum shelf life to list a batch', () => {
  it('accepts exactly the minimum', () => {
    expect(hasMinimumShelfLife(daysFromNow(MINIMUM_SHELF_LIFE_DAYS), NOW)).toBe(true)
  })

  it('refuses a day under', () => {
    // A pharmacy cannot shift stock that dies in a fortnight, so listing it
    // produces a complaint and a return rather than a sale.
    expect(hasMinimumShelfLife(daysFromNow(MINIMUM_SHELF_LIFE_DAYS - 1), NOW)).toBe(false)
  })

  it('refuses stock that has already expired', () => {
    expect(hasMinimumShelfLife(daysFromNow(-1), NOW)).toBe(false)
  })

  it('is stricter than the expiry warning, not the other way round', () => {
    // If the listing floor ever exceeded the warning window, a batch would be
    // unlistable before anyone was told it was expiring.
    expect(MINIMUM_SHELF_LIFE_DAYS).toBeLessThan(EXPIRY_WARNING_DAYS)
  })
})

describe('moving stock between your own warehouses', () => {
  const item = { quantity: 100, reservedQuantity: 30 }

  it('can only move what is free to sell', () => {
    // Reserved units belong to carts mid-checkout AT THIS warehouse. Moving
    // them would leave those orders to be picked from a shelf that no longer
    // has the stock.
    expect(transferableQuantity(item)).toBe(70)
    expect(canTransfer(item, 70)).toBe(true)
    expect(canTransfer(item, 71)).toBe(false)
  })

  it('refuses nothing, negatives and fractions', () => {
    // A fraction of a strip is not a thing that can be put on a lorry.
    expect(canTransfer(item, 0)).toBe(false)
    expect(canTransfer(item, -5)).toBe(false)
    expect(canTransfer(item, 1.5)).toBe(false)
  })

  it('refuses everything when the whole batch is spoken for', () => {
    expect(transferableQuantity({ quantity: 40, reservedQuantity: 40 })).toBe(0)
    expect(canTransfer({ quantity: 40, reservedQuantity: 40 }, 1)).toBe(false)
  })
})
