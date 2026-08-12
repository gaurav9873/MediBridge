import { type ApiResponse, type ApiFieldError, friendlyMessage } from '@medibridge/types'

/**
 * The single way the web app talks to the API.
 *
 * Its job beyond fetching: guarantee that no technical error reaches a user.
 * Every failure — a network drop, a 500, a validation rejection — becomes an
 * ApiClientError carrying a sentence from the copy layer. Components show
 * `error.message` directly and never have to inspect what went wrong.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1'

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  /** Per-field messages, ready to hand to React Hook Form's setError. */
  readonly fields?: ApiFieldError[]
  readonly requestId?: string

  constructor(params: {
    code: string
    message: string
    status: number
    fields?: ApiFieldError[]
    requestId?: string
  }) {
    super(params.message)
    this.name = 'ApiClientError'
    this.code = params.code
    this.status = params.status
    this.fields = params.fields
    this.requestId = params.requestId
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Set false for public endpoints like sign-in. */
  auth?: boolean
}

/**
 * Endpoints that must never trigger a refresh-and-retry.
 *
 * Refreshing in response to a failed refresh is an infinite loop, and retrying
 * a sign-in adds nothing.
 */
const NO_RETRY = ['/auth/refresh', '/auth/sign-in', '/auth/admin/sign-in', '/auth/sign-out']

/**
 * One refresh at a time, shared by every caller.
 *
 * A screen typically fires several requests at once. Without this, all of them
 * would notice the expiry together and fire their own refresh — and because
 * refresh tokens rotate with replay detection, the second one to land would
 * look like a stolen token and kill the session outright. So the first caller
 * refreshes and the rest wait on the same promise.
 */
let refreshInFlight: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      return response.ok
    } catch {
      return false
    } finally {
      // Cleared on the next tick so callers racing this one still join it.
      setTimeout(() => {
        refreshInFlight = null
      }, 0)
    }
  })()
  return refreshInFlight
}

/**
 * Ends the session cleanly.
 *
 * A full navigation rather than a router push: it guarantees no stale React
 * Query cache, no half-rendered shell and no in-memory state from the signed-in
 * user survives into the login page. Being logged out should look like being
 * logged out.
 */
function forceSignOut(): void {
  if (typeof window === 'undefined') return
  const { pathname } = window.location
  if (pathname.endsWith('/login')) return

  // Staff and buyers have different front doors; send them to their own.
  const loginPath = pathname.startsWith('/admin') ? '/admin/login' : '/login'
  window.location.replace(`${loginPath}?expired=1`)
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return attempt<T>(path, options, true)
}

/**
 * One request, with a single transparent recovery from an expired session.
 *
 * The access cookie lives 15 minutes and the browser DELETES it when it
 * lapses, so the next request arrives with no cookie at all and the server
 * answers UNAUTHENTICATED rather than SESSION_EXPIRED. Both mean the same
 * thing here — the access token is gone — and both are recoverable from the
 * refresh cookie, which lasts 30 days.
 *
 * Handling only SESSION_EXPIRED, as this used to, meant the common case never
 * recovered: people were signed out after 15 idle minutes while a perfectly
 * valid refresh cookie sat unused.
 */
async function attempt<T>(
  path: string,
  options: RequestOptions,
  mayRetry: boolean,
): Promise<T> {
  const { body, auth = true, headers, ...rest } = options

  // A file upload is FormData, and the browser must set Content-Type itself so
  // it can add the multipart boundary. Setting it here would break the upload
  // in a way that looks like a server bug.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(headers ?? {}),
      },
      credentials: auth ? 'include' : 'omit',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    })
  } catch {
    // The network never reached us — offline, DNS, CORS.
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: friendlyMessage('SERVICE_UNAVAILABLE'),
      status: 0,
    })
  }

  let payload: ApiResponse<T>
  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    // A non-JSON response means something upstream broke. Say nothing technical.
    throw new ApiClientError({
      code: 'INTERNAL_ERROR',
      message: friendlyMessage('INTERNAL_ERROR'),
      status: response.status,
    })
  }

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined
    const code = error?.code ?? 'INTERNAL_ERROR'

    const sessionGone = code === 'SESSION_EXPIRED' || code === 'UNAUTHENTICATED'
    if (sessionGone && auth && mayRetry && !NO_RETRY.some((route) => path.startsWith(route))) {
      if (await refreshSession()) return attempt<T>(path, options, false)
      // The refresh cookie is gone or was rejected. This is a real sign-out.
      forceSignOut()
    }

    throw new ApiClientError({
      code,
      // Prefer the server's message (already friendly), fall back to the local
      // lookup so an unknown code still produces a readable sentence.
      message: error?.message ?? friendlyMessage(error?.code),
      status: response.status,
      fields: error?.fields,
      requestId: error?.requestId,
    })
  }

  return payload.data
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  /** Multipart upload. The browser sets the Content-Type and boundary. */
  postForm: <T>(path: string, body: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
}

/**
 * Maps a validation failure onto a React Hook Form.
 *
 *   catch (error) {
 *     if (!applyFieldErrors(error, form.setError)) notify.error(error.message)
 *   }
 *
 * Returns true when the error was field-level and has been shown inline, so
 * the caller knows not to also raise a toast.
 */
export function applyFieldErrors<TFieldName extends string>(
  error: unknown,
  // Generic so React Hook Form's narrowed field-path type satisfies it. The
  // server sends dotted paths as plain strings, hence the cast below.
  setError: (field: TFieldName, error: { type: string; message: string }) => void,
): boolean {
  if (!(error instanceof ApiClientError) || !error.fields?.length) return false
  for (const field of error.fields) {
    setError(field.field as TFieldName, { type: 'server', message: field.message })
  }
  return true
}
