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
      search: {
        label: 'Search',
        helperText: 'Type a medicine name, brand, salt or batch number.',
        placeholder: 'e.g. Azithral or CRA24A091',
      } satisfies FieldHelp,
      warehouse: {
        label: 'Warehouse',
        helperText: 'Show stock held at one of your locations.',
      } satisfies FieldHelp,
      stock: {
        label: 'Stock level',
        helperText: 'Find what needs reordering before a retailer does.',
      } satisfies FieldHelp,
      expiry: {
        label: 'Expiry',
        helperText: 'Find what to shift or write off before it dies on the shelf.',
      } satisfies FieldHelp,
      status: {
        label: 'Listing',
        helperText: 'Switched-off batches stay in your list but retailers cannot order them.',
      } satisfies FieldHelp,
      sortBy: {
        label: 'Sort by',
        helperText: 'Oldest expiry first is usually what you want.',
      } satisfies FieldHelp,
      anyWarehouse: 'All warehouses',
      stockOptions: {
        all: 'Any level',
        low: 'Low stock',
        out: 'Out of stock',
      },
      expiryOptions: {
        all: 'Any date',
        expiring: 'Expiring within 90 days',
        expired: 'Already expired',
      },
      statusOptions: {
        active: 'Listed',
        inactive: 'Switched off',
        all: 'Both',
      },
      sortOptions: {
        expiry: 'Expiry, soonest first',
        name: 'Medicine name, A to Z',
        stock: 'Stock, lowest first',
        updated: 'Recently changed',
      },
      clear: 'Clear filters',
      activeCount: (count: number) =>
        count === 1 ? '1 filter applied' : `${count} filters applied`,
    },
    /** The four numbers a distributor opens the day with. */
    summary: {
      totalBatches: 'Batches listed',
      lowStock: 'Running low',
      outOfStock: 'Out of stock',
      expiringSoon: 'Expiring soon',
      expired: 'Expired',
      stockValue: 'Stock value',
      stockValueHint: 'What your sellable stock is worth at your own prices.',
    },
    stockLabels: {
      inStock: 'In stock',
      lowStock: 'Running low',
      outOfStock: 'Out of stock',
    },
    expiryLabels: {
      fresh: 'Good',
      expiringSoon: 'Expiring soon',
      expired: 'Expired',
    },
    /** Reads as a sentence, because "1/7" tells nobody anything. */
    showing: (from: number, to: number, total: number) =>
      `Showing ${from}–${to} of ${total.toLocaleString('en-IN')}`,
    pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
    previous: 'Previous',
    next: 'Next',
    reservedNote: (count: number) =>
      count === 1
        ? '1 unit is in a retailer’s cart right now'
        : `${count} units are in retailers’ carts right now`,
    availableOf: (available: number, total: number) => `${available} of ${total} free to sell`,
    editCta: 'Edit',
    expiringCta: 'Expiring Soon',
    notSellable: 'Retailers cannot order this',
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
      warehouse: {
        label: 'Warehouse',
        helperText: 'Which of your locations physically holds this batch.',
      } satisfies FieldHelp,
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
      confirmLabel: 'Remove it',
    },
    deleteCta: 'Remove from stock',
    /** Explains why three fields are read-only on the edit screen. */
    identityLocked:
      'The medicine, batch number and expiry date identify the physical goods, so they cannot be edited. If one is wrong, remove this batch and list it again.',
    /** Stock is physical, so it needs somewhere to live before it can exist. */
    noWarehouse: {
      title: 'Add a warehouse before adding stock',
      body: 'Stock is held somewhere physical, so we need at least one location before you can list any. Add one under Business settings and come back.',
      cta: 'Go to Business settings',
    },
    submitCreate: 'Add to My Stock',
    submitEdit: 'Save Changes',
    cancel: 'Cancel',
    priceAboveMrp: 'Your price cannot be more than the MRP printed on the pack.',
    marginNote: (percent: number) =>
      percent > 0 ? `${percent}% below MRP` : 'Priced at MRP',
    createHelp: {
      whatIsThis:
        'Add one batch of one medicine. Retailers near you can order it as soon as you save, so the price and quantity here are what they will see.',
      topics: [
        {
          question: 'Why one batch at a time?',
          answer:
            'Because the batch number and expiry date have to be right on every unit you sell. Two batches of the same medicine are two rows, and that is correct.',
        },
        {
          question: 'I cannot find the medicine in the list.',
          answer:
            'The medicine list is shared and kept by our team so retailers can compare prices properly. Ask for it from Medicine Requests and it is usually added within a working day.',
        },
        {
          question: 'Why will it not accept my expiry date?',
          answer:
            'A batch needs at least 30 days of shelf life left to be listed. A pharmacy cannot sell it in time otherwise, and it comes back as a return.',
        },
        {
          question: 'What is the minimum order quantity for?',
          answer:
            'The smallest amount a retailer may buy in one order. Use it for things you only sell by the box. Leave it at 1 otherwise.',
        },
      ],
    } satisfies PageHelp,
    editHelp: {
      whatIsThis:
        'Change your price, your stock count or whether retailers can order this batch at all. Changes are live immediately.',
      topics: [
        {
          question: 'Why can I not change the batch number or expiry?',
          answer:
            'Those identify the physical goods on your shelf. If one is wrong, remove this batch and add it again with the right details.',
        },
        {
          question: 'It will not let me reduce the quantity.',
          answer:
            'Some units are in retailers’ carts right now. You cannot count below what has already been promised. Try again once those orders are placed or expire.',
        },
        {
          question: 'How do I stop selling this without deleting it?',
          answer:
            'Switch off "Available to Order". The batch stays in your list with its history, and retailers stop seeing it.',
        },
      ],
    } satisfies PageHelp,
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
    daysLeft: (days: number) =>
      days < 0
        ? days === -1
          ? 'Expired yesterday'
          : `Expired ${Math.abs(days)} days ago`
        : days === 0
          ? 'Expires today'
          : days === 1
            ? '1 day left'
            : `${days} days left`,
    backToStock: 'All Stock',
    expiredHeading: 'Already expired',
    expiredBody:
      'These cannot be sold. Remove them from your stock list once they are off the shelf.',
    expiringHeading: 'Expiring within 90 days',
    help: {
      whatIsThis:
        'Batches close to their expiry date, soonest first. Discount them, move them, or return them to the manufacturer while there is still time.',
      topics: [
        {
          question: 'Why 90 days?',
          answer:
            'It is roughly the point where a retailer can still sell the stock through before it expires. Later than that and they will not take it.',
        },
        {
          question: 'Can retailers still order expiring stock?',
          answer:
            'Yes, until the day it expires. After that we stop showing it in search automatically.',
        },
        {
          question: 'What should I do with expired batches?',
          answer:
            'Take them off your shelf and remove them here, so your stock value and counts stay honest.',
        },
      ],
    } satisfies PageHelp,
    empty: {
      title: 'Nothing is expiring soon',
      body: 'None of your batches expire in the next 90 days. We will tell you here as soon as one does.',
    } satisfies EmptyState,
  },
} as const
