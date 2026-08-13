import type { EmptyState, FieldHelp, PageHelp, PageMeta } from '../types.js'

/**
 * Retailer-facing search, cart and checkout.
 *
 * Checkout is where the two rules that define this product get explained:
 * the 20% token payment, and Same-Day vs Next-Day by distance. Both have to
 * be obvious the very first time someone sees them.
 */

export const catalog = {
  search: {
    page: {
      title: 'Search Medicines',
      subtitle: 'Find what you need from distributors near your shop.',
    } satisfies PageMeta,
    fields: {
      query: {
        label: 'Search',
        helperText: 'Type a medicine name, brand or salt to find what you need.',
        placeholder: 'e.g. Paracetamol 500mg',
        tooltip:
          'You can search by brand name (Crocin), by salt (Paracetamol), or by what it treats. We show every distributor near you who has it.',
      } satisfies FieldHelp,
    },
    filters: {
      heading: 'Narrow your results',
      deliveryMode: {
        label: 'Delivery Speed',
        helperText: 'Show only medicines that can reach you within your chosen time.',
      } satisfies FieldHelp,
      sameDayOnly: 'Same-Day Delivery only',
      inStockOnly: 'In stock only',
      form: {
        label: 'Type',
        helperText: 'Filter by tablet, syrup, injection and so on.',
      } satisfies FieldHelp,
      priceRange: {
        label: 'Price',
        helperText: 'Show only medicines within this price range.',
      } satisfies FieldHelp,
      sortBy: {
        label: 'Sort by',
        helperText: 'Choose how you want the results ordered.',
      } satisfies FieldHelp,
      sortOptions: {
        relevance: 'Best match',
        priceLow: 'Price: low to high',
        priceHigh: 'Price: high to low',
        fastest: 'Fastest delivery',
        expiryLongest: 'Longest expiry first',
      },
    },
    resultCount: (count: number) => (count === 1 ? '1 medicine found' : `${count} medicines found`),
    soldBy: (name: string) => `Sold by ${name}`,
    distanceAway: (km: number) => `${km} km from your shop`,
    expiresOn: (date: string) => `Expires ${date}`,
    minOrderNote: (qty: number, unit: string) => `Minimum order: ${qty} ${unit}`,
    savingsNote: (percent: number) => `${percent}% below MRP`,
    addToCart: 'Add to Cart',
    inCart: 'In Your Cart',
    outOfStock: 'Out of Stock',
    notifyMe: 'Tell Me When Available',
    compareDistributors: (count: number) => `Compare ${count} distributors`,
    /** The whole point of the screen, said plainly. */
    bestPrice: 'Best price',
    sellersNearYou: (count: number) =>
      count === 0
        ? 'No distributors deliver to your shop yet'
        : count === 1
          ? '1 distributor delivers to your shop'
          : `${count} distributors deliver to your shop`,
    sameDayTag: 'Same-Day',
    nextDayTag: 'Next-Day',
    offersHeading: (count: number) =>
      count === 1 ? 'Available from 1 distributor' : `Available from ${count} distributors`,
    showOffers: 'Compare prices',
    hideOffers: 'Hide prices',
    availableUnits: (count: number) => `${count.toLocaleString('en-IN')} available`,
    /** Buying arrives in the next phase; say so rather than showing a dead button. */
    cartComingSoon:
      'Ordering opens soon. For now you can compare what every distributor near you charges.',
    empty: {
      title: 'Start by searching for a medicine',
      body: 'Type a name, brand or salt in the search box above. We will show you every distributor near your shop who has it in stock.',
    } satisfies EmptyState,
    noResults: {
      title: 'No medicines found',
      body: 'We could not find anything matching your search. Check the spelling, or try searching by the salt name instead of the brand.',
      action: { label: 'Clear Filters' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'Search here for the medicines you need. We only show you distributors who can actually deliver to your shop, with their live prices and stock.',
      topics: [
        {
          question: 'Why do I see the same medicine several times?',
          answer:
            'Different distributors stock the same medicine at different prices. Each row is one distributor, so you can pick the best price or the fastest delivery.',
        },
        {
          question: 'What does the green "Same-Day" tag mean?',
          answer:
            'That distributor is close enough to your shop to deliver today, as long as you order before the cut-off time shown.',
        },
        {
          question: 'I cannot find a medicine I need.',
          answer:
            'Try searching by the salt name — for example "Paracetamol" instead of "Crocin". If it still does not appear, no distributor near you has it in stock right now.',
        },
        {
          question: 'Why can I not add anything to my cart?',
          answer:
            'Your account is still being approved. You can search and compare now, and place orders as soon as our team approves your drug license.',
        },
      ],
    } satisfies PageHelp,
  },

  cart: {
    page: {
      title: 'Your Cart',
      subtitle: 'Check your items, then pay 20% to confirm your order.',
    } satisfies PageMeta,
    /** Explains the automatic multi-distributor split before it surprises anyone. */
    splitNotice: (count: number) =>
      `Your items come from ${count} different distributors, so we have split them into ${count} orders. You pay once, and each order is delivered separately.`,
    fromDistributor: (name: string) => `From ${name}`,
    labels: {
      quantity: 'Quantity',
      pricePerUnit: 'Price per unit',
      itemTotal: 'Item total',
      subtotal: 'Subtotal',
      gst: 'GST',
      deliveryCharge: 'Delivery',
      deliveryFree: 'Free',
      total: 'Total',
      tokenNow: 'Pay Now (20%)',
      balanceLater: 'Pay on Delivery (80%)',
    },
    remove: 'Remove',
    removeConfirm: {
      title: 'Remove this from your cart?',
      body: 'You can always add it back later.',
    },
    checkoutCta: 'Proceed to Checkout',
    keepShopping: 'Keep Shopping',
    /** Server re-checks prices at checkout; this is shown when one has moved. */
    priceChanged: {
      title: 'Some prices have changed',
      body: 'Distributor prices moved while these items were in your cart. Please check the new prices before you continue.',
      accept: 'Accept New Prices',
    },
    stockChanged: (medicine: string, available: number) =>
      `Only ${available} units of ${medicine} are left. We have reduced your quantity to match.`,
    empty: {
      title: 'Your cart is empty',
      body: 'Search for the medicines you need and add them here. We will show you distributors near your shop with the best prices.',
      action: { label: 'Search Medicines', href: '/search' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'This is everything you are about to buy. Check the quantities and prices here before you pay.',
      topics: [
        {
          question: 'Why is my cart split into separate orders?',
          answer:
            'Because your items come from more than one distributor. Each one packs and delivers its own order. You still make a single payment.',
        },
        {
          question: 'How much do I pay right now?',
          answer:
            'Just 20% of the total, to confirm your order. You pay the other 80% in cash when your medicines are delivered.',
        },
        {
          question: 'A price changed after I added the item. Why?',
          answer:
            'Distributors can update their prices at any time. We always re-check prices before you pay so you are never charged more than you agreed to.',
        },
      ],
    } satisfies PageHelp,
  },

  checkout: {
    page: {
      title: 'Checkout',
      subtitle: 'Confirm your delivery details and pay 20% to place your order.',
    } satisfies PageMeta,
    sections: {
      address: 'Where should we deliver?',
      delivery: 'How fast do you need it?',
      payment: 'Payment',
      review: 'Check your order',
    },
    fields: {
      address: {
        label: 'Delivery Address',
        helperText: 'We will deliver to this address. Tap to change it.',
      } satisfies FieldHelp,
      deliveryMode: {
        label: 'Delivery Speed',
        helperText: 'Orders within this distributor’s delivery area can arrive the same day.',
      } satisfies FieldHelp,
      notes: {
        label: 'Note for the Distributor',
        helperText: 'Optional. Add anything the distributor should know about this order.',
        placeholder: 'e.g. Please deliver before 6 pm',
      } satisfies FieldHelp,
    },
    sameDayAvailable: (cutoff: string) =>
      `Same-Day Delivery is available. Order before ${cutoff} to get it today.`,
    sameDayMissedCutoff: (cutoff: string) =>
      `Today’s ${cutoff} cut-off has passed, so this order will arrive tomorrow.`,
    nextDayOnly: (km: number, radius: number) =>
      `This distributor is ${km} km away, which is outside their ${radius} km Same-Day area. Your order will arrive tomorrow.`,
    /** The single most important explanation in the product. */
    paymentExplainer: {
      title: 'How payment works',
      body: 'You pay 20% now to confirm your order. You pay the remaining 80% in cash to the delivery person when your medicines arrive.',
    },
    payNowCta: (amount: string) => `Pay ${amount} and Place Order`,
    placingOrder: 'Placing your order…',
    /** Shown while the payment gateway is open — prevents double submission. */
    doNotClose: 'Please do not close this page while we confirm your payment.',
    help: {
      whatIsThis:
        'This is the last step. Check where your order is going and how fast it will arrive, then pay the 20% token amount to confirm it.',
      topics: [
        {
          question: 'Why do I only pay 20% now?',
          answer:
            'The 20% confirms your order so the distributor can start packing straight away. You pay the remaining 80% in cash when your medicines arrive, so you only pay in full once you have them.',
        },
        {
          question: 'Why can I not choose Same-Day Delivery?',
          answer:
            'Either the distributor is too far from your shop, or today’s cut-off time has already passed. The exact reason is shown next to the delivery option.',
        },
        {
          question: 'Is my payment safe?',
          answer:
            'Yes. Payments are handled by Razorpay, and we never see or store your card or UPI details.',
        },
        {
          question: 'What if my payment fails?',
          answer:
            'Your order is kept for 15 minutes so you can try again. If money left your account but the order did not confirm, it is returned automatically within 5 to 7 working days.',
        },
      ],
    } satisfies PageHelp,
  },

  orderPlaced: {
    page: {
      title: 'Order Placed',
      subtitle: 'Thank you. Your order is confirmed.',
    } satisfies PageMeta,
    success: 'Order placed successfully.',
    orderNumber: (orderNumber: string) => `Your order number is ${orderNumber}.`,
    splitNote: (count: number) =>
      `We created ${count} orders because your items come from ${count} distributors. You can track each one separately.`,
    balanceReminder: (amount: string) =>
      `Please keep ${amount} ready in cash for the delivery person.`,
    whatNext: 'What happens next?',
    whatNextSteps: [
      'The distributor accepts your order and packs it.',
      'We send you an SMS when your order is on the way.',
      'You pay the balance in cash and collect your medicines.',
    ],
    trackCta: 'Track My Order',
    keepShoppingCta: 'Keep Shopping',
  },
} as const
