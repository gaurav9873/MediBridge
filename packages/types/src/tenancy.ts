/**
 * Multi-tenancy and business configuration.
 *
 * The platform runs two business models from one codebase. The insight that
 * makes that possible without forking:
 *
 *   A private distributor portal is a MARKETPLACE WITH EXACTLY ONE SELLER.
 *
 * Both modes share the same tables, the same order lifecycle and the same
 * inventory model. What differs is only which companies a customer may buy
 * from — one, or many. Every behavioural difference (price comparison, cart
 * splitting, who settles the money) follows from that single fact, so it is
 * expressed as CAPABILITIES rather than as branching business logic.
 *
 * See docs/MULTI-TENANCY.md.
 */

export const BusinessMode = {
  /** Many sellers. Customers compare prices; carts split; the platform settles. */
  MARKETPLACE: 'MARKETPLACE',
  /** One seller, own branding. The company collects its own money. */
  PRIVATE_DISTRIBUTOR: 'PRIVATE_DISTRIBUTOR',
} as const
export type BusinessMode = (typeof BusinessMode)[keyof typeof BusinessMode]

export const CompanyStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
} as const
export type CompanyStatus = (typeof CompanyStatus)[keyof typeof CompanyStatus]

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Everything the platform can be configured to do or not do.
 *
 * No feature is ever checked with `if (mode === MARKETPLACE)`. Code asks
 * "is this capability on?", which is what lets a marketplace-only feature be
 * granted to a private tenant later without touching the feature's code.
 */
export const Capability = {
  /** Show every seller's price for the same medicine, side by side. */
  PRICE_COMPARISON: 'PRICE_COMPARISON',
  /** One cart may contain items from more than one company. */
  MULTI_SELLER_CART: 'MULTI_SELLER_CART',
  /** Platform collects the token and settles sellers on a schedule. */
  MARKETPLACE_SETTLEMENT: 'MARKETPLACE_SETTLEMENT',
  /** Customers may register themselves rather than being invited. */
  SELF_SERVICE_SIGNUP: 'SELF_SERVICE_SIGNUP',

  MULTI_WAREHOUSE: 'MULTI_WAREHOUSE',
  BULK_IMPORT: 'BULK_IMPORT',
  CUSTOM_BRANDING: 'CUSTOM_BRANDING',
  CUSTOM_DOMAIN: 'CUSTOM_DOMAIN',
  CUSTOM_ROLES: 'CUSTOM_ROLES',
  API_ACCESS: 'API_ACCESS',
  ANALYTICS: 'ANALYTICS',
  WHATSAPP_NOTIFICATIONS: 'WHATSAPP_NOTIFICATIONS',
  SMS_NOTIFICATIONS: 'SMS_NOTIFICATIONS',
  CREDIT_TERMS: 'CREDIT_TERMS',
  RETURNS: 'RETURNS',
} as const
export type Capability = (typeof Capability)[keyof typeof Capability]

/**
 * What each mode implies before any plan or override is applied.
 *
 * These are consequences of the model, not upsells: a private portal has one
 * seller, so price comparison and cart splitting are meaningless there, and
 * the platform never touches the money.
 */
export const MODE_CAPABILITIES: Record<BusinessMode, readonly Capability[]> = {
  MARKETPLACE: [
    Capability.PRICE_COMPARISON,
    Capability.MULTI_SELLER_CART,
    Capability.MARKETPLACE_SETTLEMENT,
    Capability.SELF_SERVICE_SIGNUP,
    Capability.MULTI_WAREHOUSE,
    Capability.RETURNS,
  ],
  PRIVATE_DISTRIBUTOR: [
    Capability.CUSTOM_BRANDING,
    Capability.MULTI_WAREHOUSE,
    Capability.CREDIT_TERMS,
    Capability.RETURNS,
  ],
}

/**
 * Capabilities that make no sense in a mode and can never be switched on.
 *
 * A guard against configuration that would produce nonsense — granting
 * MULTI_SELLER_CART to a portal with one seller is not a feature, it is a bug
 * waiting to be reported.
 */
export const MODE_FORBIDDEN_CAPABILITIES: Record<BusinessMode, readonly Capability[]> = {
  MARKETPLACE: [],
  PRIVATE_DISTRIBUTOR: [
    Capability.PRICE_COMPARISON,
    Capability.MULTI_SELLER_CART,
    Capability.MARKETPLACE_SETTLEMENT,
  ],
}

/** The resolved answer for one company, cached per request. */
export interface CompanyCapabilities {
  companyId: string
  mode: BusinessMode
  enabled: ReadonlySet<Capability>
  /** Numeric ceilings from the plan, e.g. warehouses: 3. */
  limits: Readonly<Record<string, number>>
}

export function hasCapability(capabilities: CompanyCapabilities, capability: Capability): boolean {
  return capabilities.enabled.has(capability)
}

// ---------------------------------------------------------------------------
// Payment terms — business configuration, not platform rules
// ---------------------------------------------------------------------------

export const PaymentTermType = {
  /** The original model: a token online, the balance in cash on delivery. */
  TOKEN_PLUS_COD: 'TOKEN_PLUS_COD',
  PREPAID: 'PREPAID',
  COD: 'COD',
  /** Invoice now, pay within N days. Needs a credit limit on the customer. */
  CREDIT: 'CREDIT',
} as const
export type PaymentTermType = (typeof PaymentTermType)[keyof typeof PaymentTermType]

export interface PaymentTerms {
  type: PaymentTermType
  /** TOKEN_PLUS_COD only. The share paid up front. */
  tokenPercent?: number
  /** CREDIT only. 7, 15, 30… */
  creditDays?: number
}

/**
 * Splits an order total according to the company's terms.
 *
 * The one place that decides "how much now, how much later" for every payment
 * model. Rounds the up-front part DOWN so the two halves always add back to
 * exactly the total — a retailer must never be asked for one paisa more than
 * the order is worth.
 */
export function splitByTerms(
  totalPaise: number,
  terms: PaymentTerms,
): { dueNowPaise: number; dueLaterPaise: number; dueInDays: number } {
  switch (terms.type) {
    case PaymentTermType.PREPAID:
      return { dueNowPaise: totalPaise, dueLaterPaise: 0, dueInDays: 0 }

    case PaymentTermType.COD:
      return { dueNowPaise: 0, dueLaterPaise: totalPaise, dueInDays: 0 }

    case PaymentTermType.CREDIT:
      return { dueNowPaise: 0, dueLaterPaise: totalPaise, dueInDays: terms.creditDays ?? 30 }

    case PaymentTermType.TOKEN_PLUS_COD: {
      const percent = terms.tokenPercent ?? 20
      const dueNow = Math.floor((totalPaise * percent) / 100)
      return { dueNowPaise: dueNow, dueLaterPaise: totalPaise - dueNow, dueInDays: 0 }
    }
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Permission keys.
 *
 * Guards check these, never role names. Fixed roles ship in the MVP as bundles
 * of these keys, so enabling custom roles later is a UI feature — the database
 * and the guards do not change.
 */
export const Permission = {
  DASHBOARD_VIEW: 'dashboard.view',

  CUSTOMER_VIEW: 'customer.view',
  CUSTOMER_MANAGE: 'customer.manage',
  CUSTOMER_APPROVE: 'customer.approve',

  PRODUCT_VIEW: 'product.view',
  PRODUCT_MANAGE: 'product.manage',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',

  ORDER_VIEW: 'order.view',
  ORDER_ACCEPT: 'order.accept',
  ORDER_DISPATCH: 'order.dispatch',
  ORDER_CANCEL: 'order.cancel',

  PAYMENT_VIEW: 'payment.view',
  PAYMENT_RECORD: 'payment.record',
  INVOICE_VIEW: 'invoice.view',

  DELIVERY_VIEW: 'delivery.view',
  DELIVERY_MANAGE: 'delivery.manage',

  BULK_IMPORT_RUN: 'bulk.run',
  REPORT_VIEW: 'report.view',

  EMPLOYEE_VIEW: 'employee.view',
  EMPLOYEE_MANAGE: 'employee.manage',
  ROLE_MANAGE: 'role.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',

  /** Platform owner only. Never granted to a company role. */
  PLATFORM_MANAGE_COMPANIES: 'platform.companies',
  PLATFORM_MANAGE_PLANS: 'platform.plans',
  PLATFORM_GLOBAL_CATALOGUE: 'platform.catalogue',
  PLATFORM_VIEW_ALL: 'platform.viewAll',
} as const
export type Permission = (typeof Permission)[keyof typeof Permission]

/** The roles seeded into every new company. Bundles of the keys above. */
export const SystemRole = {
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  SALES_EXECUTIVE: 'SALES_EXECUTIVE',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  DELIVERY_STAFF: 'DELIVERY_STAFF',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
} as const
export type SystemRole = (typeof SystemRole)[keyof typeof SystemRole]

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  COMPANY_ADMIN: Object.values(Permission).filter(
    (key) => !key.startsWith('platform.'),
  ) as Permission[],

  SALES_EXECUTIVE: [
    Permission.DASHBOARD_VIEW,
    Permission.CUSTOMER_VIEW,
    Permission.CUSTOMER_MANAGE,
    Permission.PRODUCT_VIEW,
    Permission.INVENTORY_VIEW,
    Permission.ORDER_VIEW,
    Permission.ORDER_ACCEPT,
    Permission.REPORT_VIEW,
  ],

  WAREHOUSE_MANAGER: [
    Permission.DASHBOARD_VIEW,
    Permission.PRODUCT_VIEW,
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_MANAGE,
    Permission.ORDER_VIEW,
    Permission.ORDER_DISPATCH,
    Permission.DELIVERY_VIEW,
    Permission.DELIVERY_MANAGE,
    Permission.BULK_IMPORT_RUN,
  ],

  INVENTORY_MANAGER: [
    Permission.DASHBOARD_VIEW,
    Permission.PRODUCT_VIEW,
    Permission.PRODUCT_MANAGE,
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_MANAGE,
    Permission.BULK_IMPORT_RUN,
    Permission.REPORT_VIEW,
  ],

  ACCOUNTANT: [
    Permission.DASHBOARD_VIEW,
    Permission.ORDER_VIEW,
    Permission.PAYMENT_VIEW,
    Permission.PAYMENT_RECORD,
    Permission.INVOICE_VIEW,
    Permission.REPORT_VIEW,
    Permission.CUSTOMER_VIEW,
  ],

  DELIVERY_STAFF: [Permission.DELIVERY_VIEW, Permission.DELIVERY_MANAGE, Permission.ORDER_VIEW],

  CUSTOMER_SUPPORT: [
    Permission.DASHBOARD_VIEW,
    Permission.CUSTOMER_VIEW,
    Permission.ORDER_VIEW,
    Permission.DELIVERY_VIEW,
    Permission.PAYMENT_VIEW,
  ],
}

/** Human labels. Kept here rather than in copy because they seed the database. */
export const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  COMPANY_ADMIN: 'Company Admin',
  SALES_EXECUTIVE: 'Sales Executive',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
  DELIVERY_STAFF: 'Delivery Staff',
  CUSTOMER_SUPPORT: 'Customer Support',
}

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

/**
 * Who is asking, and on whose behalf.
 *
 * Resolved once per request and used to set the database session variables
 * that drive Row-Level Security. `companyId` is never taken from the request
 * body — only from the authenticated session or the resolved subdomain.
 */
export interface TenantContext {
  companyId: string | null
  /** Set when the caller is a customer rather than company staff. */
  customerId: string | null
  /** True only for the platform owner. Bypasses RLS deliberately. */
  isPlatformOwner: boolean
  mode: BusinessMode | null
}

/**
 * The permission catalogue, grouped and in plain words.
 *
 * A permissions screen showing `inventory.manage` asks the reader to guess.
 * These labels are what a pharmacy owner actually chooses between, so they live
 * beside the keys rather than being invented separately in the UI — a key
 * without a label here would show up as a blank tick-box, which is the kind of
 * mistake worth making impossible.
 *
 * Platform-only keys are deliberately absent: they are never granted to a
 * company role, so offering them would be offering something that cannot work.
 */
export const PERMISSION_GROUPS: ReadonlyArray<{
  key: string
  label: string
  permissions: ReadonlyArray<{ key: Permission; label: string }>
}> = [
  {
    key: 'general',
    label: 'General',
    permissions: [{ key: Permission.DASHBOARD_VIEW, label: 'See the dashboard' }],
  },
  {
    key: 'customers',
    label: 'Customers',
    permissions: [
      { key: Permission.CUSTOMER_VIEW, label: 'See customers' },
      { key: Permission.CUSTOMER_MANAGE, label: 'Add and edit customers' },
      { key: Permission.CUSTOMER_APPROVE, label: 'Approve new customers' },
    ],
  },
  {
    key: 'catalogue',
    label: 'Medicines and stock',
    permissions: [
      { key: Permission.PRODUCT_VIEW, label: 'See the medicine list' },
      { key: Permission.PRODUCT_MANAGE, label: 'Add and edit medicines' },
      { key: Permission.INVENTORY_VIEW, label: 'See stock and prices' },
      { key: Permission.INVENTORY_MANAGE, label: 'Change stock and prices' },
      { key: Permission.BULK_IMPORT_RUN, label: 'Import from a file' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    permissions: [
      { key: Permission.ORDER_VIEW, label: 'See orders' },
      { key: Permission.ORDER_ACCEPT, label: 'Accept orders' },
      { key: Permission.ORDER_DISPATCH, label: 'Pack and dispatch orders' },
      { key: Permission.ORDER_CANCEL, label: 'Cancel orders' },
    ],
  },
  {
    key: 'money',
    label: 'Payments',
    permissions: [
      { key: Permission.PAYMENT_VIEW, label: 'See payments' },
      { key: Permission.PAYMENT_RECORD, label: 'Record a payment received' },
      { key: Permission.INVOICE_VIEW, label: 'See invoices' },
    ],
  },
  {
    key: 'delivery',
    label: 'Delivery',
    permissions: [
      { key: Permission.DELIVERY_VIEW, label: 'See deliveries' },
      { key: Permission.DELIVERY_MANAGE, label: 'Assign and update deliveries' },
    ],
  },
  {
    key: 'business',
    label: 'Business settings',
    permissions: [
      { key: Permission.REPORT_VIEW, label: 'See reports' },
      { key: Permission.EMPLOYEE_VIEW, label: 'See the team' },
      { key: Permission.EMPLOYEE_MANAGE, label: 'Add and remove team members' },
      { key: Permission.ROLE_MANAGE, label: 'Manage roles' },
      { key: Permission.SETTINGS_MANAGE, label: 'Change business settings' },
      { key: Permission.AUDIT_VIEW, label: 'See the activity log' },
    ],
  },
]

/** Every permission a company role may hold — the catalogue, flattened. */
export const COMPANY_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((entry) => entry.key),
)

/**
 * The things we would tell someone about, in plain words.
 *
 * Only the events a person can sensibly opt out of. Nothing here is required
 * reading — an order being cancelled reaches them in the app regardless; this
 * decides whether it also costs an SMS.
 *
 * Absent preference rows mean ON, so adding an event here reaches people by
 * default rather than silently not reaching them until they find the screen.
 */
export const NOTIFIABLE_EVENTS: ReadonlyArray<{
  key: string
  label: string
  description: string
}> = [
  {
    key: 'ORDER_PLACED',
    label: 'A new order arrives',
    description: 'Someone has placed an order with you.',
  },
  {
    key: 'ORDER_CONFIRMED',
    label: 'An order is confirmed',
    description: 'Payment went through and the order is live.',
  },
  {
    key: 'ORDER_DISPATCHED',
    label: 'An order is on its way',
    description: 'The order has left the warehouse.',
  },
  {
    key: 'ORDER_DELIVERED',
    label: 'An order is delivered',
    description: 'The medicines reached the shop.',
  },
  {
    key: 'ORDER_CANCELLED',
    label: 'An order is cancelled',
    description: 'Either side cancelled before delivery.',
  },
  {
    key: 'PAYMENT_RECEIVED',
    label: 'A payment arrives',
    description: 'Money reached your account.',
  },
  {
    key: 'LICENSE_EXPIRING',
    label: 'A licence is about to expire',
    description: 'Ninety days before it lapses, then again closer to the date.',
  },
  {
    key: 'LOW_STOCK',
    label: 'Stock is running low',
    description: 'A batch has dropped below the level you set.',
  },
  {
    key: 'BATCH_EXPIRING',
    label: 'A batch is nearing expiry',
    description: 'Time to discount it or send it back.',
  },
  {
    key: 'SETTLEMENT_PAID',
    label: 'A settlement is paid',
    description: 'Your weekly payout has been sent.',
  },
]
