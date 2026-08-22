export interface ApiErrorBody {
  error: string
  code?: string
}

export class ApiClientError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

/** Server-supplied message for a failed request, or `fallback` for anything else. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback
}

let unauthorizedHandler: (() => void) | null = null

/** Register a handler called when a request fails auth even after a refresh. */
export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

/** Get CSRF token from cookie */
function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'csrf_token') {
      return decodeURIComponent(value)
    }
  }
  return null
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  // Add CSRF token for state-changing requests
  if (options.method && options.method !== 'GET' && options.method !== 'HEAD') {
    // Get CSRF token from cookie
    const csrfToken = getCsrfTokenFromCookie()
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken)
    }
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

  let res = await fetch(path, init)

  // Silent refresh on 401, retry once (task 82)
  if (res.status === 401 && path !== '/api/auth/refresh') {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshed.ok) {
      res = await fetch(path, init)
    }
  }

  if (!res.ok) {
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
  return (await res.json()) as T
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
