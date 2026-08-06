import { copy } from '@medibridge/copy'
import { z } from 'zod'
import { UserRole } from '../enums.js'
import {
  addressSchema,
  drugLicenseNumberSchema,
  emailSchema,
  gstinSchema,
  mobileSchema,
  otpSchema,
  passwordSchema,
} from './common.js'

const v = copy.validation

export const signInSchema = z.object({
  phone: mobileSchema,
  password: z.string().min(1, v.requiredNamed('password')),
})
export type SignInInput = z.infer<typeof signInSchema>

export const requestOtpSchema = z.object({
  phone: mobileSchema,
})

export const verifyOtpSchema = z.object({
  phone: mobileSchema,
  code: otpSchema,
})
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

/** Only these two roles can self-register; admins are created by other admins. */
export const registrableRoleSchema = z.enum([UserRole.RETAILER, UserRole.DISTRIBUTOR], {
  error: v.selectRequired('account type'),
})

/** Step 1 of sign-up: who you are. */
export const signUpAccountSchema = z
  .object({
    role: registrableRoleSchema,
    fullName: z.string().trim().min(2, v.requiredNamed('full name')).max(120, v.text.tooLong(120)),
    phone: mobileSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: 'Please agree to the Terms of Service to continue.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: v.password.doesNotMatch,
    path: ['confirmPassword'],
  })
export type SignUpAccountInput = z.infer<typeof signUpAccountSchema>

/** Step 2: the business and where it is. */
export const signUpBusinessSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, v.requiredNamed('business name'))
    .max(160, v.text.tooLong(160)),
  gstNumber: gstinSchema,
  address: addressSchema,
})
export type SignUpBusinessInput = z.infer<typeof signUpBusinessSchema>

/**
 * Step 3: the drug licence.
 *
 * An already-expired licence is rejected here rather than at approval time, so
 * the person filling the form finds out immediately instead of a day later.
 */
export const signUpLicenseSchema = z.object({
  licenseNumber: drugLicenseNumberSchema,
  licenseExpiry: z.coerce
    .date(v.date.invalid)
    .refine((date) => date.getTime() > Date.now(), v.drugLicense.expired),
  licenseFileKey: z.string().min(1, v.file.required),
  gstFileKey: z.string().min(1, v.file.required),
})
export type SignUpLicenseInput = z.infer<typeof signUpLicenseSchema>

/** The whole sign-up, as submitted at the end of the wizard. */
export const signUpSchema = z.object({
  account: signUpAccountSchema,
  business: signUpBusinessSchema,
  license: signUpLicenseSchema,
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const forgotPasswordSchema = z.object({
  phone: mobileSchema,
})

export const resetPasswordSchema = z
  .object({
    phone: mobileSchema,
    code: otpSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: v.password.doesNotMatch,
    path: ['confirmPassword'],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, v.requiredNamed('current password')),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: v.password.doesNotMatch,
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: v.password.sameAsOld,
    path: ['newPassword'],
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
})

/** What the API returns after a successful sign-in. */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/** The signed-in user, as the web app holds it. */
export interface SessionUser {
  id: string
  fullName: string
  phone: string
  email: string
  role: UserRole
  accountStatus: string
  businessName: string | null
  /** False while a licence is pending, rejected or expired — gates checkout. */
  canPlaceOrders: boolean
  /** Drives the licence-expiry warning banner. */
  licenseExpiresOn: string | null
}
