import type { EmptyState, PageHelp, PageMeta } from '../types.js'

/**
 * Payments, refunds and distributor settlements.
 *
 * Money wording is where vague language does the most damage, so every
 * sentence here names an amount, a direction and a timeframe.
 */

export const payments = {
  type: {
    TOKEN: 'Token Payment (20%)',
    BALANCE: 'Balance Payment (80%)',
    REFUND: 'Refund',
  },

  status: {
    PENDING: 'Waiting',
    PAID: 'Paid',
    FAILED: 'Failed',
    REFUNDED: 'Refunded',
    PARTIALLY_REFUNDED: 'Partly Refunded',
  },

  statusExplained: {
    PENDING: 'We are waiting for this payment to complete.',
    PAID: 'This payment went through successfully.',
    FAILED: 'This payment did not go through. Any money taken is returned automatically.',
    REFUNDED: 'This payment has been returned to you in full.',
    PARTIALLY_REFUNDED: 'Part of this payment has been returned to you.',
  },

  method: {
    UPI: 'UPI',
    CARD: 'Card',
    NETBANKING: 'Net Banking',
    WALLET: 'Wallet',
    CASH: 'Cash on Delivery',
  },

  list: {
    page: {
      title: 'Payments',
      subtitle: 'Every payment and refund on your account.',
    } satisfies PageMeta,
    columns: {
      date: 'Date',
      order: 'Order',
      type: 'Type',
      method: 'Paid By',
      amount: 'Amount',
      status: 'Status',
    },
    empty: {
      title: 'No payments yet',
      body: 'Your token payments, cash collections and refunds will all appear here once you start ordering.',
      action: { label: 'Search Medicines', href: '/search' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'A record of every rupee that has moved on your account — what you paid online, what you paid in cash, and anything refunded to you.',
      topics: [
        {
          question: 'What is a token payment?',
          answer:
            'It is the 20% you pay online to confirm an order. The remaining 80% is paid in cash when your medicines are delivered.',
        },
        {
          question: 'How long does a refund take?',
          answer:
            'Refunds go back to the same account you paid from, and usually take 5 to 7 working days. Your bank decides the exact timing.',
        },
        {
          question: 'Money left my account but my order did not confirm.',
          answer:
            'This happens occasionally when a payment is interrupted. The money is returned automatically within 5 to 7 working days. If it has been longer, call us on 1800-000-0000.',
        },
      ],
    } satisfies PageHelp,
  },

  gateway: {
    redirecting: 'Taking you to the payment page…',
    verifying: 'Confirming your payment…',
    /** Shown during verification, when navigating away could orphan the order. */
    doNotClose: 'Please do not close or refresh this page.',
    success: 'Payment received.',
    failedTitle: 'Your payment did not go through',
    failedBody: 'No money has been taken. Your order is saved for 15 minutes so you can try again.',
    retry: 'Try Payment Again',
    cancelOrder: 'Cancel This Order',
    /** Money left the account but the webhook has not confirmed yet. */
    pendingTitle: 'We are still confirming your payment',
    pendingBody:
      'This usually takes less than a minute. We will send you an SMS as soon as it is confirmed. You do not need to pay again.',
  },

  refund: {
    initiated: 'Refund started.',
    initiatedBody: (amount: string) =>
      `We are returning ${amount} to the account you paid from. It usually takes 5 to 7 working days.`,
    completed: 'Refund completed.',
    /** Refunds after dispatch need a human decision, so we say so plainly. */
    manualReview:
      'This order has already been dispatched, so our team needs to check it before refunding. We will contact you within one working day.',
  },

  /** Marketplace settlement — MediBridge holds the token, pays distributors weekly. */
  settlement: {
    page: {
      title: 'My Earnings',
      subtitle: 'Token payments we have collected for you, and when they reach your bank.',
    } satisfies PageMeta,
    labels: {
      pending: 'Waiting to be Settled',
      settled: 'Paid to Your Bank',
      nextSettlement: 'Next Payout',
      cashCollected: 'Cash You Collected',
      platformFee: 'Platform Fee',
      netPayable: 'Amount You Will Receive',
    },
    schedule: 'We pay out every Monday for the previous week.',
    nextPayoutOn: (date: string) => `Your next payout is on ${date}.`,
    empty: {
      title: 'No earnings yet',
      body: 'Once retailers start ordering from you, the 20% token payments we collect will show up here.',
      action: { label: 'Check My Inventory', href: '/inventory' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'This shows the token payments MediBridge has collected from retailers on your behalf, and when that money reaches your bank account.',
      topics: [
        {
          question: 'Why does MediBridge collect the 20%?',
          answer:
            'Retailers pay the token to us when they place the order, which confirms it immediately. We then pass it on to you in your weekly payout.',
        },
        {
          question: 'When do I get paid?',
          answer:
            'Every Monday, for all orders delivered in the previous week. The money reaches your bank account within 2 working days of the payout.',
        },
        {
          question: 'What about the 80% balance?',
          answer:
            'You collect that in cash directly from the retailer when you deliver. It never passes through MediBridge, so it is not shown in your payout.',
        },
      ],
    } satisfies PageHelp,
  },
} as const
