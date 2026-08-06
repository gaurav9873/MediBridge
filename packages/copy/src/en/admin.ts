import type { EmptyState, FieldHelp, PageHelp, PageMeta } from '../types.js'

/**
 * Admin panel.
 *
 * Written in the same plain English as the rest of the product. Admin users
 * are operations staff, not engineers — "Paused" beats "Deactivated", and
 * nothing here should read like a database table.
 */

export const admin = {
  signIn: {
    page: {
      title: 'Admin Sign In',
      subtitle: 'For MediBridge staff only. Retailers and distributors sign in on the main site.',
    } satisfies PageMeta,
    fields: {
      phone: {
        label: 'Mobile Number',
        helperText: 'Enter the 10-digit mobile number for your admin account.',
        placeholder: '90000 00001',
      } satisfies FieldHelp,
      password: {
        label: 'Password',
        helperText: 'Enter your password.',
      } satisfies FieldHelp,
    },
    submit: 'Sign In',
    signingIn: 'Signing you in…',
    success: 'Signed in successfully.',
    /** Shown when a non-admin tries this page — deliberately non-specific. */
    notAdmin: 'That mobile number or password is not correct. Please try again.',
    retailerHint: 'Are you a retailer or distributor?',
    retailerHintLink: 'Sign in here instead',
    help: {
      whatIsThis:
        'This is the sign-in page for the MediBridge admin panel. Only our own staff can sign in here — retailers and distributors use the main site.',
      topics: [
        {
          question: 'I am a retailer. Why can I not sign in?',
          answer:
            'This page is only for MediBridge staff. Please use the main sign-in page instead — the link is at the bottom of this page.',
        },
        {
          question: 'I forgot my admin password.',
          answer:
            'Admin passwords are reset by another administrator for security. Please ask a colleague with admin access, or call the technical team.',
        },
        {
          question: 'Why does it not say whether my password or my number was wrong?',
          answer:
            'For safety. If we said "that number is not registered", someone could use this page to find out which numbers have admin access.',
        },
      ],
    } satisfies PageHelp,
  },

  dashboard: {
    page: {
      title: 'Admin Home',
      subtitle: 'How the platform is doing, and anything that needs your attention.',
    } satisfies PageMeta,
    greeting: (name: string) => `Welcome back, ${name}`,
    needsAttention: 'Needs your attention',
    platformNumbers: 'Platform numbers',
    cards: {
      pendingApprovals: 'Accounts Waiting for Approval',
      openProblems: 'Problems Reported',
      expiringSoon: 'Batches Expiring Soon',
      ordersToday: 'Orders Today',
      activeRetailers: 'Active Retailers',
      activeDistributors: 'Active Distributors',
      medicines: 'Medicines Listed',
      inventoryBatches: 'Stock Batches',
    },
    hints: {
      pendingApprovals: 'Check their documents so they can start ordering',
      openProblems: 'Retailers waiting on a reply',
      expiringSoon: 'Within the next 90 days',
      ordersToday: 'Placed since midnight',
    },
    allClear: 'Nothing needs your attention right now.',
    allClearBody: 'Every account has been checked and no problems have been reported.',
    signOut: 'Sign Out',
    signedOut: 'You have been signed out.',
    help: {
      whatIsThis:
        'Your home screen as an administrator. Anything that needs a person to step in — new accounts to approve, problems reported by retailers, stock about to expire — is shown at the top.',
      topics: [
        {
          question: 'What should I do first?',
          answer:
            'Start with "Accounts Waiting for Approval". Those businesses cannot place a single order until someone checks their documents, so they are the people waiting on you.',
        },
        {
          question: 'What counts as a problem report?',
          answer:
            'A retailer telling us something went wrong with an order — a missing item, damage, or stock that expires too soon. They expect a reply within one working day.',
        },
        {
          question: 'Where do these numbers come from?',
          answer:
            'They are live counts from the database, refreshed every time you open this page.',
        },
      ],
    } satisfies PageHelp,
  },

  verification: {
    page: {
      title: 'Approve New Accounts',
      subtitle: 'Check each business’s GST certificate and drug license before they can order.',
    } satisfies PageMeta,
    queueCount: (count: number) =>
      count === 1 ? '1 account is waiting' : `${count} accounts are waiting`,
    columns: {
      business: 'Business',
      role: 'Type',
      submitted: 'Submitted',
      documents: 'Documents',
      waitingFor: 'Waiting',
    },
    waitingDays: (days: number) => (days === 1 ? '1 day' : `${days} days`),
    checklistHeading: 'Before you approve, check that',
    checklist: [
      'The drug license is readable and has not expired.',
      'The business name on the license matches the name they entered.',
      'The GST number matches the GST certificate.',
      'The license number has not already been used by another account.',
    ],
    approve: 'Approve Account',
    reject: 'Reject Documents',
    approveDialog: {
      title: 'Approve this account?',
      body: 'They will be able to place orders straight away, and we will send them an SMS and email.',
      confirm: 'Yes, Approve',
    },
    rejectDialog: {
      title: 'Reject these documents?',
      body: 'They will be asked to upload them again. Please explain clearly what was wrong.',
      reasonField: {
        label: 'What was wrong?',
        helperText:
          'The business will see this message, so say exactly what they need to fix. For example: "The expiry date on your drug license is not readable."',
      } satisfies FieldHelp,
      confirm: 'Yes, Reject',
    },
    success: {
      approved: 'Account approved. We have told them by SMS and email.',
      rejected: 'Documents rejected. We have asked them to upload new ones.',
    },
    empty: {
      title: 'Nothing waiting for approval',
      body: 'Every account has been checked. New sign-ups will appear here as soon as they submit their documents.',
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'New retailers and distributors wait here until someone checks their documents. Nobody can place or receive an order until they are approved.',
      topics: [
        {
          question: 'What am I actually checking?',
          answer:
            'That the drug license is genuine, readable, still valid, and belongs to the business that submitted it. The checklist on each account walks you through it.',
        },
        {
          question: 'What if the licence expires next month?',
          answer:
            'Approve it. The system blocks their ordering automatically on the expiry date and asks them to upload a renewed licence.',
        },
        {
          question: 'I rejected someone by mistake.',
          answer:
            'Open their account and tap "Approve Account". They can be approved at any time, even after a rejection.',
        },
      ],
    } satisfies PageHelp,
  },

  users: {
    page: {
      title: 'Users',
      subtitle: 'Every retailer, distributor and admin on the platform.',
    } satisfies PageMeta,
    columns: {
      name: 'Name',
      business: 'Business',
      role: 'Type',
      phone: 'Mobile',
      city: 'City',
      status: 'Status',
      joined: 'Joined',
    },
    role: {
      RETAILER: 'Retailer',
      DISTRIBUTOR: 'Distributor',
      ADMIN: 'Admin',
      DELIVERY: 'Delivery Person',
    },
    accountStatus: {
      PENDING_VERIFICATION: 'Waiting for Approval',
      ACTIVE: 'Active',
      SUSPENDED: 'Paused',
      REJECTED: 'Rejected',
    },
    suspend: 'Pause Account',
    reactivate: 'Reactivate Account',
    suspendDialog: {
      title: 'Pause this account?',
      body: 'They will not be able to sign in or place orders. Orders already in progress carry on as normal.',
      reasonField: {
        label: 'Why are you pausing this account?',
        helperText: 'Kept for our records. The user will see a short version of this.',
      } satisfies FieldHelp,
      confirm: 'Yes, Pause Account',
    },
    success: {
      suspended: 'Account paused.',
      reactivated: 'Account reactivated.',
    },
    empty: {
      title: 'No users found',
      body: 'Nobody matches your filters. Try a different search or clear your filters.',
    } satisfies EmptyState,
  },

  medicines: {
    page: {
      title: 'Medicine List',
      subtitle: 'The shared list of medicines that distributors add their stock against.',
    } satisfies PageMeta,
    addCta: 'Add Medicine',
    columns: {
      name: 'Name',
      brand: 'Brand',
      composition: 'Salt',
      form: 'Type',
      strength: 'Strength',
      schedule: 'Schedule',
      distributors: 'Distributors',
    },
    fields: {
      name: {
        label: 'Medicine Name',
        helperText: 'Enter the full name as printed on the pack.',
        placeholder: 'Crocin Advance 500mg',
      } satisfies FieldHelp,
      brand: {
        label: 'Brand',
        helperText: 'The company that makes this medicine.',
        placeholder: 'GSK',
      } satisfies FieldHelp,
      composition: {
        label: 'Salt or Composition',
        helperText: 'The active ingredient. Retailers often search using this.',
        placeholder: 'Paracetamol 500mg',
      } satisfies FieldHelp,
      form: {
        label: 'Type',
        helperText: 'Choose whether this is a tablet, syrup, injection and so on.',
      } satisfies FieldHelp,
      strength: {
        label: 'Strength',
        helperText: 'How much active ingredient is in each unit.',
        placeholder: '500mg',
      } satisfies FieldHelp,
      packSize: {
        label: 'Pack Size',
        helperText: 'How many units are in one pack.',
        placeholder: '15 tablets',
      } satisfies FieldHelp,
      hsnCode: {
        label: 'HSN Code',
        helperText: 'The tax code for this medicine. Used on invoices.',
        placeholder: '30049099',
      } satisfies FieldHelp,
      gstRate: {
        label: 'GST Rate',
        helperText: 'The GST percentage charged on this medicine.',
      } satisfies FieldHelp,
      schedule: {
        label: 'Drug Schedule',
        helperText: 'Choose the schedule printed on the pack. This controls who may buy it.',
        tooltip:
          'Schedule H and H1 medicines need a valid drug license, which we already check. Schedule X medicines cannot be sold on MediBridge at all.',
      } satisfies FieldHelp,
      isPrescriptionRequired: {
        label: 'Needs a Prescription',
        helperText: 'Switch on if this medicine can only be sold against a prescription.',
      } satisfies FieldHelp,
    },
    scheduleLabels: {
      NONE: 'Over the counter',
      H: 'Schedule H',
      H1: 'Schedule H1',
      X: 'Schedule X — not sold here',
    },
    /** Schedule X is blocked platform-wide in the MVP. */
    scheduleXBlocked:
      'Schedule X medicines cannot be sold on MediBridge. This medicine will be hidden from all distributors and retailers.',
    requestQueue: {
      title: 'Requested Medicines',
      subtitle: 'Medicines distributors asked us to add to the shared list.',
      approve: 'Add to List',
      reject: 'Reject Request',
      empty: {
        title: 'No requests waiting',
        body: 'When a distributor cannot find a medicine, their request will appear here.',
      } satisfies EmptyState,
    },
    success: {
      created: 'Medicine added to the list.',
      updated: 'Medicine updated.',
    },
    empty: {
      title: 'No medicines in the list yet',
      body: 'Add medicines here so distributors can list their stock against them.',
      action: { label: 'Add First Medicine', href: '/admin/medicines/new' },
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'This is the single shared list of medicines. Distributors pick from it when adding stock, which is what lets retailers compare prices for the same medicine across distributors.',
      topics: [
        {
          question: 'Why not let distributors type their own medicine names?',
          answer:
            'Because "Crocin 500", "crocin 500mg" and "CROCIN-500" would all become separate products, and retailers could not compare prices. One shared list keeps everything tidy.',
        },
        {
          question: 'A distributor requested a medicine that already exists.',
          answer:
            'Reject the request and tell them the name it is listed under. They can then find it in search.',
        },
        {
          question: 'What happens if I mark something Schedule X?',
          answer:
            'It is hidden everywhere immediately. MediBridge does not sell Schedule X medicines, and any existing stock of it is delisted.',
        },
      ],
    } satisfies PageHelp,
  },

  reports: {
    page: {
      title: 'Reports',
      subtitle: 'How the platform is doing — sales, distributors and stock.',
    } satisfies PageMeta,
    metrics: {
      totalSales: 'Total Sales',
      orderCount: 'Orders',
      averageOrder: 'Average Order Value',
      activeRetailers: 'Active Retailers',
      activeDistributors: 'Active Distributors',
      pendingApprovals: 'Waiting for Approval',
      sameDayShare: 'Same-Day Deliveries',
      cancellationRate: 'Cancelled Orders',
      settlementDue: 'Owed to Distributors',
    },
    ranges: {
      today: 'Today',
      last7: 'Last 7 days',
      last30: 'Last 30 days',
      thisMonth: 'This month',
      custom: 'Choose dates',
    },
    topMedicines: 'Most Ordered Medicines',
    topDistributors: 'Best Performing Distributors',
    exportCta: 'Download as Spreadsheet',
    comparedToPrevious: (percent: number) =>
      percent >= 0
        ? `Up ${percent}% on the previous period`
        : `Down ${Math.abs(percent)}% on the previous period`,
    empty: {
      title: 'Not enough data yet',
      body: 'Once orders start coming in, your sales figures and trends will appear here.',
    } satisfies EmptyState,
  },

  settings: {
    page: {
      title: 'Settings',
      subtitle: 'Platform-wide rules. Changes apply to every new order.',
    } satisfies PageMeta,
    sections: {
      delivery: 'Delivery',
      payment: 'Payment',
      compliance: 'Compliance',
      notifications: 'Messages',
    },
    fields: {
      defaultRadiusKm: {
        label: 'Default Same-Day Radius',
        helperText: 'Orders within this distance are eligible for Same-Day Delivery.',
        placeholder: '25',
        tooltip:
          'This is the starting value for new distributors. Each distributor can set their own radius afterwards.',
      } satisfies FieldHelp,
      sameDayCutoff: {
        label: 'Default Same-Day Cut-Off Time',
        helperText: 'Orders placed after this time will be delivered the next day.',
        placeholder: '14:00',
      } satisfies FieldHelp,
      tokenPercent: {
        label: 'Token Payment Percentage',
        helperText: 'How much of the order total a retailer pays online to confirm it.',
        placeholder: '20',
        tooltip:
          'Changing this only affects new orders. Orders already placed keep the percentage that applied when they were created.',
      } satisfies FieldHelp,
      platformFeePercent: {
        label: 'Platform Fee',
        helperText: 'What MediBridge keeps from each order, as a percentage.',
        placeholder: '2',
      } satisfies FieldHelp,
      orderAcceptWindowHours: {
        label: 'Time to Accept an Order',
        helperText: 'How long a distributor has to accept before the order is cancelled.',
        placeholder: '2',
      } satisfies FieldHelp,
      stockHoldMinutes: {
        label: 'How Long to Hold Stock',
        helperText: 'How long we reserve stock while a retailer completes their payment.',
        placeholder: '15',
      } satisfies FieldHelp,
      expiryWarningDays: {
        label: 'Warn About Expiry',
        helperText: 'How many days before expiry we warn distributors about a batch.',
        placeholder: '90',
      } satisfies FieldHelp,
      blockScheduleX: {
        label: 'Block Schedule X Medicines',
        helperText: 'Keep this switched on. Schedule X medicines are not sold on MediBridge.',
      } satisfies FieldHelp,
    },
    success: 'Settings saved. These apply to all new orders.',
    help: {
      whatIsThis:
        'The rules that govern how the whole platform behaves — how far Same-Day delivery reaches, how much of an order is paid up front, and how long distributors have to accept.',
      topics: [
        {
          question: 'Will changing the token percentage affect existing orders?',
          answer:
            'No. Every order stores the percentage that applied when it was placed, so orders already in progress are never changed.',
        },
        {
          question: 'What does the default radius do?',
          answer:
            'It is the starting Same-Day area for any distributor who has not set their own. Distributors who set their own radius are not affected.',
        },
      ],
    } satisfies PageHelp,
  },
} as const
