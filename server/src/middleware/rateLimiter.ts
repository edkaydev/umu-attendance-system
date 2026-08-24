/**
 * Distributed-ready sliding-window rate limiter middleware.
 *
 * Two interchangeable stores behind one interface:
 * - Redis (REDIS_URL set): counters/bans are shared across all app
 *   instances, so limits hold no matter which replica receives a request.
 * - In-memory Map: automatic fallback for single-process deployments,
 *   dev environments, or while Redis is briefly unreachable.
 */

import { Request, Response, NextFunction } from 'express'
import { securityLogger } from './securityLogger'
import { tryRedis } from '../config/redis'

interface WindowEntry {
  count: number
  windowStart: number
  blockedUntil?: number // For temporary bans
}

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

const BAN_PREFIX = 'rl:ban:'
const COUNT_PREFIX = 'rl:cnt:'
const VIOLATION_PREFIX = 'rl:vio:'

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

  const store = new Map<string, WindowEntry>()
  const violationCount = new Map<string, number>()

  const defaultKey = (req: Request): string =>
    req.user?.id ?? req.ip ?? 'anonymous'

  const getKey = keyFn ?? defaultKey

  const isTrusted = (req: Request): boolean => {
    const ip = req.ip
    return trustedIps.includes(ip || '')
  }

  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, entry] of store.entries()) {
      if (entry.windowStart < cutoff) store.delete(key)
    }
  }, 5 * 60_000)

  function respondBanned(res: Response, retryAfterSec: number): void {
    res.setHeader('Retry-After', String(retryAfterSec))
    res.status(429).json({
      success: false,
      message: `Too many attempts — access is temporarily blocked. Try again in about ${Math.max(1, Math.ceil(retryAfterSec / 60))} minute(s).`,
      code: 'RATE_LIMIT_BANNED',
      retryAfter: retryAfterSec,
    })
  }

  async function checkRedis(
    req: Request,
    res: Response,
    key: string
  ): Promise<boolean | null> {
    return tryRedis(async (r) => {
      const banKey = BAN_PREFIX + key

      const banned = await r.exists(banKey)
      if (banned) {
        const ttlSec = Math.ceil((await r.pttl(banKey)) / 1000)
        respondBanned(res, ttlSec > 0 ? ttlSec : Math.ceil(banDuration / 1000))
        return true
      }

      const countKey = COUNT_PREFIX + key
      const count = await r.incr(countKey)
      if (count === 1) await r.pexpire(countKey, windowMs)

      if (count > maxRequests) {
        if (enableBan) {
          const vioKey = VIOLATION_PREFIX + key
          const violations = await r.incr(vioKey)
          if (violations === 1) await r.pexpire(vioKey, windowMs * 2)
          if (violations >= banThreshold) {
            await r.psetex(banKey, banDuration, '1')
            securityLogger.logRateLimitBanned(req, key, banDuration)
            respondBanned(res, Math.ceil(banDuration / 1000))
            return true
          }
        }
        securityLogger.logRateLimitExceeded(req, key)
        const retryAfterSec = Math.ceil((windowMs - ((count - 1) * windowMs) / maxRequests) / 1000)
        res.setHeader('Retry-After', String(Math.max(retryAfterSec, 1)))
        res.status(429).json({
          success: false,
          message: `Too many requests — please wait about ${Math.max(1, Math.ceil(retryAfterSec / 60))} minute(s) before trying again.`,
          code: 'RATE_LIMITED',
          retryAfter: Math.max(retryAfterSec, 1),
        })
        return true
      }

      return false
    }, null)
  }

  function checkMemory(req: Request, res: Response, key: string, next: NextFunction): void {
    const now = Date.now()
    const entry = store.get(key)

    if (entry?.blockedUntil && now < entry.blockedUntil) {
      respondBanned(res, Math.ceil((entry.blockedUntil - now) / 1000))
      return
    }

    if (entry?.blockedUntil && now >= entry.blockedUntil) {
      entry.blockedUntil = undefined
      violationCount.delete(key)
    }

    if (!entry || now - entry.windowStart >= windowMs) {
      store.set(key, { count: 1, windowStart: now })
      next()
      return
    }

    entry.count++

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000)

      if (enableBan) {
        const violations = (violationCount.get(key) || 0) + 1
        violationCount.set(key, violations)

        if (violations >= banThreshold) {
          entry.blockedUntil = now + banDuration
          securityLogger.logRateLimitBanned(req, key, banDuration)
          respondBanned(res, Math.ceil(banDuration / 1000))
          return
        }
      }

      securityLogger.logRateLimitExceeded(req, key)
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({
        success: false,
        message: `Too many requests — please wait about ${Math.max(1, Math.ceil(retryAfterSec / 60))} minute(s) before trying again.`,
        code: 'RATE_LIMITED',
        retryAfter: retryAfterSec,
      })
      return
    }

    next()
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (isTrusted(req)) {
      next()
      return
    }

    const key = getKey(req)

    void checkRedis(req, res, key).then((handledByRedis) => {
      // true → Redis responded (limited/banned); false → allowed;
      // null → Redis unavailable, fall back to the in-memory store.
      if (handledByRedis === true) return
      if (handledByRedis === false) {
        next()
        return
      }
      checkMemory(req, res, key, next)
    })
  }
}
