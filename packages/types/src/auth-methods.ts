/**
 * Pluggable authentication and tenant resolution.
 *
 * Two extension points, both designed so the core flow never changes:
 *
 *   sign-in  =  resolve tenant  ->  provider identifies the user  ->  issue session
 *
 * Adding Google login means writing one provider. Adding a new way to work out
 * which tenant a request belongs to means writing one strategy. Neither touches
 * session issuance, guards, or any business service.
 */

// ---------------------------------------------------------------------------
// Authentication methods
// ---------------------------------------------------------------------------

export const AuthMethod = {
  /** Mobile number + password. The default today. */
  PASSWORD: 'PASSWORD',
  /** Mobile number + one-time code. */
  OTP: 'OTP',
  EMAIL_PASSWORD: 'EMAIL_PASSWORD',
  USERNAME_PASSWORD: 'USERNAME_PASSWORD',
  GOOGLE: 'GOOGLE',
  MICROSOFT: 'MICROSOFT',
  /** SAML/OIDC against a tenant's own identity provider. */
  SSO: 'SSO',
  /** Machine-to-machine. No user session, no cookies. */
  API_TOKEN: 'API_TOKEN',
} as const
export type AuthMethod = (typeof AuthMethod)[keyof typeof AuthMethod]

/**
 * What a provider is given. Deliberately loose — each provider validates its
 * own shape, so adding a method never widens a shared type.
 */
export interface AuthCredentials {
  method: AuthMethod
  [key: string]: unknown
}

/** What a provider returns. It identifies; it does not decide access. */
export interface IdentityResult {
  userId: string
  /** The identity row that matched, for audit. */
  identityId: string
  method: AuthMethod
  /** Provider is confident the contact detail is genuine (e.g. Google email). */
  verified: boolean
}

/**
 * One way of proving who you are.
 *
 * A provider ONLY answers "which user is this?". Whether that user may sign in
 * — suspended, wrong tenant, expired licence — is decided once, centrally,
 * after every provider. That separation is what stops each new login method
 * re-implementing (and eventually mis-implementing) the access rules.
 */
export interface AuthProviderContract {
  readonly method: AuthMethod
  /** False while a provider is built but not yet switched on. */
  readonly enabled: boolean
  identify(credentials: AuthCredentials, companyId: string | null): Promise<IdentityResult>
}

// ---------------------------------------------------------------------------
// Tenant resolution
// ---------------------------------------------------------------------------

export const TenantResolutionSource = {
  /** A gateway or service mesh already decided. Highest trust, checked first. */
  HEADER: 'HEADER',
  /** app.abcpharma.com */
  CUSTOM_DOMAIN: 'CUSTOM_DOMAIN',
  /** abcpharma.medibridge.in */
  SUBDOMAIN: 'SUBDOMAIN',
  /** medibridge.in/abcpharma */
  PATH: 'PATH',
  /** The signed-in user's own company. */
  SESSION: 'SESSION',
  /** Single-tenant deployment: one company, configured. */
  DEFAULT: 'DEFAULT',
} as const
export type TenantResolutionSource =
  (typeof TenantResolutionSource)[keyof typeof TenantResolutionSource]

export interface ResolvedTenant {
  companyId: string
  slug: string
  source: TenantResolutionSource
}

/**
 * One way of working out which tenant a request belongs to.
 *
 * Strategies run in priority order and the first non-null answer wins. The
 * rest of the application reads TenantContext and never learns which strategy
 * produced it — so the same build runs on subdomains in production, a path
 * prefix in a demo, and a gateway header behind an API gateway.
 */
export interface TenantResolutionStrategyContract {
  readonly source: TenantResolutionSource
  /** Lower runs first. */
  readonly priority: number
  resolve(request: TenantResolutionRequest): Promise<ResolvedTenant | null>
}

/** The parts of a request a strategy may look at. Nothing else. */
export interface TenantResolutionRequest {
  host: string
  path: string
  headers: Readonly<Record<string, string | string[] | undefined>>
  /** Set once the session is known; the SESSION strategy uses it. */
  sessionCompanyId?: string | null
}

// ---------------------------------------------------------------------------
// White label
// ---------------------------------------------------------------------------

/**
 * Everything a client needs to render a tenant's portal BEFORE anyone signs in.
 *
 * Served from one public endpoint so the web app, the mobile app and any
 * future client all brand themselves the same way, from the same source.
 */
export interface TenantBranding {
  companyId: string
  slug: string
  name: string
  logoUrl: string | null
  brandColor: string | null
  loginImageUrl: string | null
  supportEmail: string | null
  supportPhone: string | null
  /** Which sign-in methods to offer. Drives the login screen's buttons. */
  authMethods: AuthMethod[]
  /** Marketplace portals may show a public catalogue; private ones may not. */
  allowsSelfSignup: boolean
}
