/**
 * Lightweight in-process rate limiter middleware.
 *
 * Uses a sliding-window counter keyed on an arbitrary string (typically
 * userId or IP).  Counters are stored in a Map and expired lazily.
 *
 * This is intentionally simple — no Redis, no extra dependencies.
 * It is sufficient for single-process deployments.  If the app is ever
 * horizontally scaled, swap this for a Redis-backed limiter.
 */

import { Request, Response, NextFunction } from 'express'

interface WindowEntry {
  count: number
  windowStart: number
}

const store = new Map<string, WindowEntry>()

/**
 * Create a rate-limiting middleware.
 *
 * @param windowMs   Length of the sliding window in milliseconds.
 * @param maxRequests  Max requests allowed per key within the window.
 * @param keyFn      Function that extracts a string key from the request.
 *                   Defaults to userId (authenticated) falling back to IP.
 */
export function rateLimiter(
  windowMs: number,
  maxRequests: number,
  keyFn?: (req: Request) => string
): (req: Request, res: Response, next: NextFunction) => void {
  const defaultKey = (req: Request): string =>
    req.user?.id ?? req.ip ?? 'anonymous'

  const getKey = keyFn ?? defaultKey

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getKey(req)
    const now = Date.now()

    const entry = store.get(key)

    if (!entry || now - entry.windowStart >= windowMs) {
      // Start a new window
      store.set(key, { count: 1, windowStart: now })
      next()
      return
    }

    entry.count++

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000)
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({
        success: false,
        message: 'Too many requests — please wait before trying again.',
        code: 'RATE_LIMITED',
        retryAfter: retryAfterSec,
      })
      return
    }

    next()
  }
}

/**
 * Periodically purge expired entries to prevent unbounded memory growth.
 * Called internally; no need to invoke from application code.
 */
function purgeExpired(windowMs: number): void {
  const cutoff = Date.now() - windowMs
  for (const [key, entry] of store.entries()) {
    if (entry.windowStart < cutoff) store.delete(key)
  }
}

// Purge every 5 minutes.  The windowMs passed here is the maximum window
// any limiter could use — we use a conservative 10-minute value.
setInterval(() => purgeExpired(10 * 60_000), 5 * 60_000)
