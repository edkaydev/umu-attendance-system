/**
 * Enhanced in-process rate limiter middleware with security features.
 *
 * Uses a sliding-window counter keyed on an arbitrary string (typically
 * userId or IP).  Counters are stored in a Map and expired lazily.
 *
 * This is intentionally simple — no Redis, no extra dependencies.
 * It is sufficient for single-process deployments.  If the app is ever
 * horizontally scaled, swap this for a Redis-backed limiter.
 */

import { Request, Response, NextFunction } from 'express'
import { securityLogger } from './securityLogger'

interface WindowEntry {
  count: number
  windowStart: number
  blockedUntil?: number // For temporary bans
}

/**
 * Create a rate-limiting middleware with enhanced security features.
 *
 * Each call to rateLimiter() creates its own isolated Map store so that
 * different limiters (login, refresh, checkin, …) never share key-space
 * and cannot interfere with each other.
 *
 * @param windowMs    Length of the sliding window in milliseconds.
 * @param maxRequests Max requests allowed per key within the window.
 * @param keyFn       Function that extracts a string key from the request.
 *                    Defaults to userId (authenticated) falling back to IP.
 * @param options     Additional security options.
 */
interface RateLimiterOptions {
  /** Enable temporary ban after repeated violations */
  enableBan?: boolean
  /** Number of violations before temporary ban */
  banThreshold?: number
  /** Duration of temporary ban in milliseconds */
  banDuration?: number
  /** Skip rate limiting for trusted IPs */
  trustedIps?: string[]
}

export function rateLimiter(
  windowMs: number,
  maxRequests: number,
  keyFn?: (req: Request) => string,
  options: RateLimiterOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const {
    enableBan = true,
    banThreshold = 5,
    banDuration = 15 * 60 * 1000, // 15 minutes
    trustedIps = [],
  } = options

  // Each limiter instance gets its own isolated store — no shared key-space.
  const store = new Map<string, WindowEntry>()
  const violationCount = new Map<string, number>()

  const defaultKey = (req: Request): string =>
    req.user?.id ?? req.ip ?? 'anonymous'

  const getKey = keyFn ?? defaultKey

  // Check if IP is trusted
  const isTrusted = (req: Request): boolean => {
    const ip = req.ip
    return trustedIps.includes(ip || '')
  }

  // Purge expired entries for this limiter's store every 5 minutes.
  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, entry] of store.entries()) {
      if (entry.windowStart < cutoff) store.delete(key)
    }
  }, 5 * 60_000)

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting for trusted IPs
    if (isTrusted(req)) {
      return next()
    }

    const key = getKey(req)
    const now = Date.now()

    const entry = store.get(key)

    // Check if currently banned
    if (entry?.blockedUntil && now < entry.blockedUntil) {
      const remainingSec = Math.ceil((entry.blockedUntil - now) / 1000)
      res.setHeader('Retry-After', String(remainingSec))
      res.status(429).json({
        success: false,
        message: 'Too many violations — temporarily blocked.',
        code: 'RATE_LIMIT_BANNED',
        retryAfter: remainingSec,
      })
      return
    }

    // Clear ban if time has passed
    if (entry?.blockedUntil && now >= entry.blockedUntil) {
      entry.blockedUntil = undefined
      violationCount.delete(key)
    }

    if (!entry || now - entry.windowStart >= windowMs) {
      // Start a new window
      store.set(key, { count: 1, windowStart: now })
      next()
      return
    }

    entry.count++

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000)
      
      // Track violations for potential ban
      if (enableBan) {
        const violations = (violationCount.get(key) || 0) + 1
        violationCount.set(key, violations)

        // Apply temporary ban if threshold exceeded
        if (violations >= banThreshold) {
          entry.blockedUntil = now + banDuration
          securityLogger.logRateLimitBanned(req, key, banDuration)
          res.setHeader('Retry-After', String(banDuration / 1000))
          res.status(429).json({
            success: false,
            message: 'Too many violations — temporarily blocked.',
            code: 'RATE_LIMIT_BANNED',
            retryAfter: banDuration / 1000,
          })
          return
        }
      }

      securityLogger.logRateLimitExceeded(req, key)
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
