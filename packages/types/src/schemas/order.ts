import { copy } from '@medibridge/copy'
import { z } from 'zod'
import { DeliveryMode } from '../enums.js'
import { otpSchema, paiseSchema, quantitySchema } from './common.js'

const v = copy.validation

export const cartItemSchema = z.object({
  inventoryItemId: z.uuid(),
  quantity: quantitySchema,
})
export type CartItemInput = z.infer<typeof cartItemSchema>

export const updateCartItemSchema = z.object({
  inventoryItemId: z.uuid(),
  quantity: z.number().int().nonnegative(v.number.positive),
})

/**
 * Checkout.
 *
 * `expectedTotalPaise` is the total the retailer saw on screen. The server
 * re-prices the cart and refuses if it no longer matches, so nobody is ever
 * charged a price they did not agree to. The UI then shows the new prices and
 * asks them to accept.
 */
export const checkoutSchema = z.object({
  addressId: z.uuid(v.selectRequired('delivery address')),
  deliveryMode: z.enum(DeliveryMode, v.selectRequired('delivery speed')),
  notes: z.string().trim().max(500, v.text.tooLong(500)).optional(),
  expectedTotalPaise: paiseSchema,
  /** Guards against a double-tapped checkout button creating two orders. */
  idempotencyKey: z.uuid(),
})
export type CheckoutInput = z.infer<typeof checkoutSchema>

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, v.requiredNamed('reason')).max(500, v.text.tooLong(500)),
})

export const rejectOrderSchema = z.object({
  reason: z.string().trim().min(3, v.requiredNamed('reason')).max(500, v.text.tooLong(500)),
})

/** Distributor supplying less than was ordered. */
export const partialAcceptSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.uuid(),
        acceptedQuantity: z.number().int().nonnegative(v.number.positive),
      }),
    )
    .min(1, 'Please set a quantity for at least one item.'),
})
export type PartialAcceptInput = z.infer<typeof partialAcceptSchema>

export const dispatchOrderSchema = z.object({
  deliveryPersonName: z
    .string()
    .trim()
    .min(2, v.requiredNamed('delivery person name'))
    .max(120, v.text.tooLong(120)),
  deliveryPersonPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, v.phone.invalid),
})
export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>

/** Handover: the retailer reads out a 4-digit code, the delivery person types it. */
export const completeDeliverySchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Please enter the 4-digit delivery code.'),
  cashCollectedPaise: paiseSchema,
})
export type CompleteDeliveryInput = z.infer<typeof completeDeliverySchema>

export const failDeliverySchema = z.object({
  reason: z.string().trim().min(3, v.requiredNamed('reason')).max(500, v.text.tooLong(500)),
})

export const reportProblemSchema = z.object({
  category: z.enum(['MISSING_ITEM', 'DAMAGED', 'WRONG_ITEM', 'EXPIRY_TOO_SOON', 'OTHER'], {
    error: v.selectRequired('problem type'),
  }),
  description: z.string().trim().min(10, v.text.tooShort(10)).max(1000, v.text.tooLong(1000)),
})
export type ReportProblemInput = z.infer<typeof reportProblemSchema>

/** Razorpay verification payload, checked server-side before confirming an order. */
export const verifyPaymentSchema = z.object({
  gatewayOrderId: z.string().min(1),
  gatewayPaymentId: z.string().min(1),
  signature: z.string().min(1),
})
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>

/** Re-export so the delivery module can validate its own OTP length separately. */
export const deliveryOtpSchema = otpSchema

/**
 * What checkout returns. The split into several orders is the normal case, not
 * an edge case, so the response is always a group.
 */
export interface CheckoutResult {
  orderGroupId: string
  orderGroupNumber: string
  orders: Array<{
    id: string
    orderNumber: string
    distributorName: string
    deliveryMode: DeliveryMode
    totalPaise: number
  }>
  tokenAmountPaise: number
  balanceAmountPaise: number
  /** Razorpay order id the browser hands to the checkout widget. */
  gatewayOrderId: string
}

/** Same-Day availability, computed per warehouse from the PostGIS distance. */
export interface DeliveryAvailability {
  warehouseId: string
  distanceKm: number
  radiusKm: number
  sameDayAvailable: boolean
  cutoffTime: string
  cutoffPassed: boolean
  mode: DeliveryMode
  estimatedBy: string
}
