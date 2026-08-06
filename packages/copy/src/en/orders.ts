import type { EmptyState, FieldHelp, PageHelp, PageMeta } from '../types.js'

/**
 * The order lifecycle, shared by all three roles.
 *
 * Status words are written from the RETAILER's point of view — they are the
 * ones checking most often — with distributor-facing variants where the same
 * state means something different to the person packing the box.
 */

export const orders = {
  /** One label per OrderStatus enum value. Paired with an icon, never colour alone. */
  status: {
    PENDING_PAYMENT: 'Waiting for Payment',
    CONFIRMED: 'Order Confirmed',
    ACCEPTED: 'Accepted by Distributor',
    PACKED: 'Packed',
    DISPATCHED: 'On the Way',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    REJECTED: 'Could Not Be Accepted',
    RETURNED: 'Returned',
  },

  /** Plain-English explanation of each status, shown under the badge. */
  statusExplained: {
    PENDING_PAYMENT: 'Pay the 20% token amount to confirm this order.',
    CONFIRMED: 'We have your token payment. The distributor will accept it shortly.',
    ACCEPTED: 'The distributor has accepted your order and is getting it ready.',
    PACKED: 'Your order is packed and waiting to be picked up.',
    DISPATCHED: 'Your order is on its way. Keep the balance amount ready in cash.',
    DELIVERED: 'This order was delivered and fully paid.',
    CANCELLED: 'This order was cancelled. Any token payment has been refunded.',
    REJECTED: 'The distributor could not accept this order. Your token payment was refunded.',
    RETURNED: 'This order was returned. Our team will contact you about the refund.',
  },

  deliveryMode: {
    SAME_DAY: 'Same-Day Delivery',
    NEXT_DAY: 'Next-Day Delivery',
  },
  deliveryModeExplained: {
    SAME_DAY: 'Arrives today if you order before the cut-off time.',
    NEXT_DAY: 'Arrives tomorrow.',
  },

  list: {
    retailerPage: {
      title: 'My Orders',
      subtitle: 'Track your orders and see everything you have bought before.',
    } satisfies PageMeta,
    distributorPage: {
      title: 'Orders',
      subtitle: 'Accept new orders, pack them, and mark them dispatched.',
    } satisfies PageMeta,
    columns: {
      orderNumber: 'Order',
      date: 'Placed On',
      retailer: 'Retailer',
      distributor: 'Distributor',
      items: 'Items',
      total: 'Total',
      paid: 'Paid',
      balance: 'Balance Due',
      status: 'Status',
      delivery: 'Delivery',
    },
    tabs: {
      all: 'All',
      needsAction: 'Needs Your Action',
      active: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },
    itemCount: (count: number) => (count === 1 ? '1 item' : `${count} items`),
    retailerEmpty: {
      title: 'You have not placed any orders yet',
      body: 'Search for the medicines you need and place your first order. It takes just a few minutes.',
      action: { label: 'Search Medicines', href: '/search' },
      filteredTitle: 'No orders match your filters',
      filteredBody: 'Try choosing a different date range or status.',
    } satisfies EmptyState,
    distributorEmpty: {
      title: 'No orders yet',
      body: 'Orders from retailers near you will appear here. Make sure your stock list is up to date so retailers can find you.',
      action: { label: 'Check My Inventory', href: '/inventory' },
      filteredTitle: 'No orders match your filters',
      filteredBody: 'Try choosing a different date range or status.',
    } satisfies EmptyState,
    retailerHelp: {
      whatIsThis:
        'Every order you have placed is here, newest first. Tap any order to see what is in it and where it has reached.',
      topics: [
        {
          question: 'Why is my order split into two?',
          answer:
            'Your medicines came from two different distributors, so each one packs and delivers its own part. You paid once, and each part is tracked separately.',
        },
        {
          question: 'When do I pay the remaining 80%?',
          answer:
            'In cash, to the delivery person, when your medicines arrive. Have the exact balance amount ready — you can see it on the order.',
        },
        {
          question: 'Can I cancel an order?',
          answer:
            'Yes, any time before the distributor packs it. Your 20% token payment is refunded to the same account within 5 to 7 working days. Once an order is packed it cannot be cancelled.',
        },
        {
          question: 'My order says "On the Way". How long will it take?',
          answer:
            'Same-Day orders arrive by the end of the same day. Next-Day orders arrive by the end of the next day. The delivery person will call you before arriving.',
        },
        {
          question: 'Something is missing from my delivery.',
          answer:
            'Tap the order, then "Report a Problem". Tell us what is missing and our team will sort it out within one working day.',
        },
      ],
    } satisfies PageHelp,
    distributorHelp: {
      whatIsThis:
        'New orders from retailers land here. Accept them, pack them, then mark them dispatched — the retailer is updated automatically at each step.',
      topics: [
        {
          question: 'How long do I have to accept an order?',
          answer:
            'Two hours for Same-Day orders and until the end of the day for Next-Day orders. After that the order is cancelled automatically and the retailer is refunded.',
        },
        {
          question: 'I only have some of the items. What do I do?',
          answer:
            'Choose "Accept Part of This Order" and set the quantity you can actually supply. The retailer is told straight away and only pays for what you send.',
        },
        {
          question: 'Which batch should I pack?',
          answer:
            'We tell you on the packing list, and it is always the batch expiring soonest. That keeps your stock moving and avoids waste.',
        },
        {
          question: 'When do I get paid?',
          answer:
            'You collect the 80% balance in cash on delivery. The 20% token the retailer already paid is settled to your bank account every week.',
        },
      ],
    } satisfies PageHelp,
  },

  detail: {
    page: (orderNumber: string) => ({
      title: `Order ${orderNumber}`,
      subtitle: 'Everything about this order, including what you have paid.',
    }),
    sections: {
      items: 'What you ordered',
      payment: 'Payment',
      delivery: 'Delivery',
      timeline: 'Progress',
      distributor: 'Distributor',
      retailer: 'Retailer',
    },
    labels: {
      orderTotal: 'Order Total',
      tokenPaid: 'Token Paid (20%)',
      balanceDue: 'Balance Due on Delivery',
      balancePaid: 'Balance Paid',
      placedOn: 'Placed On',
      expectedBy: 'Expected By',
      deliveredOn: 'Delivered On',
      deliveryAddress: 'Delivery Address',
      batchNumber: 'Batch',
      expiry: 'Expires',
    },
    payBalanceNote: 'Please keep this amount ready in cash for the delivery person.',
    actions: {
      cancel: 'Cancel This Order',
      reorder: 'Order These Again',
      downloadInvoice: 'Download Invoice',
      reportProblem: 'Report a Problem',
      trackDelivery: 'Track Delivery',
    },
    cancelDialog: {
      title: 'Cancel this order?',
      body: 'Your 20% token payment will be refunded to the account you paid from within 5 to 7 working days.',
      reasonField: {
        label: 'Why are you cancelling?',
        helperText: 'This helps us improve. Your answer is shared with the distributor.',
      } satisfies FieldHelp,
      confirm: 'Yes, Cancel Order',
      keep: 'Keep My Order',
    },
    success: {
      cancelled: 'Your order has been cancelled. We will refund your token payment shortly.',
      problemReported: 'Thank you. Our team will contact you within one working day.',
    },
  },

  /** Distributor-side fulfilment actions. */
  fulfil: {
    accept: 'Accept Order',
    acceptPartial: 'Accept Part of This Order',
    reject: 'Cannot Accept',
    markPacked: 'Mark as Packed',
    markDispatched: 'Mark as Dispatched',
    printPackingList: 'Print Packing List',
    rejectDialog: {
      title: 'Cannot accept this order?',
      body: 'The retailer will be told right away and refunded in full.',
      reasonField: {
        label: 'Why can you not accept it?',
        helperText: 'The retailer will see this, so please be clear.',
      } satisfies FieldHelp,
      confirm: 'Yes, Reject Order',
    },
    partialDialog: {
      title: 'How much can you supply?',
      body: 'Set the quantity you can actually send for each item. Anything you reduce is refunded to the retailer.',
      confirm: 'Confirm Quantities',
    },
    dispatchDialog: {
      title: 'Ready to dispatch?',
      body: 'We will tell the retailer their order is on the way and send them a delivery code.',
      fields: {
        deliveryPerson: {
          label: 'Who is delivering this?',
          helperText: 'Enter the name of the person taking this order out.',
          placeholder: 'Suresh Patil',
        } satisfies FieldHelp,
        deliveryPhone: {
          label: 'Their Mobile Number',
          helperText: 'The retailer may call this number to check where their order is.',
          placeholder: '98765 43210',
        } satisfies FieldHelp,
      },
      confirm: 'Yes, Dispatch',
    },
    success: {
      accepted: 'Order accepted. The retailer has been told.',
      partiallyAccepted: 'Order updated. The retailer has been told what you can supply.',
      rejected: 'Order rejected. The retailer has been refunded.',
      packed: 'Order marked as packed.',
      dispatched: 'Order dispatched. The retailer can now track it.',
    },
  },
} as const
