import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { ApiError } from '../utils/apiResponse'
import { errorHandler, notFoundHandler } from './error'

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  }
  return res as unknown as Response & typeof res
}

function handle(err: Error) {
  const res = mockRes()
  errorHandler(err, {} as Request, res, vi.fn() as unknown as NextFunction)
  return res
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('notFoundHandler', () => {
  it('reports the method and original url', () => {
    const res = mockRes()
    notFoundHandler({ method: 'GET', originalUrl: '/api/nope' } as Request, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'Route not found: GET /api/nope' })
  })
})

describe('errorHandler', () => {
  it('maps a ZodError to 400 with per-field details', () => {
    const parsed = z.object({ code: z.string().length(6) }).safeParse({ code: 'x' })
    expect(parsed.success).toBe(false)

    const res = handle(parsed.success ? new Error('unreachable') : parsed.error)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Validation failed',
      details: [{ path: 'code', message: expect.any(String) }],
    })
  })

  it('maps an ApiError to its own status and includes the code when set', () => {
    const res = handle(new ApiError('Invalid or expired code', 400, 'INVALID_CODE'))

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired code',
      code: 'INVALID_CODE',
    })
  })

  it('omits the code key for an ApiError without one', () => {
    const res = handle(new ApiError('Nope', 422))

    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json).toHaveBeenCalledWith({ error: 'Nope' })
  })

  it('maps an expired JWT to 401 TOKEN_EXPIRED', () => {
    const err = new Error('jwt expired')
    err.name = 'TokenExpiredError'
    const res = handle(err)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
  })

  it('maps a malformed JWT to 401', () => {
    const err = new Error('jwt malformed')
    err.name = 'JsonWebTokenError'
    const res = handle(err)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
  })

  it('maps a Prisma P2002 unique violation to 409', () => {
    const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    const res = handle(err)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: 'A record with this value already exists',
    })
  })

  it('hides unknown errors behind a logged 500', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = handle(new Error('boom'))

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    expect(spy).toHaveBeenCalled()
  })
})
