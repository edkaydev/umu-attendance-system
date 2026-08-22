export interface ApiErrorBody {
  error: string
  code?: string
}

export class ApiClientError extends Error {
  status: number
  code?: string
  /** Underlying failure (network TypeError, JSON parse error, …) when there is one. */
  cause?: unknown

  constructor(message: string, status: number, code?: string, cause?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.cause = cause
  }
}

/** Status used when the request never reached the server. */
export const NETWORK_ERROR_STATUS = 0

let unauthorizedHandler: (() => void) | null = null

/** Register a handler called when a request fails auth even after a refresh. */
export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const init: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  }

  // fetch rejects with a bare TypeError when the network is down or the API is
  // unreachable. Wrapping it in ApiClientError means callers can keep their
  // single `instanceof ApiClientError` check and still show a real message
  // instead of the generic "Failed to fetch" fallback.
  async function send(input: string, requestInit: RequestInit): Promise<Response> {
    try {
      return await fetch(input, requestInit)
    } catch (error) {
      throw new ApiClientError(
        'Cannot reach the server. Check your connection and try again.',
        NETWORK_ERROR_STATUS,
        'NETWORK_ERROR',
        error
      )
    }
  }

  let res = await send(path, init)

  // Silent refresh on 401, retry once (task 82)
  if (res.status === 401 && path !== '/api/auth/refresh') {
    const refreshed = await send('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshed.ok) {
      res = await send(path, init)
    }
  }

  if (!res.ok) {
    // A non-JSON error body (proxy HTML, empty 502) is expected here — the
    // status still carries the useful information.
    let body: ApiErrorBody | null = null
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      body = null
    }
    if (res.status === 401) {
      unauthorizedHandler?.()
    }
    throw new ApiClientError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code)
  }

  if (res.status === 204) {
    return undefined as T
  }
  try {
    return (await res.json()) as T
  } catch (error) {
    throw new ApiClientError(
      'The server returned an unreadable response.',
      res.status,
      'INVALID_RESPONSE',
      error
    )
  }
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
}
