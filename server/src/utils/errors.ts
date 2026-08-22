/**
 * Error helpers shared by services, controllers and middleware.
 *
 * `errorMessage` keeps user-facing messages safe when a non-Error value is
 * thrown (a bare string, a Prisma rejection object, …) instead of rendering
 * "undefined". `logError` is the single place where non-fatal failures are
 * written to the log with their full stack, so nothing disappears silently.
 */

export function errorMessage(error: unknown, fallback = 'Unexpected error'): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export function logError(context: string, error: unknown, meta?: Record<string, unknown>): void {
  const details = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  console.error(`[${context}]${details}`, error instanceof Error ? error.stack ?? error : error)
}
