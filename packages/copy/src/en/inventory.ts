import type { EmptyState, FieldHelp, PageHelp, PageMeta } from '../types.js'

/**
 * Distributor stock management.
 *
 * Inventory is tracked per BATCH, not per medicine — pharma needs batch number
 * and expiry on every unit sold, and stock is picked oldest-expiry-first.
 * The wording below has to make that feel natural rather than bureaucratic.
 */

export const inventory = {
  list: {
    page: {
      title: 'My Inventory',
      subtitle: 'Everything you have in stock. Retailers can only order what is listed here.',
    } satisfies PageMeta,
    addCta: 'Add Medicine',
    bulkUploadCta: 'Upload Spreadsheet',
    columns: {
      medicine: 'Medicine',
      batch: 'Batch',
      expiry: 'Expiry',
      stock: 'In Stock',
      mrp: 'MRP',
      yourPrice: 'Your Price',
      minOrder: 'Min. Order',
      status: 'Status',
    },
    filters: {
      allStock: 'All stock',
      lowStock: 'Low stock only',
      expiringSoon: 'Expiring within 90 days',
      outOfStock: 'Out of stock',
    },
    empty: {
      title: 'You have not added any stock yet',
      body: 'Retailers cannot find you until you list what you have. Add your first medicine to start receiving orders.',
      action: { label: 'Add Your First Medicine', href: '/inventory/new' },
      filteredTitle: 'No stock matches your filters',
      filteredBody: 'Try removing a filter or searching for a different medicine.',
    } satisfies EmptyState,
    help: {
      whatIsThis:
        'This is your stock list. Every medicine here is visible to retailers near you, and they can order it straight away.',
      topics: [
        {
          question: 'Why do I have to enter a batch number and expiry date?',
          answer:
            'The law requires a batch number and expiry date on every medicine you sell. We also use the expiry date to send you the oldest stock first, so nothing expires on your shelf.',
        },
        {
          question: 'Can the same medicine appear twice?',
          answer:
            'Yes, once for each batch. Two batches of the same medicine with different expiry dates are two separate rows, and that is correct.',
        },
        {
          question: 'What does "Min. Order" mean?',
          answer:
            'It is the smallest quantity a retailer is allowed to buy in one order. Use it for items you only sell by the box.',
        },
        {
          question: 'I have hundreds of medicines. Do I type them all in?',
          answer:
            'No. Tap "Upload Spreadsheet", download our template, fill it in, and upload it. You can add your whole stock list in one go.',
        },
        {
          question: 'How do I stop selling something temporarily?',
          answer:
            'Set its stock to zero, or switch the item off using the status toggle. It stays in your list but retailers cannot order it.',
        },
      ],
    } satisfies PageHelp,
  },

  form: {
    createPage: {
      title: 'Add Medicine to Your Stock',
      subtitle: 'Add one batch at a time. You can add another batch of the same medicine later.',
    } satisfies PageMeta,
    editPage: {
      title: 'Edit Stock Item',
      subtitle: 'Update your price, quantity or minimum order for this batch.',
    } satisfies PageMeta,
    sections: {
      medicine: 'Which medicine?',
      batch: 'Batch details',
      pricing: 'Price and quantity',
    },
    fields: {
      medicine: {
        label: 'Medicine',
        helperText: 'Search our medicine list and pick the exact one you stock.',
        placeholder: 'Search by name, brand or salt',
        tooltip:
          'We keep one shared list of medicines so retailers can compare prices properly. If you cannot find yours, tap "Request a new medicine" and our team will add it within one working day.',
      } satisfies FieldHelp,
      requestMedicine: 'Cannot find it? Request a new medicine',
      batchNumber: {
        label: 'Batch Number',
        helperText: 'Enter the batch number printed on the pack.',
        placeholder: 'B24A091',
      } satisfies FieldHelp,
      expiryDate: {
        label: 'Expiry Date',
        helperText: 'Enter the expiry date printed on the pack.',
        tooltip:
          'We send your oldest stock out first. We will also warn you when a batch is within 90 days of expiring so you can discount it in time.',
      } satisfies FieldHelp,
      mrp: {
        label: 'MRP',
        helperText: 'The maximum retail price printed on the pack.',
        placeholder: '₹120.00',
      } satisfies FieldHelp,
      sellingPrice: {
        label: 'Your Selling Price',
        helperText: 'The price retailers pay you. This cannot be more than the MRP.',
        placeholder: '₹96.00',
        tooltip:
          'You set this price yourself. Retailers see it next to other distributors’ prices, so a competitive price wins more orders.',
      } satisfies FieldHelp,
      quantity: {
        label: 'Quantity in Stock',
        helperText: 'How many units of this batch you have right now.',
        placeholder: '250',
      } satisfies FieldHelp,
      unit: {
        label: 'Sold As',
        helperText: 'Choose how you sell this medicine — by strip, box or bottle.',
      } satisfies FieldHelp,
      minOrderQty: {
        label: 'Minimum Order Quantity',
        helperText: 'Customers must order at least this quantity.',
        placeholder: '10',
        tooltip:
          'Use this for items you only sell in bulk. Leave it at 1 if a retailer can buy a single unit.',
      } satisfies FieldHelp,
      lowStockAlert: {
        label: 'Warn Me When Stock Falls Below',
        helperText: 'We will alert you when only this many units are left.',
        placeholder: '20',
      } satisfies FieldHelp,
      isActive: {
        label: 'Available to Order',
        helperText: 'Switch this off to hide the item from retailers without deleting it.',
      } satisfies FieldHelp,
    },
    success: {
      created: 'Medicine added to your stock.',
      updated: 'Inventory updated.',
      deleted: 'Item removed from your stock.',
      bulkUploaded: (count: number) => `${count} medicines added to your stock.`,
    },
    confirmDelete: {
      title: 'Remove this item from your stock?',
      body: 'Retailers will no longer see it. Orders already placed are not affected.',
    },
  },

  bulkUpload: {
    page: {
      title: 'Upload Your Stock List',
      subtitle: 'Add many medicines at once using a spreadsheet.',
    } satisfies PageMeta,
    stepDownload: 'Step 1 — Download our template',
    stepDownloadBody:
      'The template already has the right column headings. Fill in one row per batch.',
    stepUpload: 'Step 2 — Upload your filled-in file',
    stepUploadBody: 'We will check every row and show you any problems before anything is saved.',
    stepReview: 'Step 3 — Check and confirm',
    downloadTemplate: 'Download Template',
    fields: {
      file: {
        label: 'Your Spreadsheet',
        helperText: 'Upload the filled-in template as an Excel or CSV file. Maximum size 10 MB.',
      } satisfies FieldHelp,
    },
    resultReady: (valid: number, invalid: number) =>
      `${valid} rows are ready to add. ${invalid} rows need fixing.`,
    resultAllGood: (valid: number) => `All ${valid} rows look good.`,
    rowError: (row: number, message: string) => `Row ${row}: ${message}`,
    confirmImport: 'Add These Medicines',
    success: (count: number) => `${count} medicines added to your stock.`,
  },

  expiryAlerts: {
    page: {
      title: 'Expiring Soon',
      subtitle: 'Batches expiring within the next 90 days. Sell or return these first.',
    } satisfies PageMeta,
    daysLeft: (days: number) => (days === 1 ? '1 day left' : `${days} days left`),
    empty: {
      title: 'Nothing is expiring soon',
      body: 'None of your batches expire in the next 90 days. We will tell you here as soon as one does.',
    } satisfies EmptyState,
  },
} as const
