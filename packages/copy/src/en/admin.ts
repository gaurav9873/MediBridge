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
      packSize: 'Pack',
      schedule: 'Schedule',
      gstRate: 'GST',
      status: 'Status',
      distributors: 'Distributors',
      stocked: 'Stocked by',
    },
    /** Narrowing the list. Each filter says what it does, not what it is. */
    filters: {
      heading: 'Find a medicine',
      search: {
        label: 'Search',
        helperText: 'Type a medicine name, brand or salt. Part of a word is enough.',
        placeholder: 'e.g. Paracetamol',
      } satisfies FieldHelp,
      form: {
        label: 'Type',
        helperText: 'Show only tablets, syrups, injections and so on.',
      } satisfies FieldHelp,
      schedule: {
        label: 'Drug Schedule',
        helperText: 'Show only medicines under a particular schedule.',
      } satisfies FieldHelp,
      status: {
        label: 'Status',
        helperText: 'Archived medicines are hidden from distributors but kept for old orders.',
      } satisfies FieldHelp,
      anyForm: 'Any type',
      anySchedule: 'Any schedule',
      clear: 'Clear filters',
      activeCount: (count: number) =>
        count === 1 ? '1 filter applied' : `${count} filters applied`,
    },
    statusOptions: {
      active: 'In use',
      archived: 'Archived',
      all: 'Both',
    },
    statusLabels: {
      active: 'In use',
      archived: 'Archived',
    },
    /** Paging. Written as sentences because a bare "1/9" tells a user nothing. */
    list: {
      resultCount: (total: number) =>
        total === 1 ? '1 medicine' : `${total.toLocaleString('en-IN')} medicines`,
      showing: (from: number, to: number, total: number) =>
        `Showing ${from}–${to} of ${total.toLocaleString('en-IN')}`,
      pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
      previous: 'Previous',
      next: 'Next',
      sortedByName: 'Sorted by name, A to Z.',
      stockedBy: (count: number) =>
        count === 0
          ? 'No distributor stocks this yet'
          : count === 1
            ? '1 distributor stocks this'
            : `${count} distributors stock this`,
      viewCta: 'Open',
      editCta: 'Edit',
      duplicatesCta: 'Check duplicates',
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
      manufacturer: {
        label: 'Manufacturer',
        helperText: 'Optional. Who actually makes it, if that differs from the brand.',
        placeholder: 'Micro Labs Ltd',
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

    /**
     * Adding and editing.
     *
     * One form, two headings. The sections match how somebody reads a medicine
     * pack — what it is, then what is in it, then what the law says — rather
     * than the order the columns happen to sit in the database.
     */
    form: {
      addPage: {
        title: 'Add Medicine',
        subtitle: 'Add a medicine to the shared list so distributors can stock it.',
      } satisfies PageMeta,
      editPage: {
        title: 'Edit Medicine',
        subtitle: 'Correct the details every distributor and retailer sees.',
      } satisfies PageMeta,
      sections: {
        identity: {
          title: 'What is it?',
          description:
            'These four together decide whether two entries are the same medicine, so copy them exactly as printed on the pack.',
        },
        details: {
          title: 'What is in it?',
          description: 'Retailers search using these, so it is worth getting them right.',
        },
        compliance: {
          title: 'Tax and legal',
          description: 'These control invoices and who is allowed to buy it.',
        },
      },
      submitAdd: 'Add Medicine',
      submitEdit: 'Save Changes',
      cancel: 'Cancel',
      /** Shown live while typing, before anything is submitted. */
      prescriptionForced:
        'This schedule always needs a prescription, so we have switched that on and locked it.',
      scheduleXWarning:
        'Schedule X cannot be saved. MediBridge does not support the Form 2C register these medicines legally require. Choose another schedule.',
      identityHint:
        'Name, brand, strength and pack size together make this medicine unique. Changing them may clash with an entry that already exists.',
      addHelp: {
        whatIsThis:
          'Add a medicine to the one shared list that every distributor stocks against. Get it right once here and nobody has to type it again.',
        topics: [
          {
            question: 'How careful do I need to be with the name?',
            answer:
              'Very. Copy it exactly as printed on the pack. "Dolo 650" and "Dolo-650" would become two separate medicines, and retailers would then see the stock split across both instead of one price comparison.',
          },
          {
            question: 'It says this medicine already exists.',
            answer:
              'Something with the same name, brand, strength and pack size is already on the list. Open that one and edit it rather than adding a second copy.',
          },
          {
            question: 'What if I do not know the HSN code?',
            answer:
              'It is printed on the distributor’s invoice for that medicine, and most general medicines use 30049099. It appears on every invoice, so it is worth checking rather than guessing.',
          },
          {
            question: 'Which schedule should I choose?',
            answer:
              'The one printed on the pack. If the pack shows no schedule, choose "No schedule". Schedule H and H1 need a prescription, and we switch that on for you.',
          },
        ],
      } satisfies PageHelp,
      editHelp: {
        whatIsThis:
          'Correct a medicine on the shared list. Every distributor stocking it and every retailer searching for it sees this change straight away.',
        topics: [
          {
            question: 'Will this change old orders?',
            answer:
              'No. Orders keep their own copy of the medicine as it was when the order was placed, so an old invoice still reads correctly.',
          },
          {
            question: 'Can I change the name?',
            answer:
              'Yes, but carefully. If another entry already uses the new name, brand, strength and pack size, we will stop you and ask you to merge the two instead.',
          },
          {
            question: 'What does archiving do?',
            answer:
              'It hides the medicine from search and from distributors adding new stock, while keeping it on old orders. Nothing is deleted, and you can put it back at any time.',
          },
        ],
      } satisfies PageHelp,
    },

    /** Taking a medicine out of circulation. Reversible, and said so. */
    archive: {
      cta: 'Archive',
      confirm: {
        title: 'Archive this medicine?',
        body: 'It disappears from search and no distributor can add new stock against it. Old orders keep working, and you can restore it at any time.',
        confirmLabel: 'Archive it',
      },
      blockedTitle: 'This medicine cannot be archived yet',
      /** Shown before they try, when we can already see stock against it. */
      stockWarning: (count: number) =>
        count === 1
          ? 'One seller still holds stock of this. Archiving is refused until that stock is cleared, because it would vanish from their inventory.'
          : `${count} sellers still hold stock of this. Archiving is refused until that stock is cleared, because it would vanish from their inventory.`,
      success: 'Archived. It is now hidden from search.',
    },
    restore: {
      cta: 'Restore',
      confirm: {
        title: 'Put this medicine back?',
        body: 'It becomes searchable again and distributors can add stock against it.',
        confirmLabel: 'Restore it',
      },
      success: 'Restored. Distributors can stock it again.',
    },

    /**
     * Duplicate review.
     *
     * The exact-match constraint in the database catches repeats. This screen
     * exists for the ones it cannot catch — the spelling variants that quietly
     * split one medicine's stock in two.
     */
    duplicates: {
      page: {
        title: 'Possible Duplicates',
        subtitle: 'Entries that look like the same medicine written a different way.',
      } satisfies PageMeta,
      subjectHeading: 'You are reviewing',
      candidatesHeading: 'These look similar',
      exactBadge: 'Same name, brand, strength and pack',
      likelyBadge: 'Looks similar',
      matchStrength: (score: number) => `${Math.round(score * 100)}% alike`,
      compareCta: 'Compare and merge',
      dismissHint:
        'Not a duplicate? Leave it alone. Nothing here changes until you merge two entries yourself.',
      empty: {
        title: 'Nothing looks like a duplicate',
        body: 'We compared this against every similar name, brand and salt in the list and found nothing worth merging.',
      } satisfies EmptyState,
      help: {
        whatIsThis:
          'We look for entries that are probably the same medicine typed slightly differently — "Dolo 650" against "Dolo-650". Two entries mean the stock is split in two, so retailers never see the real best price.',
        topics: [
          {
            question: 'Does this change anything on its own?',
            answer:
              'No. This screen only shows you what looks similar. Nothing moves until you compare two entries and confirm a merge.',
          },
          {
            question: 'How do you decide what is similar?',
            answer:
              'We compare the name and strength letter by letter and show anything above about half-alike, plus anything that matches exactly on name, brand, strength and pack size.',
          },
          {
            question: 'Two of these are genuinely different medicines.',
            answer:
              'Then leave them. A 10-tablet pack and a 15-tablet pack of the same tablet look similar but are different products, and both should stay.',
          },
        ],
      } satisfies PageHelp,
    },

    /**
     * Merge.
     *
     * The one destructive action in this module, so it gets a full comparison
     * and a confirmation that says exactly what will happen.
     */
    merge: {
      page: {
        title: 'Merge Medicines',
        subtitle: 'Keep one entry, and move everything from the other onto it.',
      } satisfies PageMeta,
      keepHeading: 'Keeping this one',
      mergeHeading: 'Merging this one into it',
      keepCta: 'Keep this one instead',
      swapCta: 'Swap which one is kept',
      swapHint: 'Keep the entry that is spelled correctly — that is the one everybody will see.',
      differences: 'Where they differ',
      identical: 'These two entries are identical in every field.',
      fieldSame: 'Same',
      stockNote: (count: number) =>
        count === 0
          ? 'No stock to move.'
          : count === 1
            ? '1 batch of stock will move across.'
            : `${count} batches of stock will move across.`,
      confirm: {
        title: 'Merge these two medicines?',
        body: 'Stock, requests and history move onto the entry you are keeping, and the other one is archived. This cannot be undone from here.',
        confirmLabel: 'Merge them',
      },
      success: (moved: number) =>
        moved === 0
          ? 'Merged. There was no stock to move.'
          : moved === 1
            ? 'Merged. 1 batch moved across.'
            : `Merged. ${moved} batches moved across.`,
      collisionWarning: (count: number) =>
        count === 1
          ? '1 batch could not move because the medicine you kept already has a batch with the same number in the same warehouse. It has been left where it is — please check it.'
          : `${count} batches could not move because the medicine you kept already has batches with the same numbers in the same warehouses. They have been left where they are — please check them.`,
      help: {
        whatIsThis:
          'Merging moves every batch of stock, every request and all history from one entry onto another, then archives the one you are not keeping. Use it when the same medicine has been added twice.',
        topics: [
          {
            question: 'Which one should I keep?',
            answer:
              'The one spelled the way it appears on the pack. That is the name every retailer will search for and every invoice will show.',
          },
          {
            question: 'Is the other one deleted?',
            answer:
              'No, it is archived. Old orders still reference it, so deleting it would break invoices from last year. It simply stops appearing anywhere new.',
          },
          {
            question: 'Can I undo a merge?',
            answer:
              'Not from this screen. The stock has genuinely moved. Check the comparison carefully before you confirm.',
          },
          {
            question: 'What is a batch that "could not move"?',
            answer:
              'A warehouse cannot hold two batches with the same batch number for one medicine. If both entries have batch AB123 in the same warehouse, one is left behind for you to sort out by hand.',
          },
        ],
      } satisfies PageHelp,
    },
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

    /**
     * The request queue, from both sides.
     *
     * `review` is what an admin sees; `mine` is what the distributor who asked
     * sees. Same rows, different jobs, so different words.
     */
    requests: {
      review: {
        page: {
          title: 'Medicine Requests',
          subtitle: 'Medicines distributors could not find and have asked us to add.',
        } satisfies PageMeta,
        waitingCount: (count: number) =>
          count === 1 ? '1 request waiting' : `${count} requests waiting`,
        askedBy: (person: string, company: string) => `${person} at ${company}`,
        askedOn: (date: string) => `Asked on ${date}`,
        labels: {
          askedBy: 'Asked by',
          when: 'When',
        },
        notesHeading: 'What they told us',
        noNotes: 'They did not add a note.',
        approveCta: 'Add to the list',
        rejectCta: 'Refuse',
        approveIntro:
          'Check what they asked for, then fill in the rest. A request has a name and a brand; the shared list also needs an HSN code, a GST rate and a schedule, and those are your call rather than theirs.',
        approvePage: {
          title: 'Add a Requested Medicine',
          subtitle: 'Check the request, complete the details, and add it to the shared list.',
        } satisfies PageMeta,
        requestedHeading: 'What was requested',
        rejectField: {
          label: 'Why are you refusing this?',
          helperText: 'The distributor reads this exactly as you write it, so be specific.',
          placeholder: 'e.g. This is already on the list as Dolo 650, 15 tablets.',
        } satisfies FieldHelp,
        rejectConfirm: {
          title: 'Refuse this request?',
          confirmLabel: 'Refuse it',
        },
        empty: {
          title: 'No requests waiting',
          body: 'When a distributor cannot find a medicine they stock, their request lands here for you to check.',
        } satisfies EmptyState,
        help: {
          whatIsThis:
            'Distributors ask here when they hold stock of something that is not on the shared list. Approving a request adds the medicine; refusing it sends them your reason.',
          topics: [
            {
              question: 'Why do I have to fill in extra fields to approve?',
              answer:
                'Because a request only carries a name and a brand. The shared list needs an HSN code, a GST rate and a drug schedule, and getting those wrong affects every invoice for that medicine.',
            },
            {
              question: 'This medicine is already on the list.',
              answer:
                'Refuse the request and write the exact name it is listed under. They can then find it in search straight away.',
            },
            {
              question: 'Does refusing block them from asking again?',
              answer:
                'No. They see your reason and can ask again with better details.',
            },
          ],
        } satisfies PageHelp,
      },
      mine: {
        page: {
          title: 'Medicine Requests',
          subtitle: 'Medicines you have asked us to add to the shared list.',
        } satisfies PageMeta,
        newCta: 'Request a Medicine',
        askedOn: (date: string) => `Asked on ${date}`,
        rejectionHeading: 'Why it was refused',
        approvedNote: 'This is now on the shared list, so you can add your stock against it.',
        pendingNote: 'Our team is checking this. We usually reply within a working day.',
        statusLabels: {
          PENDING: 'Being checked',
          APPROVED: 'Added to the list',
          REJECTED: 'Not added',
        },
        empty: {
          title: 'You have not asked for anything yet',
          body: 'If you stock a medicine that is not on the shared list, ask us to add it and you will be able to list your stock against it.',
          action: { label: 'Request a Medicine' },
        } satisfies EmptyState,
        help: {
          whatIsThis:
            'MediBridge keeps one shared list of medicines so that retailers can compare prices across distributors. If something you stock is missing from it, ask here and our team will add it.',
          topics: [
            {
              question: 'Why can I not add the medicine myself?',
              answer:
                'The list is shared by every distributor. If everybody typed their own names, the same medicine would appear five times and retailers could not compare prices. Our team keeps one clean entry per medicine.',
            },
            {
              question: 'How long does it take?',
              answer:
                'Usually within one working day. You will see the status change here as soon as it is decided.',
            },
            {
              question: 'My request was refused.',
              answer:
                'The reason is shown against the request. Most often the medicine is already on the list under a slightly different name — search for the name given in the reason.',
            },
          ],
        } satisfies PageHelp,
      },
      newRequest: {
        page: {
          title: 'Request a Medicine',
          subtitle: 'Tell us what is missing and we will add it to the shared list.',
        } satisfies PageMeta,
        intro:
          'Give us as much as you can read off the pack. The more you fill in, the faster we can add it.',
        fields: {
          name: {
            label: 'Medicine Name',
            helperText: 'The full name as printed on the pack.',
            placeholder: 'e.g. Dolo 650',
          } satisfies FieldHelp,
          brand: {
            label: 'Brand',
            helperText: 'The company that makes it.',
            placeholder: 'e.g. Micro Labs',
          } satisfies FieldHelp,
          composition: {
            label: 'Salt or Composition',
            helperText: 'Optional. The active ingredient, if the pack shows it.',
            placeholder: 'e.g. Paracetamol 650mg',
          } satisfies FieldHelp,
          form: {
            label: 'Type',
            helperText: 'Optional. Tablet, syrup, injection and so on.',
          } satisfies FieldHelp,
          strength: {
            label: 'Strength',
            helperText: 'Optional. How much active ingredient is in each unit.',
            placeholder: 'e.g. 650mg',
          } satisfies FieldHelp,
          notes: {
            label: 'Anything else we should know',
            helperText: 'Optional. Add a pack size, a manufacturer, or why you need it.',
            placeholder: 'e.g. 15 tablets per strip. Two of my retailers ask for it weekly.',
          } satisfies FieldHelp,
        },
        submit: 'Send Request',
        cancel: 'Cancel',
        /** The instant answer, when the medicine turns out to already exist. */
        alreadyExists: {
          title: 'Good news — this is already on the list',
          body: (name: string) =>
            `We found "${name}" already in the shared list, so there is nothing to wait for. Search for it and you can add your stock against it now.`,
          cta: 'Search the list',
        },
        success: 'Request sent. We will let you know as soon as it is decided.',
        help: {
          whatIsThis:
            'Tell us about a medicine you stock that is missing from the shared list. Our team checks it and adds it, usually within a working day.',
          topics: [
            {
              question: 'What if it is already on the list?',
              answer:
                'We check as you submit. If we find it, we tell you the name it is listed under straight away rather than making you wait for a review.',
            },
            {
              question: 'Which details actually matter?',
              answer:
                'The name and the brand are what we really need. Everything else just helps us add it faster and get it right first time.',
            },
          ],
        } satisfies PageHelp,
      },
    },

    success: {
      created: 'Medicine added to the list.',
      updated: 'Medicine updated.',
      requestApproved: 'Added to the list. The distributor can stock it now.',
      requestRejected: 'Refused. The distributor can see your reason.',
    },
    empty: {
      title: 'No medicines in the list yet',
      body: 'Add medicines here so distributors can list their stock against them.',
      action: { label: 'Add First Medicine', href: '/admin/medicines/new' },
      filteredTitle: 'No medicines match what you are looking for',
      filteredBody:
        'Nothing here matches your search and filters. Try a shorter search, or clear the filters to see the whole list.',
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
