import type { EmptyState, OnboardingTour, PageHelp, PageMeta } from '../types.js'

/**
 * Role-specific home screens — the first thing anyone sees after signing in.
 *
 * Each one answers "what needs my attention right now?" before anything else.
 */

export const dashboard = {
  retailer: {
    page: {
      title: 'Home',
      subtitle: 'Your recent orders and what needs your attention.',
    } satisfies PageMeta,
    greeting: (name: string) => `Welcome back, ${name}`,
    cards: {
      activeOrders: 'Orders in Progress',
      arrivingToday: 'Arriving Today',
      balanceDue: 'Cash to Keep Ready',
      spentThisMonth: 'Spent This Month',
    },
    quickActions: 'What would you like to do?',
    actions: {
      search: 'Search Medicines',
      reorder: 'Order Again',
      viewCart: 'Go to Cart',
      viewOrders: 'My Orders',
    },
    recentOrders: 'Your Recent Orders',
    frequentlyOrdered: 'You Order These Often',
    reorderCta: 'Order Again',
    empty: {
      title: 'Welcome to MediBridge',
      body: 'You have not placed any orders yet. Search for the medicines you need and we will show you distributors near your shop.',
      action: { label: 'Search Medicines', href: '/search' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'Your home screen. It shows orders that are still on their way, cash you need to keep ready, and quick links to the things you do most.',
      topics: [
        {
          question: 'What does "Cash to Keep Ready" mean?',
          answer:
            'It is the total balance for all orders arriving soon. Since you pay 80% in cash on delivery, this is what you should have on hand.',
        },
        {
          question: 'How do I reorder something I bought before?',
          answer:
            'Look under "You Order These Often" and tap "Order Again", or open any past order and tap "Order These Again". Everything goes straight into your cart.',
        },
      ],
    } satisfies PageHelp,
  },

  distributor: {
    page: {
      title: 'Home',
      subtitle: 'New orders, stock warnings and your earnings.',
    } satisfies PageMeta,
    greeting: (name: string) => `Welcome back, ${name}`,
    cards: {
      newOrders: 'New Orders to Accept',
      toDispatch: 'Ready to Dispatch',
      lowStock: 'Running Low',
      expiringSoon: 'Expiring Soon',
      earningsThisMonth: 'Earned This Month',
      pendingSettlement: 'Waiting to be Settled',
    },
    /** The one thing a distributor must not miss. */
    urgentBanner: (count: number, hours: number) =>
      count === 1
        ? `1 order is waiting for you to accept. Please respond within ${hours} hours.`
        : `${count} orders are waiting for you to accept. Please respond within ${hours} hours.`,
    quickActions: 'What would you like to do?',
    actions: {
      viewOrders: 'View Orders',
      addStock: 'Add Medicine',
      bulkUpload: 'Upload Spreadsheet',
      viewEarnings: 'My Earnings',
    },
    empty: {
      title: 'Welcome to MediBridge',
      body: 'Add your stock so retailers near you can find and order from you. You can add medicines one at a time, or upload your whole list as a spreadsheet.',
      action: { label: 'Add Your First Medicine', href: '/inventory/new' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'Your home screen. Anything needing action — orders to accept, stock running low, batches expiring — appears here first.',
      topics: [
        {
          question: 'Why is an order marked urgent?',
          answer:
            'Retailers are waiting on your answer. Same-Day orders must be accepted within 2 hours, or they are cancelled automatically and the retailer is refunded.',
        },
        {
          question: 'What does "Waiting to be Settled" mean?',
          answer:
            'The 20% token payments MediBridge has collected from retailers for you. We transfer these to your bank every Monday.',
        },
      ],
    } satisfies PageHelp,
  },

  admin: {
    page: {
      title: 'Home',
      subtitle: 'How the platform is doing today.',
    } satisfies PageMeta,
    cards: {
      pendingApprovals: 'Accounts Waiting for Approval',
      ordersToday: 'Orders Today',
      salesToday: 'Sales Today',
      failedPayments: 'Failed Payments',
      lateOrders: 'Orders Running Late',
      openIssues: 'Problems Reported',
    },
    quickActions: 'What would you like to do?',
    actions: {
      reviewApprovals: 'Approve Accounts',
      viewOrders: 'View All Orders',
      viewReports: 'View Reports',
      manageMedicines: 'Medicine List',
    },
    help: {
      whatIsThis:
        'A live view of the platform. Anything that needs a person to step in — approvals, failed payments, late orders — is shown here first.',
      topics: [
        {
          question: 'What counts as a late order?',
          answer:
            'A Same-Day order not dispatched by the cut-off time, or a Next-Day order not delivered by the end of the next day.',
        },
      ],
    } satisfies PageHelp,
  },

  /** Shown once, on a brand-new distributor's first visit. */
  distributorSetupTour: {
    id: 'distributor-dashboard-first-run',
    intro: {
      title: 'Three steps to your first order',
      body: 'Let us get you set up so retailers can start buying from you.',
      startLabel: 'Show Me How',
      skipLabel: 'I will do it myself',
    },
    steps: [
      {
        target: 'add-stock',
        title: 'Step 1 — Add your stock',
        body: 'List the medicines you have, batch by batch. Retailers can only order what you have listed here.',
      },
      {
        target: 'delivery-radius',
        title: 'Step 2 — Set your delivery area',
        body: 'Tell us how far you can deliver on the same day. Retailers inside that area get Same-Day Delivery.',
      },
      {
        target: 'bank-details',
        title: 'Step 3 — Add your bank details',
        body: 'This is where we send your weekly payout of the token payments we collect for you.',
      },
    ],
    outro: {
      title: 'You are ready',
      body: 'Once your stock is listed, retailers near you will start seeing it straight away.',
      doneLabel: 'Add My Stock',
    },
  } satisfies OnboardingTour,
} as const
