import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// In-memory stand-in for the shared Redis client.
function fakeRedis(state: { bans: Set<string>; counters: Map<string, number> }) {
  return {
    exists: async (k: string) => (state.bans.has(k) ? 1 : 0),
    incr: async (k: string) => {
      const v = (state.counters.get(k) ?? 0) + 1
      state.counters.set(k, v)
      return v
    },
    pexpire: async () => 1,
    pttl: async () => 60_000,
    psetex: async (_k: string, _ms: number, _v: string) => 'OK',
  }
}

const redisState = { bans: new Set<string>(), counters: new Map<string, number>() }
let redisAvailable = true

vi.mock('../config/redis', () => ({
  tryRedis: async (op: (r: unknown) => Promise<unknown>, fallback: unknown) => {
    if (!redisAvailable) return fallback
    return op(fakeRedis(redisState))
  },
}))

import { rateLimiter } from './rateLimiter'

function makeReq(ip = '203.0.113.9'): Request {
  return { ip, method: 'POST', path: '/api/auth/login', headers: {} } as unknown as Request
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      res.headers[k] = v
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as Response
}

describe('rateLimiter middleware', () => {
  beforeEach(() => {
    redisAvailable = true
    redisState.bans.clear()
    redisState.counters.clear()
  })

  it('calls next() when Redis is healthy and the request is under the limit', async () => {
    const middleware = rateLimiter(15 * 60_000, 10, (req) => req.ip ?? 'anonymous')
    const next = vi.fn()
    middleware(makeReq(), makeRes(), next as unknown as NextFunction)
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1))
  })

  it('responds 429 without calling next() once the limit is exceeded', async () => {
    const middleware = rateLimiter(15 * 60_000, 2, (req) => req.ip ?? 'anonymous')
    const next = vi.fn()

    for (let i = 0; i < 2; i++) {
      middleware(makeReq(), makeRes(), next as unknown as NextFunction)
    }
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(2))

    const res = makeRes()
    middleware(makeReq(), res, next as unknown as NextFunction)
    await vi.waitFor(() => expect(res.statusCode).toBe(429))
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('falls back to the in-memory store when Redis is unavailable', async () => {
    redisAvailable = false
    const middleware = rateLimiter(15 * 60_000, 10, (req) => req.ip ?? 'anonymous')
    const next = vi.fn()
    middleware(makeReq(), makeRes(), next as unknown as NextFunction)
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1))
  })
})
