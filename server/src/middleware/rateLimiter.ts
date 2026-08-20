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

/**
 * Create a rate-limiting middleware.
 *
 * Each call to rateLimiter() creates its own isolated Map store so that
 * different limiters (login, refresh, checkin, …) never share key-space
 * and cannot interfere with each other.
 *
 * @param windowMs    Length of the sliding window in milliseconds.
 * @param maxRequests Max requests allowed per key within the window.
 * @param keyFn       Function that extracts a string key from the request.
 *                    Defaults to userId (authenticated) falling back to IP.
 */
export function rateLimiter(
  windowMs: number,
  maxRequests: number,
  keyFn?: (req: Request) => string
): (req: Request, res: Response, next: NextFunction) => void {
  // Each limiter instance gets its own isolated store — no shared key-space.
  const store = new Map<string, WindowEntry>()

  const defaultKey = (req: Request): string =>
    req.user?.id ?? req.ip ?? 'anonymous'

  const getKey = keyFn ?? defaultKey

  // Purge expired entries for this limiter's store every 5 minutes.
  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, entry] of store.entries()) {
      if (entry.windowStart < cutoff) store.delete(key)
    }
  }, 5 * 60_000)

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
