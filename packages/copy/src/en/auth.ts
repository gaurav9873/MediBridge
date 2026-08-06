import type { EmptyState, FieldHelp, OnboardingTour, PageHelp, PageMeta } from '../types.js'

/**
 * Sign up, sign in, and the license verification that gates ordering.
 *
 * This is the first screen a new retailer ever sees, so the wording carries
 * more weight here than anywhere else in the product.
 */

export const auth = {
  signIn: {
    page: {
      title: 'Sign In',
      subtitle: 'Welcome back. Sign in to place and track your orders.',
    } satisfies PageMeta,
    fields: {
      phone: {
        label: 'Mobile Number',
        helperText: 'Enter the 10-digit mobile number you registered with.',
        placeholder: '98765 43210',
      } satisfies FieldHelp,
      password: {
        label: 'Password',
        helperText: 'Enter your password.',
      } satisfies FieldHelp,
    },
    submit: 'Sign In',
    forgotPassword: 'Forgot your password?',
    noAccount: 'New to MediBridge?',
    createAccount: 'Create an Account',
    useOtpInstead: 'Sign in with an OTP instead',
    errors: {
      invalidCredentials: 'That mobile number or password is not correct. Please try again.',
      accountSuspended:
        'Your account has been paused. Please contact our support team on 1800-000-0000.',
    },
    success: 'Signed in successfully.',
    help: {
      whatIsThis: 'Sign in here to place orders, check your order history and manage your account.',
      topics: [
        {
          question: 'I forgot my password. What do I do?',
          answer:
            'Tap "Forgot your password?" below the password box. We will send a 6-digit code to your registered mobile number so you can set a new password.',
        },
        {
          question: 'I never received my OTP.',
          answer:
            'Wait 60 seconds and tap "Send code again". Make sure your phone has network coverage. If it still does not arrive, call us on 1800-000-0000.',
        },
        {
          question: 'Can I sign in without a password?',
          answer:
            'Yes. Tap "Sign in with an OTP instead" and we will send a 6-digit code to your mobile number.',
        },
      ],
    } satisfies PageHelp,
  },

  signUp: {
    page: {
      title: 'Create Your Account',
      subtitle: 'Takes about 5 minutes. You will need your GST number and drug license.',
    } satisfies PageMeta,
    steps: {
      account: 'Your Details',
      business: 'Business Details',
      license: 'Drug License',
      done: 'Finish',
    },
    fields: {
      role: {
        label: 'I am a',
        helperText:
          'Choose "Retailer" if you buy medicines. Choose "Distributor" if you sell them.',
      } satisfies FieldHelp,
      fullName: {
        label: 'Your Full Name',
        helperText: 'Enter your name as it appears on your official documents.',
        placeholder: 'Rajesh Kumar',
      } satisfies FieldHelp,
      phone: {
        label: 'Mobile Number',
        helperText: 'We will send you a 6-digit code to confirm this number.',
        placeholder: '98765 43210',
      } satisfies FieldHelp,
      email: {
        label: 'Email Address',
        helperText: 'We will send your order receipts and invoices here.',
        placeholder: 'name@example.com',
      } satisfies FieldHelp,
      password: {
        label: 'Create a Password',
        helperText: 'Use at least 8 characters, with one letter and one number.',
      } satisfies FieldHelp,
      confirmPassword: {
        label: 'Confirm Password',
        helperText: 'Type the same password again so we know it is correct.',
      } satisfies FieldHelp,
      businessName: {
        label: 'Shop or Business Name',
        helperText: 'Enter the name printed on your drug license.',
        placeholder: 'Sharma Medical Store',
      } satisfies FieldHelp,
      gstNumber: {
        label: 'GST Number',
        helperText: 'Enter your 15-character GST number.',
        placeholder: '27AAPFU0939F1ZV',
        tooltip:
          'Your GST number is on your GST registration certificate. It has 15 characters: 2 digits for your state, then 10 characters of your PAN, then 3 more characters.',
      } satisfies FieldHelp,
      address: {
        label: 'Shop Address',
        helperText: 'Enter the full address where you want your medicines delivered.',
        placeholder: 'Shop 12, MG Road, Pune',
      } satisfies FieldHelp,
      pincode: {
        label: 'PIN Code',
        helperText: 'Enter the 6-digit PIN code of your shop.',
        placeholder: '411001',
      } satisfies FieldHelp,
      location: {
        label: 'Shop Location',
        helperText: 'Drag the pin to your exact shop location. This decides your delivery options.',
        tooltip:
          'We use your shop location to find distributors near you. If a distributor is close enough, you can get Same-Day Delivery.',
      } satisfies FieldHelp,
      licenseNumber: {
        label: 'Drug License Number',
        helperText: 'Enter the license number exactly as printed on your license.',
        placeholder: 'MH-PUN-123456',
      } satisfies FieldHelp,
      licenseExpiry: {
        label: 'License Valid Until',
        helperText: 'Enter the expiry date printed on your drug license.',
        tooltip:
          'We check this date before every order. If your license expires, you will not be able to order until you upload a renewed one.',
      } satisfies FieldHelp,
      licenseFile: {
        label: 'Upload Drug License',
        helperText: 'Upload a clear image or PDF of your valid drug license. Maximum size 5 MB.',
        tooltip:
          'Make sure the license number, your shop name and the expiry date are all clearly readable. Blurry uploads will be rejected and slow down your approval.',
      } satisfies FieldHelp,
      gstFile: {
        label: 'Upload GST Certificate',
        helperText: 'Upload a clear image or PDF of your GST registration certificate.',
      } satisfies FieldHelp,
      acceptTerms: {
        label: 'I agree to the Terms of Service and Privacy Policy',
        helperText: 'You must agree before creating your account.',
      } satisfies FieldHelp,
    },
    submit: 'Create Account',
    haveAccount: 'Already have an account?',
    signInInstead: 'Sign In',
    success: 'Your account has been created.',
    help: {
      whatIsThis:
        'Create your MediBridge account here. We ask for your GST number and drug license because the law requires us to check them before selling medicines.',
      topics: [
        {
          question: 'What documents do I need?',
          answer:
            'Two things: your GST registration certificate and your valid drug license. A clear phone photo of each is fine, as long as all the text can be read.',
        },
        {
          question: 'How long does approval take?',
          answer:
            'Our team checks your documents within one working day. We will send you an SMS and an email as soon as your account is approved.',
        },
        {
          question: 'Can I look around before I am approved?',
          answer:
            'Yes. You can search medicines and see prices straight away. You will be able to place your first order once your license is approved.',
        },
        {
          question: 'My drug license has expired. Can I still register?',
          answer:
            'No. We can only accept a licence that is currently valid. Please renew it first, then register with the new one.',
        },
      ],
    } satisfies PageHelp,
  },

  otp: {
    page: {
      title: 'Confirm Your Mobile Number',
      subtitle: 'We sent a 6-digit code by SMS. Enter it below.',
    } satisfies PageMeta,
    fields: {
      code: {
        label: '6-Digit Code',
        helperText: 'Enter the code we just sent to your mobile number.',
        placeholder: '123456',
      } satisfies FieldHelp,
    },
    sentTo: (phone: string) => `We sent a code to ${phone}.`,
    wrongNumber: 'Wrong number? Change it',
    resend: 'Send code again',
    resendIn: (seconds: number) => `You can ask for a new code in ${seconds} seconds.`,
    submit: 'Confirm',
    success: 'Your mobile number has been confirmed.',
  },

  forgotPassword: {
    page: {
      title: 'Reset Your Password',
      subtitle: 'We will send a 6-digit code to your registered mobile number.',
    } satisfies PageMeta,
    fields: {
      phone: {
        label: 'Mobile Number',
        helperText: 'Enter the mobile number you registered with.',
        placeholder: '98765 43210',
      } satisfies FieldHelp,
      newPassword: {
        label: 'New Password',
        helperText: 'Use at least 8 characters, with one letter and one number.',
      } satisfies FieldHelp,
    },
    submit: 'Send Code',
    setPassword: 'Save New Password',
    backToSignIn: 'Back to Sign In',
    success: 'Your password has been changed. Please sign in.',
    /** Deliberately identical whether or not the number exists — no account enumeration. */
    sentNeutral: 'If that number is registered with us, we have sent it a 6-digit code.',
  },

  /** Shown while an account is waiting for admin approval. */
  pendingVerification: {
    page: {
      title: 'We Are Checking Your Documents',
      subtitle: 'You can look around while you wait. Ordering unlocks once you are approved.',
    } satisfies PageMeta,
    statusPending: 'Your documents are with our team.',
    statusPendingBody:
      'We check every new account within one working day. We will send you an SMS and an email the moment you are approved.',
    statusRejected: 'We could not approve your documents.',
    statusRejectedBody:
      'Please read the reason below, fix the problem, and upload your documents again.',
    reasonHeading: 'Why we could not approve it',
    reuploadCta: 'Upload Documents Again',
    browseCta: 'Browse Medicines',
    help: {
      whatIsThis:
        'This page shows how your account approval is going. Our team checks your GST certificate and drug license before you can place orders.',
      topics: [
        {
          question: 'Why do you need to check my documents?',
          answer:
            'Indian law only allows medicines to be sold to licensed businesses. Checking your drug license keeps you and us on the right side of that rule.',
        },
        {
          question: 'What can I do while I wait?',
          answer:
            'You can search medicines, compare prices and build your cart. You just cannot place the order until your account is approved.',
        },
        {
          question: 'My documents were rejected. What now?',
          answer:
            'Read the reason shown on this page — it is usually a blurry photo or an expired date. Fix that, tap "Upload Documents Again", and we will re-check within one working day.',
        },
      ],
    } satisfies PageHelp,
  },

  /** Blocks the checkout button when a license lapses mid-relationship. */
  licenseExpired: {
    title: 'Your drug license has expired.',
    body: 'You cannot place new orders until you upload a renewed license. Your existing orders are not affected.',
    action: { label: 'Upload Renewed License', href: '/account/license' },
  } satisfies EmptyState,

  /** First-run walkthrough for a freshly approved retailer. */
  retailerTour: {
    id: 'retailer-first-run',
    intro: {
      title: 'Welcome to MediBridge',
      body: 'Let us show you around. It takes less than a minute, and you can stop any time.',
      startLabel: 'Show Me Around',
      skipLabel: 'Skip for now',
    },
    steps: [
      {
        target: 'search',
        title: 'Find your medicines',
        body: 'Type a medicine name, brand or salt here. We show you every distributor near you who has it in stock.',
      },
      {
        target: 'cart',
        title: 'Your cart',
        body: 'Add what you need here. If your medicines come from different distributors, we split them into separate orders automatically — you still pay once.',
      },
      {
        target: 'delivery-mode',
        title: 'Same-Day or Next-Day',
        body: 'If a distributor is close enough to your shop, you can choose Same-Day Delivery. Otherwise we deliver the next day.',
      },
      {
        target: 'payment-token',
        title: 'Pay 20% now, 80% later',
        body: 'You pay a fifth of the total to confirm your order. You pay the rest in cash when your medicines arrive.',
      },
      {
        target: 'orders',
        title: 'Track everything here',
        body: 'Every order you place shows up here, from packing to delivery.',
      },
    ],
    outro: {
      title: 'That is everything',
      body: 'You are ready to place your first order. You can see this tour again any time from the Help button.',
      doneLabel: 'Start Ordering',
    },
  } satisfies OnboardingTour,

  /** First-run walkthrough for a newly approved distributor. */
  distributorTour: {
    id: 'distributor-first-run',
    intro: {
      title: 'Welcome to MediBridge',
      body: 'Here is a quick tour of how you list stock and handle orders.',
      startLabel: 'Show Me Around',
      skipLabel: 'Skip for now',
    },
    steps: [
      {
        target: 'inventory',
        title: 'Add your stock',
        body: 'List what you have here, batch by batch. Retailers can only see and order what you have added.',
      },
      {
        target: 'bulk-upload',
        title: 'Adding a lot at once?',
        body: 'Upload a spreadsheet instead of typing each medicine. We give you a template to fill in.',
      },
      {
        target: 'delivery-radius',
        title: 'Set your delivery area',
        body: 'Retailers within this distance from you can choose Same-Day Delivery. Everyone else gets Next-Day.',
      },
      {
        target: 'orders',
        title: 'New orders arrive here',
        body: 'Accept an order, pack it, then mark it dispatched. We keep the retailer updated at every step.',
      },
    ],
    outro: {
      title: 'That is everything',
      body: 'Add your first stock item and retailers near you will start seeing it right away.',
      doneLabel: 'Add My Stock',
    },
  } satisfies OnboardingTour,
} as const
