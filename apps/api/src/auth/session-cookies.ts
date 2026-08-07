import type { CookieOptions, Response } from 'express'
import { loadEnv } from '../config/env'
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.guard'

/**
 * Where a session lives in the browser.
 *
 * Transport, not business logic — which is why these are plain functions here
 * rather than methods on AuthService. Services take plain objects and return
 * DTOs so the same service can serve HTTP, a worker and a future mobile API;
 * a service that knew about `Response` could not.
 *
 * Two controllers issue sessions (password sign-in and code sign-in), so the
 * settings live in one place. Getting `httpOnly` wrong in one of two copies is
 * exactly the kind of drift this prevents.
 */

/**
 * httpOnly so script cannot read the session; sameSite lax so it survives
 * ordinary navigation but is not sent on cross-site POSTs; secure in production
 * only, since localhost is plain HTTP.
 */
function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: loadEnv().NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export function writeSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  ttl: { accessMs: number; refreshMs: number },
): void {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ttl.accessMs))
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(ttl.refreshMs))
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' })
  res.clearCookie(REFRESH_COOKIE, { path: '/' })
}
