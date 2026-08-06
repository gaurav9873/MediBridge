import { type ApiResponse, type ApiFieldError, friendlyMessage } from '@medibridge/types'

/**
 * The single way the web app talks to the API.
 *
 * Its job beyond fetching: guarantee that no technical error reaches a user.
 * Every failure — a network drop, a 500, a validation rejection — becomes an
 * ApiClientError carrying a sentence from the copy layer. Components show
 * `error.message` directly and never have to inspect what went wrong.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'

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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
      },
      credentials: auth ? 'include' : 'omit',
      body: body === undefined ? undefined : JSON.stringify(body),
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
    throw new ApiClientError({
      code: error?.code ?? 'INTERNAL_ERROR',
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
