/**
 * Words reused across every module.
 *
 * Anything appearing on more than one screen belongs here, so "Save Changes"
 * can never become "Update" on one page and "Submit" on another.
 */

export const common = {
  app: {
    name: 'MediBridge B2B',
    tagline: 'Order medicines from trusted distributors.',
  },

  /** Button labels. One constant per action, used everywhere. */
  actions: {
    save: 'Save Changes',
    saving: 'Saving…',
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    submit: 'Submit',
    submitting: 'Submitting…',
    confirm: 'Yes, Continue',
    delete: 'Delete',
    deleting: 'Deleting…',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    filter: 'Filter',
    clearFilters: 'Clear Filters',
    apply: 'Apply',
    upload: 'Upload File',
    uploading: 'Uploading…',
    download: 'Download',
    retry: 'Try Again',
    refresh: 'Refresh',
    viewAll: 'View All',
    viewDetails: 'View Details',
    print: 'Print',
    copy: 'Copy',
    copied: 'Copied',
    selectAll: 'Select All',
    loadMore: 'Load More',
    getHelp: 'Help',
    showTour: 'Show Me Around',
  },

  /** Navigation labels — shared by the sidebar (desktop) and bottom bar (mobile). */
  nav: {
    home: 'Home',
    search: 'Search',
    cart: 'Cart',
    orders: 'Orders',
    inventory: 'Inventory',
    medicines: 'Medicines',
    payments: 'Payments',
    deliveries: 'Deliveries',
    reports: 'Reports',
    users: 'Users',
    settings: 'Settings',
    account: 'My Account',
    help: 'Help',
    more: 'More',
    signOut: 'Sign Out',
  },

  /** Table and list furniture. */
  table: {
    rowsPerPage: 'Rows per page',
    /** e.g. "Showing 1 to 20 of 145" */
    showingRange: (from: number, to: number, total: number) =>
      `Showing ${from} to ${to} of ${total}`,
    page: (current: number, total: number) => `Page ${current} of ${total}`,
    previous: 'Previous',
    next: 'Next',
    noResults: 'No results found.',
    sortBy: 'Sort by',
    selected: (count: number) => `${count} selected`,
  },

  /** Short status words. Always paired with an icon — never colour alone. */
  status: {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    verified: 'Verified',
    rejected: 'Rejected',
    expired: 'Expired',
    expiringSoon: 'Expiring Soon',
    inStock: 'In Stock',
    lowStock: 'Low Stock',
    outOfStock: 'Out of Stock',
  },

  /** Loading and error states shared by every data view. */
  feedback: {
    loading: 'Loading…',
    saved: 'Your changes have been saved.',
    somethingWentWrong: 'Something went wrong.',
    somethingWentWrongBody: 'Please try again. If this keeps happening, contact our support team.',
    offline: 'You are offline.',
    offlineBody: 'Check your internet connection and try again.',
    notFound: 'We could not find that page.',
    notFoundBody: 'The link may be broken, or the page may have been moved.',
    noAccess: 'You do not have permission to view this page.',
    noAccessBody: 'If you think this is a mistake, please contact your administrator.',
    sessionExpired: 'You have been signed out.',
    sessionExpiredBody: 'For your security we sign you out after a period of inactivity.',
    /** Shown while a form is submitting, to explain why buttons are disabled. */
    pleaseWait: 'Please wait — we are still saving your last action.',
  },

  /** Confirmation dialogs. Never destructive without asking. */
  confirm: {
    unsavedTitle: 'Leave without saving?',
    unsavedBody: 'Your changes will be lost if you leave this page now.',
    unsavedConfirm: 'Leave Page',
    unsavedCancel: 'Stay on Page',
    deleteTitle: 'Delete this item?',
    deleteBody: 'This cannot be undone.',
  },

  /** Units and formatting words. */
  units: {
    currencySymbol: '₹',
    km: 'km',
    strips: 'strips',
    boxes: 'boxes',
    units: 'units',
  },

  /** Generic field labels reused in many forms. */
  fields: {
    search: {
      label: 'Search',
      helperText: 'Type a medicine name, brand or salt to find what you need.',
      placeholder: 'e.g. Paracetamol 500mg',
    },
  },

  help: {
    panelTitle: 'Help',
    panelSubtitle: 'Everything you need to know about this page.',
    whatIsThisHeading: 'What is this page?',
    commonQuestionsHeading: 'Common questions',
    stillStuck: 'Still stuck?',
    stillStuckBody:
      'Call us on 1800-000-0000 or email support@medibridge.in — we reply within one working day.',
    replayTour: 'Show me around this page again',
  },
} as const
