/**
 * Domain enums, shared by the API, the web app and the Prisma schema.
 *
 * These are the single source of truth. The Prisma schema mirrors them exactly,
 * and `assertEnumsMatchPrisma` in the API's test suite fails the build if the
 * two ever drift apart.
 */

export const UserRole = {
  RETAILER: 'RETAILER',
  DISTRIBUTOR: 'DISTRIBUTOR',
  ADMIN: 'ADMIN',
  DELIVERY: 'DELIVERY',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const AccountStatus = {
  /** Signed up, documents submitted, waiting for an admin to check them. */
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  /** Blocked by an admin. Can't sign in. */
  SUSPENDED: 'SUSPENDED',
  /** Documents were rejected. Can sign in and re-upload, but not order. */
  REJECTED: 'REJECTED',
} as const
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus]

export const DocumentType = {
  DRUG_LICENSE: 'DRUG_LICENSE',
  GST_CERTIFICATE: 'GST_CERTIFICATE',
} as const
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType]

export const VerificationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus]

/**
 * Indian drug schedules.
 *
 * Schedule X is blocked platform-wide in the MVP — narcotics and psychotropics
 * carry record-keeping duties (Form 2C register, duplicate prescriptions) we
 * are not building yet. H and H1 are allowed because we already verify that
 * every buyer holds a current drug license.
 */
export const DrugSchedule = {
  NONE: 'NONE',
  H: 'H',
  H1: 'H1',
  X: 'X',
} as const
export type DrugSchedule = (typeof DrugSchedule)[keyof typeof DrugSchedule]

/** Schedules that may not be listed or sold. Enforced in the medicine service. */
export const BLOCKED_SCHEDULES: readonly DrugSchedule[] = [DrugSchedule.X]

export const MedicineForm = {
  TABLET: 'TABLET',
  CAPSULE: 'CAPSULE',
  SYRUP: 'SYRUP',
  INJECTION: 'INJECTION',
  OINTMENT: 'OINTMENT',
  CREAM: 'CREAM',
  DROPS: 'DROPS',
  POWDER: 'POWDER',
  INHALER: 'INHALER',
  SPRAY: 'SPRAY',
  GEL: 'GEL',
  SACHET: 'SACHET',
  OTHER: 'OTHER',
} as const
export type MedicineForm = (typeof MedicineForm)[keyof typeof MedicineForm]

/** How a distributor sells a given batch. Drives the quantity wording in the UI. */
export const SaleUnit = {
  STRIP: 'STRIP',
  BOX: 'BOX',
  BOTTLE: 'BOTTLE',
  VIAL: 'VIAL',
  TUBE: 'TUBE',
  PIECE: 'PIECE',
  PACK: 'PACK',
} as const
export type SaleUnit = (typeof SaleUnit)[keyof typeof SaleUnit]

/**
 * Order lifecycle.
 *
 * Transitions are enforced centrally by ORDER_TRANSITIONS below — no service
 * writes `status` directly.
 */
export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  ACCEPTED: 'ACCEPTED',
  PACKED: 'PACKED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
} as const
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

/**
 * The only legal status moves. Anything not listed here is rejected.
 *
 * Note that CANCELLED is reachable up to PACKED but not after — once a box is
 * packed, unwinding it is a returns problem, not a cancellation.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED'],
  DISPATCHED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  REJECTED: [],
  RETURNED: [],
} as const

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/** Statuses where the retailer may still cancel without involving support. */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CONFIRMED,
  OrderStatus.ACCEPTED,
]

/** Statuses that count as "still happening" for dashboards and filters. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.ACCEPTED,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
]

export const DeliveryMode = {
  SAME_DAY: 'SAME_DAY',
  NEXT_DAY: 'NEXT_DAY',
} as const
export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode]

export const DeliveryStatus = {
  NOT_STARTED: 'NOT_STARTED',
  ASSIGNED: 'ASSIGNED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED',
} as const
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus]

export const PaymentType = {
  /** The 20% paid online to confirm the order. */
  TOKEN: 'TOKEN',
  /** The 80% collected in cash on delivery. */
  BALANCE: 'BALANCE',
  REFUND: 'REFUND',
} as const
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType]

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]

export const PaymentMethod = {
  UPI: 'UPI',
  CARD: 'CARD',
  NETBANKING: 'NETBANKING',
  WALLET: 'WALLET',
  CASH: 'CASH',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const PaymentGateway = {
  RAZORPAY: 'RAZORPAY',
  CASHFREE: 'CASHFREE',
  /** Cash collected by the delivery person — no gateway involved. */
  MANUAL: 'MANUAL',
} as const
export type PaymentGateway = (typeof PaymentGateway)[keyof typeof PaymentGateway]

/** Weekly payout of collected token payments to distributors. */
export const SettlementStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
} as const
export type SettlementStatus = (typeof SettlementStatus)[keyof typeof SettlementStatus]

export const NotificationChannel = {
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  IN_APP: 'IN_APP',
} as const
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel]

export const NotificationEvent = {
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_ACCEPTED: 'ORDER_ACCEPTED',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_PACKED: 'ORDER_PACKED',
  ORDER_DISPATCHED: 'ORDER_DISPATCHED',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  ACCOUNT_APPROVED: 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED: 'ACCOUNT_REJECTED',
  LICENSE_EXPIRING: 'LICENSE_EXPIRING',
  LICENSE_EXPIRED: 'LICENSE_EXPIRED',
  LOW_STOCK: 'LOW_STOCK',
  BATCH_EXPIRING: 'BATCH_EXPIRING',
  NEW_ORDER_RECEIVED: 'NEW_ORDER_RECEIVED',
  SETTLEMENT_PAID: 'SETTLEMENT_PAID',
} as const
export type NotificationEvent = (typeof NotificationEvent)[keyof typeof NotificationEvent]

/** Notifications the user cannot switch off — they carry money or legal weight. */
export const MANDATORY_NOTIFICATIONS: readonly NotificationEvent[] = [
  NotificationEvent.PAYMENT_RECEIVED,
  NotificationEvent.PAYMENT_FAILED,
  NotificationEvent.REFUND_INITIATED,
  NotificationEvent.LICENSE_EXPIRING,
  NotificationEvent.LICENSE_EXPIRED,
  NotificationEvent.ACCOUNT_APPROVED,
  NotificationEvent.ACCOUNT_REJECTED,
]
