import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { rateLimiter } from './rateLimiter'

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    setHeader: vi.fn(() => res),
  }
  return res as unknown as Response & typeof res
}

function call(
  limiter: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>
) {
  const res = mockRes()
  const next = vi.fn() as unknown as NextFunction
  limiter(req as Request, res, next)
  return { res, next: next as unknown as ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-01-01T08:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimiter', () => {
  it('allows requests up to the limit within a window', () => {
    const limiter = rateLimiter(60_000, 3)
    const req = { ip: '10.0.0.1' }

    for (let i = 0; i < 3; i++) {
      const { next, res } = call(limiter, req)
      expect(next).toHaveBeenCalledOnce()
      expect(res.status).not.toHaveBeenCalled()
    }
  })

  it('rejects the request past the limit with 429 and a Retry-After header', () => {
    const limiter = rateLimiter(60_000, 2)
    const req = { ip: '10.0.0.1' }

    call(limiter, req)
    call(limiter, req)
    vi.advanceTimersByTime(15_000)
    const { res, next } = call(limiter, req)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '45')
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RATE_LIMITED', retryAfter: 45, success: false })
    )
  })

  it('starts a fresh window once the old one has elapsed', () => {
    const limiter = rateLimiter(60_000, 1)
    const req = { ip: '10.0.0.1' }

    call(limiter, req)
    expect(call(limiter, req).res.status).toHaveBeenCalledWith(429)

    vi.advanceTimersByTime(60_000)
    const { next, res } = call(limiter, req)
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('counts each key separately, preferring userId over ip', () => {
    const limiter = rateLimiter(60_000, 1)

    call(limiter, { ip: '10.0.0.1', user: { id: 'u1' } as Express.User })
    // Same IP but a different user gets its own budget.
    const other = call(limiter, { ip: '10.0.0.1', user: { id: 'u2' } as Express.User })
    expect(other.next).toHaveBeenCalledOnce()

    const repeat = call(limiter, { ip: '10.0.0.1', user: { id: 'u1' } as Express.User })
    expect(repeat.res.status).toHaveBeenCalledWith(429)
  })

  it('falls back to "anonymous" when neither userId nor ip is present', () => {
    const limiter = rateLimiter(60_000, 1)

    call(limiter, {})
    expect(call(limiter, {}).res.status).toHaveBeenCalledWith(429)
  })

  it('uses a custom key function when provided', () => {
    const limiter = rateLimiter(60_000, 1, (req) => String(req.body?.code))

    call(limiter, { body: { code: 'AB3D7F' } })
    expect(call(limiter, { body: { code: 'ZZ9Q2K' } }).next).toHaveBeenCalledOnce()
    expect(call(limiter, { body: { code: 'AB3D7F' } }).res.status).toHaveBeenCalledWith(429)
  })

  it('gives separate limiters independent key-space', () => {
    const login = rateLimiter(60_000, 1)
    const checkin = rateLimiter(60_000, 1)
    const req = { ip: '10.0.0.1' }

    call(login, req)
    expect(call(checkin, req).next).toHaveBeenCalledOnce()
  })
})
