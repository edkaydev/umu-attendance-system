import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))

vi.mock('../config/db', () => ({
  prisma: { user: { findUnique } },
}))

import { authenticate } from './auth'

const SECRET = 'test-access-secret'

const activeUser = {
  id: 'u1',
  email: 'jane@stud.umu.ac.ug',
  role: Role.student,
  profileComplete: true,
  isActive: true,
  mustChangePassword: false,
  facultyId: 'f1',
}

function tokenFor(overrides: Partial<{ sub: string; expiresIn: string; secret: string }> = {}) {
  return jwt.sign(
    { sub: overrides.sub ?? 'u1', email: activeUser.email, role: activeUser.role },
    overrides.secret ?? SECRET,
    { expiresIn: overrides.expiresIn ?? '1h' }
  )
}

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  }
  return res as unknown as Response & typeof res
}

async function run(req: Partial<Request>) {
  const res = mockRes()
  const next = vi.fn() as unknown as NextFunction
  await authenticate(req as Request, res, next)
  return { req: req as Request, res, next: next as unknown as ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = SECRET
  findUnique.mockReset()
  findUnique.mockResolvedValue(activeUser)
})

describe('authenticate', () => {
  it('rejects a request with no access_token cookie', async () => {
    const { res, next } = await run({ cookies: {}, path: '/me' })

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' })
    expect(next).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('attaches fresh user state and calls next() on a valid token', async () => {
    const { req, next } = await run({ cookies: { access_token: tokenFor() }, path: '/me' })

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toEqual({
      id: 'u1',
      email: activeUser.email,
      role: Role.student,
      profileComplete: true,
      mustChangePassword: false,
      facultyId: 'f1',
    })
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }))
  })

  it('rejects a token signed with the wrong secret', async () => {
    const { res, next } = await run({
      cookies: { access_token: tokenFor({ secret: 'other-secret' }) },
      path: '/me',
    })

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })

  it('reports an expired token with TOKEN_EXPIRED', async () => {
    const { res } = await run({
      cookies: { access_token: tokenFor({ expiresIn: '-1s' }) },
      path: '/me',
    })

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
  })

  it('rejects a token for a user that no longer exists', async () => {
    findUnique.mockResolvedValue(null)
    const { res, next } = await run({ cookies: { access_token: tokenFor() }, path: '/me' })

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Account not found or disabled' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a deactivated account mid-session', async () => {
    findUnique.mockResolvedValue({ ...activeUser, isActive: false })
    const { res } = await run({ cookies: { access_token: tokenFor() }, path: '/me' })

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Account not found or disabled' })
  })

  it('blocks non-exempt paths while a password change is pending', async () => {
    findUnique.mockResolvedValue({ ...activeUser, mustChangePassword: true })
    const { res, next } = await run({
      cookies: { access_token: tokenFor() },
      path: '/live',
    })

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: 'You must change your password before continuing',
      code: 'PASSWORD_CHANGE_REQUIRED',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['/me', '/logout', '/password'])(
    'still allows %s while a password change is pending',
    async (path) => {
      findUnique.mockResolvedValue({ ...activeUser, mustChangePassword: true })
      const { next, req } = await run({ cookies: { access_token: tokenFor() }, path })

      expect(next).toHaveBeenCalledOnce()
      expect(req.user?.mustChangePassword).toBe(true)
    }
  )

  it('rejects when the database lookup fails', async () => {
    findUnique.mockRejectedValue(new Error('db down'))
    const { res, next } = await run({ cookies: { access_token: tokenFor() }, path: '/me' })

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })
})
