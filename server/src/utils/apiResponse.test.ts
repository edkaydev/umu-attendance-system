import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import { ApiError, created, noContent, ok } from './apiResponse'

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
  }
  return res as unknown as Response & typeof res
}

describe('ApiError', () => {
  it('defaults to a 400 status with no code', () => {
    const err = new ApiError('Bad input')
    expect(err.status).toBe(400)
    expect(err.code).toBeUndefined()
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('Bad input')
    expect(err).toBeInstanceOf(Error)
  })

  it('keeps the given status and code', () => {
    const err = new ApiError('Invalid or expired code', 409, 'ALREADY_CHECKED_IN')
    expect(err.status).toBe(409)
    expect(err.code).toBe('ALREADY_CHECKED_IN')
  })
})

describe('response helpers', () => {
  it('ok() sends 200 with the payload by default', () => {
    const res = mockRes()
    ok(res, { hello: 'world' })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ hello: 'world' })
  })

  it('ok() honours an explicit status', () => {
    const res = mockRes()
    ok(res, { queued: true }, 202)
    expect(res.status).toHaveBeenCalledWith(202)
  })

  it('created() sends 201', () => {
    const res = mockRes()
    created(res, { id: 'u1' })
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ id: 'u1' })
  })

  it('noContent() sends 204 with an empty body', () => {
    const res = mockRes()
    noContent(res)
    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.send).toHaveBeenCalledWith()
    expect(res.json).not.toHaveBeenCalled()
  })
})
