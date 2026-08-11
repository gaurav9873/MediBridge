/**
 * Which of a buyer's relationships to show when only one can be shown.
 *
 * A buyer now holds one Customer row per distributor they trade with, but a
 * session, a user list and a licence queue each have room for exactly one
 * trading name. This picks the same one everywhere, so a shop is not called
 * "Sharma Medical Store" on one screen and something else on another.
 *
 * Approved relationships win, most recently approved first; an unapproved one
 * is only used when there is nothing else. `nulls: 'last'` is what does that —
 * without it Postgres sorts NULLs first on a descending sort and an unapproved
 * relationship would outrank a live one.
 *
 * While a buyer has a single distributor this is simply "their relationship".
 * It becomes a real choice when they have several, and having the rule in one
 * place is what stops each call site inventing its own.
 */
export const PRIMARY_CUSTOMER_PROFILE = {
  where: { deletedAt: null },
  orderBy: { approvedAt: { sort: 'desc', nulls: 'last' } },
  take: 1,
} as const

/** The chosen relationship, or null when this user is not a buyer anywhere. */
export function primaryProfile<T>(profiles: readonly T[] | undefined): T | null {
  return profiles?.[0] ?? null
}
