import type { EmptyState, FieldHelp, PageHelp, PageMeta } from '../types.js'

/**
 * Profile, addresses, bank details, license renewal and notifications.
 */

export const account = {
  page: {
    title: 'My Account',
    subtitle: 'Your business details, addresses and settings.',
  } satisfies PageMeta,

  tabs: {
    profile: 'My Details',
    business: 'Business',
    license: 'Drug License',
    addresses: 'Addresses',
    bank: 'Bank Details',
    notifications: 'Messages',
    security: 'Password',
  },

  profile: {
    fields: {
      fullName: {
        label: 'Your Full Name',
        helperText: 'Enter your name as it appears on your official documents.',
      } satisfies FieldHelp,
      phone: {
        label: 'Mobile Number',
        helperText: 'We use this to sign you in and to send order updates.',
        tooltip: 'To change your mobile number, please call us on 1800-000-0000.',
      } satisfies FieldHelp,
      email: {
        label: 'Email Address',
        helperText: 'We send your invoices and receipts here.',
      } satisfies FieldHelp,
    },
    success: 'Your details have been saved.',
  },

  license: {
    page: {
      title: 'Drug License',
      subtitle: 'Keep this up to date. You cannot order once it expires.',
    } satisfies PageMeta,
    currentHeading: 'Your current license',
    validUntil: (date: string) => `Valid until ${date}`,
    expiresInDays: (days: number) =>
      days === 1
        ? 'Your license expires tomorrow. Please upload a renewed one now.'
        : `Your license expires in ${days} days. Please upload a renewed one soon.`,
    expired: 'Your license has expired. You cannot place orders until you upload a renewed one.',
    fields: {
      licenseNumber: {
        label: 'Drug License Number',
        helperText: 'Enter the license number exactly as printed on your license.',
      } satisfies FieldHelp,
      expiryDate: {
        label: 'License Valid Until',
        helperText: 'Enter the expiry date printed on your renewed license.',
      } satisfies FieldHelp,
      file: {
        label: 'Upload Drug License',
        helperText: 'Upload a clear image or PDF of your valid drug license. Maximum size 5 MB.',
      } satisfies FieldHelp,
    },
    submit: 'Submit for Verification',
    success: 'License submitted for verification.',
    pendingNote:
      'Our team is checking your renewed license. You can keep ordering with your current one until then.',
    help: {
      whatIsThis:
        'Your drug license lets you buy medicines legally. We check the expiry date before every order, so this needs to stay current.',
      topics: [
        {
          question: 'What happens when my license expires?',
          answer:
            'You can still sign in and search, but you cannot place new orders until you upload a renewed license. Orders already placed are not affected.',
        },
        {
          question: 'How early should I upload my renewal?',
          answer:
            'As soon as you have it. We start reminding you 30 days before expiry. Uploading early means no gap in your ordering.',
        },
      ],
    } satisfies PageHelp,
  },

  addresses: {
    page: {
      title: 'My Addresses',
      subtitle: 'Where we deliver your medicines.',
    } satisfies PageMeta,
    addCta: 'Add New Address',
    setDefault: 'Use as Default',
    defaultBadge: 'Default',
    fields: {
      label: {
        label: 'Name This Address',
        helperText: 'Give it a short name so you can spot it quickly.',
        placeholder: 'e.g. Main Shop, Warehouse',
      } satisfies FieldHelp,
      line1: {
        label: 'Address',
        helperText: 'Enter the shop number, building and street.',
        placeholder: 'Shop 12, Sai Complex, MG Road',
      } satisfies FieldHelp,
      city: {
        label: 'City',
        helperText: 'Enter your city or town.',
      } satisfies FieldHelp,
      state: {
        label: 'State',
        helperText: 'Choose your state.',
      } satisfies FieldHelp,
      pincode: {
        label: 'PIN Code',
        helperText: 'Enter the 6-digit PIN code of this address.',
      } satisfies FieldHelp,
      location: {
        label: 'Exact Location',
        helperText: 'Drag the pin to your exact shop location. This decides your delivery options.',
        tooltip:
          'The closer this pin is to your real shop, the more accurate your Same-Day Delivery options will be.',
      } satisfies FieldHelp,
      contactPhone: {
        label: 'Contact Number for This Address',
        helperText: 'The delivery person will call this number.',
      } satisfies FieldHelp,
    },
    success: {
      created: 'Address added.',
      updated: 'Address updated.',
      deleted: 'Address removed.',
      defaultSet: 'Default address updated.',
    },
    empty: {
      title: 'No addresses saved yet',
      body: 'Add the address where you want your medicines delivered. You can save more than one.',
      action: { label: 'Add Your First Address' },
    } satisfies EmptyState,
  },

  bank: {
    page: {
      title: 'Bank Details',
      subtitle: 'Where we send your weekly payout.',
    } satisfies PageMeta,
    fields: {
      accountHolder: {
        label: 'Account Holder Name',
        helperText: 'Enter the name exactly as it appears on your bank account.',
      } satisfies FieldHelp,
      accountNumber: {
        label: 'Account Number',
        helperText: 'Enter your bank account number.',
      } satisfies FieldHelp,
      confirmAccountNumber: {
        label: 'Confirm Account Number',
        helperText: 'Type your account number again so we know it is correct.',
      } satisfies FieldHelp,
      ifsc: {
        label: 'IFSC Code',
        helperText: 'The 11-character code of your bank branch. It is on your cheque book.',
        placeholder: 'HDFC0001234',
      } satisfies FieldHelp,
    },
    success: 'Bank details saved. Your next payout will go to this account.',
    warning:
      'Please check these details carefully. Money sent to a wrong account cannot always be recovered.',
    empty: {
      title: 'No bank details added',
      body: 'Add your bank account so we can send you the token payments we collect from retailers.',
      action: { label: 'Add Bank Details' },
    } satisfies EmptyState,
  },

  /** Staff who work for this business, each with their own sign-in. */
  team: {
    page: {
      title: 'Your Team',
      subtitle: 'Give each person their own sign-in, so you can see who did what.',
    } satisfies PageMeta,
    help: {
      whatIsThis:
        'Add the people who work with you. Each one signs in with their own mobile number, so every order and every stock change is recorded against the person who made it.',
      topics: [
        {
          question: 'Why not just share one password?',
          answer:
            'If everyone uses one login, the records only ever show your name. When a customer asks who packed an order, or a batch goes missing, there is no way to find out.',
        },
        {
          question: 'What password does my colleague use?',
          answer:
            'We create a temporary one and show it to you once. Write it down and give it to them. Ask them to change it from their own account page after they sign in.',
        },
        {
          question: 'What happens when someone leaves?',
          answer:
            'Remove them here. They are signed out immediately and cannot sign in again. Their name stays on the orders they handled, which is what the records are for.',
        },
        {
          question: 'Which role should I choose?',
          answer:
            'Pick the one closest to what they actually do. Company Admin can do everything, including adding more people — give it out sparingly.',
        },
      ],
    } satisfies PageHelp,
  },

  /** A company's own settings: profile, terms, warehouses, bank, branding. */
  company: {
    page: {
      title: 'Business Settings',
      subtitle: 'Your details, how you get paid, and where you ship from.',
    } satisfies PageMeta,
    help: {
      whatIsThis:
        'Everything about how your business works on MediBridge. Change any section on its own — you do not have to fill in the whole page to save one thing.',
      topics: [
        {
          question: 'What does the Same-Day radius do?',
          answer:
            'Retailers within that many kilometres of a warehouse can choose Same-Day Delivery, as long as they order before the cut-off time. Everyone further away sees Next-Day.',
        },
        {
          question: 'If I change my token percentage, what happens to old orders?',
          answer:
            'Nothing. Every order keeps the percentage that applied when it was placed, so nobody is ever asked for more money after the fact.',
        },
        {
          question: 'Why can I only see the last four digits of my account number?',
          answer:
            'So a screenshot or someone glancing at your screen cannot capture it. To change the account, type the full number again.',
        },
        {
          question: 'I want to stop taking orders for a few days.',
          answer:
            'Pause the warehouse. Your stock stays exactly as it is and nothing is deleted — it simply stops appearing in searches until you resume.',
        },
        {
          question: 'Why will it not let me close a warehouse?',
          answer:
            'Because stock still ships from it. Move or remove that stock first, or pause the warehouse instead, which is reversible.',
        },
      ],
    } satisfies PageHelp,
  },

  security: {
    fields: {
      currentPassword: {
        label: 'Current Password',
        helperText: 'Enter the password you use now.',
      } satisfies FieldHelp,
      newPassword: {
        label: 'New Password',
        helperText: 'Use at least 8 characters, with one letter and one number.',
      } satisfies FieldHelp,
      confirmPassword: {
        label: 'Confirm New Password',
        helperText: 'Type your new password again so we know it is correct.',
      } satisfies FieldHelp,
    },
    submit: 'Change Password',
    success: 'Your password has been changed.',
    signOutOthers: 'Sign out of all other devices',
    signOutOthersHelp: 'Use this if you think someone else has your password.',
  },

  notifications: {
    page: {
      title: 'Messages',
      subtitle: 'Choose how you want us to keep you updated.',
    } satisfies PageMeta,
    channels: {
      sms: 'Text message (SMS)',
      email: 'Email',
      whatsapp: 'WhatsApp',
      inApp: 'In the app',
    },
    events: {
      orderPlaced: 'When I place an order',
      orderAccepted: 'When a distributor accepts my order',
      orderDispatched: 'When my order is on the way',
      orderDelivered: 'When my order is delivered',
      paymentReceived: 'When a payment goes through',
      paymentFailed: 'When a payment fails',
      newOrder: 'When I receive a new order',
      lowStock: 'When my stock is running low',
      expiringSoon: 'When a batch is close to expiring',
      licenseExpiring: 'When my drug license is close to expiring',
      settlementPaid: 'When my payout is sent',
    },
    alwaysOnNote:
      'Some messages, like payment receipts and license reminders, are always sent because you need them.',
    success: 'Your message settings have been saved.',
  },

  inbox: {
    page: {
      title: 'Notifications',
      subtitle: 'Everything we have told you recently.',
    } satisfies PageMeta,
    markAllRead: 'Mark All as Read',
    empty: {
      title: 'Nothing new',
      body: 'Updates about your orders, payments and deliveries will show up here.',
    } satisfies EmptyState,
  },
} as const
