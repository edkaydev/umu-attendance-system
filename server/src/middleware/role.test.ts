import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { Role } from '@prisma/client'
import { requireCompleteProfile, requireRole } from './role'

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  }
  return res as unknown as Response & typeof res
}

function reqWithUser(user?: Partial<Express.User>): Request {
  return { user } as unknown as Request
}

const next = (): NextFunction => vi.fn() as unknown as NextFunction

describe('requireRole', () => {
  it('rejects unauthenticated requests with 401', () => {
    const res = mockRes()
    const nxt = next()
    requireRole(Role.lecturer)(reqWithUser(undefined), res, nxt)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' })
    expect(nxt).not.toHaveBeenCalled()
  })

  it('calls next() when the role is allowed', () => {
    const res = mockRes()
    const nxt = next()
    requireRole(Role.lecturer, Role.faculty_admin)(reqWithUser({ role: Role.faculty_admin }), res, nxt)

    expect(nxt).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a disallowed role with 403 and lists the accepted roles', () => {
    const res = mockRes()
    const nxt = next()
    requireRole(Role.lecturer, Role.faculty_admin)(reqWithUser({ role: Role.student }), res, nxt)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'This action requires one of: lecturer, faculty_admin',
    })
    expect(nxt).not.toHaveBeenCalled()
  })
})

describe('requireCompleteProfile', () => {
  it('rejects unauthenticated requests with 401', () => {
    const res = mockRes()
    const nxt = next()
    requireCompleteProfile(reqWithUser(undefined), res, nxt)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(nxt).not.toHaveBeenCalled()
  })

  it('lets system admins through without a profile', () => {
    const res = mockRes()
    const nxt = next()
    requireCompleteProfile(
      reqWithUser({ role: Role.system_admin, profileComplete: false }),
      res,
      nxt
    )

    expect(nxt).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('blocks incomplete profiles with PROFILE_INCOMPLETE', () => {
    const res = mockRes()
    const nxt = next()
    requireCompleteProfile(reqWithUser({ role: Role.student, profileComplete: false }), res, nxt)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PROFILE_INCOMPLETE' })
    )
    expect(nxt).not.toHaveBeenCalled()
  })

  it('lets a completed profile through', () => {
    const res = mockRes()
    const nxt = next()
    requireCompleteProfile(reqWithUser({ role: Role.student, profileComplete: true }), res, nxt)

    expect(nxt).toHaveBeenCalledOnce()
  })
})
