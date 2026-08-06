import { account } from './account.js'
import { admin } from './admin.js'
import { auth } from './auth.js'
import { catalog } from './catalog.js'
import { common } from './common.js'
import { dashboard } from './dashboard.js'
import { delivery } from './delivery.js'
import { inventory } from './inventory.js'
import { orders } from './orders.js'
import { payments } from './payments.js'
import { validation } from './validation.js'

/**
 * The complete English copy tree.
 *
 * A second locale is added by creating `hi/index.ts` with this exact shape —
 * TypeScript will then list every string still missing a translation.
 */
export const en = {
  common,
  validation,
  auth,
  dashboard,
  catalog,
  inventory,
  orders,
  payments,
  delivery,
  account,
  admin,
} as const
