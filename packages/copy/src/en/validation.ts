/**
 * Every validation message in the product.
 *
 * These attach to the shared Zod schemas in @medibridge/types, so the SAME
 * sentence is shown whether the check fails in the browser or on the server.
 * That is the point: technical language usually leaks in through backend
 * errors, and this closes that gap.
 *
 * Rules for writing these:
 *   - Say what to do, not what went wrong. "Please enter your GST number."
 *   - No field names in code style, no error codes, no stack language.
 *   - One sentence. Full stop at the end.
 */

export const validation = {
  /** Applies to any field. */
  required: 'This field cannot be empty.',
  requiredNamed: (field: string) => `Please enter your ${field}.`,
  selectRequired: (field: string) => `Please choose a ${field}.`,

  text: {
    tooShort: (min: number) => `Please enter at least ${min} characters.`,
    tooLong: (max: number) => `Please use ${max} characters or fewer.`,
    exactLength: (length: number) => `This must be exactly ${length} characters.`,
    onlyLetters: 'Please use letters only.',
    invalidCharacters: 'Please remove any special characters.',
  },

  number: {
    notANumber: 'Please enter numbers only.',
    min: (min: number) => `Please enter ${min} or more.`,
    max: (max: number) => `Please enter ${max} or less.`,
    positive: 'Please enter a number greater than zero.',
    wholeNumber: 'Please enter a whole number, without decimals.',
  },

  email: {
    invalid: 'Please enter a valid email address, like name@example.com.',
    alreadyUsed: 'This email address is already registered. Try signing in instead.',
  },

  phone: {
    invalid: 'Please enter a valid 10-digit mobile number.',
    alreadyUsed: 'This mobile number is already registered. Try signing in instead.',
  },

  password: {
    tooShort: 'Password must contain at least 8 characters.',
    needsLetterAndNumber: 'Password must include at least one letter and one number.',
    doesNotMatch: 'Both passwords must be the same.',
    incorrect: 'That password is not correct. Please try again.',
    sameAsOld: 'Your new password must be different from your current one.',
  },

  otp: {
    invalid: 'Please enter the 6-digit code we sent you.',
    incorrect: 'That code is not correct. Please check and try again.',
    expired: 'That code has expired. Please request a new one.',
    tooManyAttempts: 'Too many incorrect attempts. Please wait 15 minutes and try again.',
  },

  /** India-specific business identifiers. */
  gst: {
    invalid: 'Please enter a valid 15-character GST number.',
    alreadyUsed: 'This GST number is already registered with another account.',
  },

  drugLicense: {
    invalid: 'Please enter a valid drug license number.',
    alreadyUsed: 'This drug license number is already registered with another account.',
    expired: 'This drug license has already expired. Please upload a valid one.',
  },

  pincode: {
    invalid: 'Please enter a valid 6-digit PIN code.',
    notServiceable: 'We do not deliver to this PIN code yet.',
  },

  file: {
    required: 'Please choose a file to upload.',
    wrongType: 'Please upload a PDF, JPG or PNG file.',
    tooLarge: (maxMb: number) => `This file is too large. Please upload a file under ${maxMb} MB.`,
    uploadFailed: 'We could not upload your file. Please check your connection and try again.',
  },

  date: {
    invalid: 'Please enter a valid date.',
    mustBeFuture: 'Please choose a date in the future.',
    mustBePast: 'Please choose a date in the past.',
    expiryTooSoon: 'This batch expires too soon to be sold. Please check the date.',
  },

  quantity: {
    exceedsStock: 'Quantity cannot be greater than available stock.',
    /** Distributors set a minimum order quantity per item. */
    belowMinimum: (min: number, unit: string) => `You must order at least ${min} ${unit}.`,
    zero: 'Please enter a quantity of at least 1.',
  },

  price: {
    aboveMrp: 'Selling price cannot be higher than the MRP.',
    invalid: 'Please enter a valid price.',
  },

  address: {
    locationRequired: 'Please pick your shop location on the map so we can plan delivery.',
  },

  /** Failures that come back from the server, rewritten for humans. */
  server: {
    conflict: 'Someone else changed this while you were working. Please refresh and try again.',
    rateLimited: 'You have tried too many times. Please wait a moment and try again.',
    unavailable: 'The service is busy right now. Please try again in a minute.',
    /** Deliberately vague — never surface a stack trace or SQL error to a user. */
    unexpected: 'Something went wrong at our end. Please try again.',
  },
} as const
