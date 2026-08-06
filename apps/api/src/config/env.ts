import { z } from 'zod'

/**
 * Environment validation.
 *
 * Parsed once at boot. A missing or malformed variable stops the process with a
 * readable list rather than surfacing as a null-pointer somewhere in a request
 * three hours later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * The role the running API connects as. Deliberately separate from
   * DATABASE_URL: that one owns the schema and can bypass Row-Level Security,
   * which would silently disable every tenant policy. Falls back so a
   * misconfigured environment fails at the boot check with a clear message
   * rather than at a config parse with an opaque one.
   */
  APP_DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /** e.g. "medibridge.in" — the suffix the SubdomainStrategy strips. */
  TENANT_BASE_DOMAIN: z.string().default(''),
  /** Single-tenant deployments name their one company here. */
  DEFAULT_TENANT_SLUG: z.string().default(''),

  DEFAULT_DELIVERY_RADIUS_KM: z.coerce.number().int().min(1).max(200).default(25),
  DEFAULT_TOKEN_PERCENT: z.coerce.number().int().min(1).max(100).default(20),
  DEFAULT_SAME_DAY_CUTOFF: z.string().default('14:00'),

  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  AWS_S3_BUCKET: z.string().default(''),
  AWS_REGION: z.string().default('ap-south-1'),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function loadEnv(): Env {
  if (cached) return cached

  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Environment configuration is invalid:\n${problems}\n`)
  }

  // Refuse to start production with the placeholder secrets from .env.example.
  if (parsed.data.NODE_ENV === 'production') {
    const placeholders = [parsed.data.JWT_ACCESS_SECRET, parsed.data.JWT_REFRESH_SECRET]
    if (placeholders.some((secret) => secret.startsWith('dev-only-'))) {
      throw new Error('Refusing to start in production with the development JWT secrets.')
    }
  }

  cached = parsed.data
  return cached
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
