import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import jwt from 'jsonwebtoken'
import { Role } from '@prisma/client'
import {
  authCookieNames,
  clearAuthCookies,
  generateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from './jwt.service'

const ORIGINAL_ENV = { ...process.env }

type CookieOptions = { httpOnly: boolean; secure: boolean; path: string; maxAge?: number }

interface CookieSpies {
  cookie: ReturnType<typeof vi.fn<(name: string, value: string, options: CookieOptions) => void>>
  clearCookie: ReturnType<typeof vi.fn<(name: string, options: CookieOptions) => void>>
}

function mockRes() {
  const res: CookieSpies = { cookie: vi.fn(), clearCookie: vi.fn() }
  return res as unknown as Response & CookieSpies
}

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret'
  delete process.env.JWT_ACCESS_EXPIRES_IN
  delete process.env.JWT_REFRESH_EXPIRES_IN
  process.env.NODE_ENV = 'test'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('signAccessToken', () => {
  const payload = { sub: 'u1', email: 'jane@stud.umu.ac.ug', role: Role.student }

  it('signs a verifiable token carrying the identity claims', () => {
    const decoded = jwt.verify(signAccessToken(payload), 'test-access-secret') as Record<
      string,
      unknown
    >

    expect(decoded).toMatchObject(payload)
    expect(decoded.exp).toBeTypeOf('number')
  })

  it('expires in one hour by default', () => {
    const decoded = jwt.verify(signAccessToken(payload), 'test-access-secret') as {
      iat: number
      exp: number
    }

    expect(decoded.exp - decoded.iat).toBe(3600)
  })

  it('honours JWT_ACCESS_EXPIRES_IN', () => {
    process.env.JWT_ACCESS_EXPIRES_IN = '15m'
    const decoded = jwt.verify(signAccessToken(payload), 'test-access-secret') as {
      iat: number
      exp: number
    }

    expect(decoded.exp - decoded.iat).toBe(900)
  })

  it('cannot be verified with another secret', () => {
    const token = signAccessToken(payload)
    expect(() => jwt.verify(token, 'other-secret')).toThrow()
  })
})

describe('generateRefreshToken', () => {
  it('returns 96 hex characters (48 random bytes)', () => {
    const token = generateRefreshToken()
    expect(token).toMatch(/^[0-9a-f]{96}$/)
  })

  it('never repeats itself', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateRefreshToken))
    expect(tokens.size).toBe(50)
  })
})

describe('setAuthCookies', () => {
  it('sets both HttpOnly cookies with the default lifetimes', () => {
    const res = mockRes()
    setAuthCookies(res, { accessToken: 'access', refreshToken: 'refresh' })

    expect(res.cookie).toHaveBeenCalledWith(
      authCookieNames.access,
      'access',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3_600_000 })
    )
    expect(res.cookie).toHaveBeenCalledWith(
      authCookieNames.refresh,
      'refresh',
      expect.objectContaining({ httpOnly: true, maxAge: 7 * 86_400_000 })
    )
  })

  it('marks cookies secure only in production', () => {
    const dev = mockRes()
    setAuthCookies(dev, { accessToken: 'a', refreshToken: 'r' })
    expect(dev.cookie.mock.calls[0][2]).toMatchObject({ secure: false })

    process.env.NODE_ENV = 'production'
    const prod = mockRes()
    setAuthCookies(prod, { accessToken: 'a', refreshToken: 'r' })
    expect(prod.cookie.mock.calls[0][2]).toMatchObject({ secure: true })
  })

  it.each([
    ['30s', 30_000],
    ['30m', 1_800_000],
    ['2h', 7_200_000],
    ['3d', 259_200_000],
  ])('converts a %s lifetime into maxAge %i ms', (expiresIn, expected) => {
    process.env.JWT_ACCESS_EXPIRES_IN = expiresIn
    const res = mockRes()
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' })

    expect(res.cookie.mock.calls[0][2]).toMatchObject({ maxAge: expected })
  })

  it('falls back to one hour for an unparseable lifetime', () => {
    process.env.JWT_ACCESS_EXPIRES_IN = 'forever'
    const res = mockRes()
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' })

    expect(res.cookie.mock.calls[0][2]).toMatchObject({ maxAge: 3_600_000 })
  })
})

describe('clearAuthCookies', () => {
  it('clears both cookies without a maxAge', () => {
    const res = mockRes()
    clearAuthCookies(res)

    expect(res.clearCookie).toHaveBeenCalledTimes(2)
    for (const [name, options] of res.clearCookie.mock.calls) {
      expect([authCookieNames.access, authCookieNames.refresh]).toContain(name)
      expect(options).toMatchObject({ httpOnly: true, path: '/' })
      expect(options.maxAge).toBeUndefined()
    }
  })
})
