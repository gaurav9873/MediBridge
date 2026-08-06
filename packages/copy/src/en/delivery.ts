import type { EmptyState, FieldHelp, PageHelp, PageMeta } from '../types.js'

/**
 * Delivery tracking and the OTP handover.
 *
 * In the MVP the distributor delivers with their own people; MediBridge only
 * tracks status and verifies the handover with a code.
 */

export const delivery = {
  status: {
    NOT_STARTED: 'Not Started',
    ASSIGNED: 'Delivery Person Assigned',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    FAILED: 'Could Not Deliver',
    RETURNED: 'Returned to Distributor',
  },

  statusExplained: {
    NOT_STARTED: 'The distributor has not sent this order out yet.',
    ASSIGNED: 'A delivery person has been given this order.',
    OUT_FOR_DELIVERY: 'Your order is on its way to you now.',
    DELIVERED: 'This order reached you and the balance was paid.',
    FAILED: 'We could not deliver this order. We will try again tomorrow.',
    RETURNED: 'This order went back to the distributor.',
  },

  tracking: {
    page: {
      title: 'Track Your Delivery',
      subtitle: 'See where your order is and what to have ready.',
    } satisfies PageMeta,
    expectedBy: (time: string) => `Expected by ${time}`,
    deliveryPerson: 'Delivery person',
    callDeliveryPerson: 'Call Delivery Person',
    /** The retailer reads this code out; the delivery person enters it. */
    otpHeading: 'Your delivery code',
    otpBody:
      'Give this 4-digit code to the delivery person when your medicines arrive. Do not share it before then.',
    balanceHeading: 'Keep this ready',
    balanceBody: (amount: string) => `Please have ${amount} ready in cash.`,
    help: {
      whatIsThis:
        'This page shows where your order has reached and what you need to have ready when it arrives.',
      topics: [
        {
          question: 'What is the delivery code for?',
          answer:
            'It proves your order reached the right person. Only give it to the delivery person once your medicines are actually in your hands.',
        },
        {
          question: 'Can I pay the balance by UPI instead of cash?',
          answer:
            'Not yet. The balance is collected in cash at your shop. We are working on adding UPI on delivery.',
        },
        {
          question: 'Nobody came and my order says "Could Not Deliver".',
          answer:
            'The delivery person will try again the next working day. If it keeps happening, tap "Report a Problem" on the order and we will step in.',
        },
      ],
    } satisfies PageHelp,
  },

  /** The screen the delivery person uses to close out an order. */
  handover: {
    page: {
      title: 'Complete Delivery',
      subtitle: 'Collect the balance, then enter the code from the retailer.',
    } satisfies PageMeta,
    collectHeading: 'Collect this amount',
    fields: {
      otp: {
        label: 'Delivery Code',
        helperText: 'Ask the retailer for their 4-digit code and enter it here.',
        placeholder: '1234',
      } satisfies FieldHelp,
      cashCollected: {
        label: 'Cash Collected',
        helperText: 'Confirm the exact amount you received from the retailer.',
      } satisfies FieldHelp,
    },
    confirm: 'Confirm Delivery',
    success: 'Delivery completed. Thank you.',
    failCta: 'Could Not Deliver',
    failDialog: {
      title: 'Could not deliver this order?',
      body: 'The retailer will be told, and you can try again on the next working day.',
      reasonField: {
        label: 'What happened?',
        helperText: 'Tell us why you could not deliver so we can inform the retailer.',
      } satisfies FieldHelp,
      confirm: 'Yes, Report It',
    },
  },

  /** Distributor's Same-Day service area — feeds the PostGIS radius query. */
  radius: {
    fields: {
      radiusKm: {
        label: 'Same-Day Delivery Radius',
        helperText: 'Orders within this distance are eligible for Same-Day Delivery.',
        placeholder: '25',
        tooltip:
          'Retailers further away than this will still see your medicines, but their orders will be delivered the next day instead.',
      } satisfies FieldHelp,
      cutoffTime: {
        label: 'Same-Day Cut-Off Time',
        helperText: 'Orders placed after this time will be delivered the next day.',
        placeholder: '14:00',
        tooltip:
          'Set this to the latest time you can still pack and send an order out on the same day.',
      } satisfies FieldHelp,
      deliveryCharge: {
        label: 'Delivery Charge',
        helperText: 'What you charge per order for delivery. Enter 0 for free delivery.',
      } satisfies FieldHelp,
      freeAbove: {
        label: 'Free Delivery Above',
        helperText: 'Orders above this amount get free delivery. Leave empty to always charge.',
      } satisfies FieldHelp,
    },
    success: 'Delivery settings saved.',
    coverageNote: (count: number) =>
      count === 1
        ? '1 retailer is inside your Same-Day area.'
        : `${count} retailers are inside your Same-Day area.`,
  },

  list: {
    page: {
      title: 'Deliveries',
      subtitle: 'Orders that are packed, out for delivery, or delivered.',
    } satisfies PageMeta,
    empty: {
      title: 'No deliveries yet',
      body: 'Once you dispatch an order it will show up here so you can follow it to the retailer.',
      action: { label: 'View Orders', href: '/orders' },
    } satisfies EmptyState,
  },
} as const
