import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import { ApiError } from '../utils/apiResponse'

const { db } = vi.hoisted(() => ({
  db: {
    refreshToken: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('../config/db', () => ({ prisma: db }))

import {
  createRefreshToken,
  hashToken,
  revokeAllRefreshTokens,
  rotateRefreshToken,
} from './refresh-token.service'

const ORIGINAL_ENV = { ...process.env }

function activeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    userId: 'u1',
    revoked: false,
    expiresAt: new Date(Date.now() + 86_400_000),
    user: { isActive: true },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.JWT_REFRESH_EXPIRES_IN
  db.refreshToken.create.mockResolvedValue({ id: 'rt-2' })
  db.refreshToken.update.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.findFirst.mockResolvedValue(activeRow())
  db.$transaction.mockResolvedValue([])
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.useRealTimers()
})

describe('hashToken', () => {
  it('is a stable sha256 hex digest', () => {
    expect(hashToken('abc')).toBe(crypto.createHash('sha256').update('abc').digest('hex'))
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abd')).not.toBe(hashToken('abc'))
  })
})

describe('createRefreshToken', () => {
  it('stores only the hash and returns the raw token', async () => {
    const raw = await createRefreshToken('u1')

    expect(raw).toMatch(/^[0-9a-f]{96}$/)
    const data = db.refreshToken.create.mock.calls[0][0].data
    expect(data.userId).toBe('u1')
    expect(data.tokenHash).toBe(hashToken(raw))
    expect(data.tokenHash).not.toContain(raw)
  })

  it('expires seven days out by default', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))

    await createRefreshToken('u1')

    expect(db.refreshToken.create.mock.calls[0][0].data.expiresAt).toEqual(
      new Date('2025-01-08T00:00:00Z')
    )
  })

  it.each([
    ['30s', 30_000],
    ['45m', 2_700_000],
    ['12h', 43_200_000],
    ['2d', 172_800_000],
    ['nonsense', 7 * 86_400_000],
  ])('derives the TTL from JWT_REFRESH_EXPIRES_IN=%s', async (value, expectedMs) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    process.env.JWT_REFRESH_EXPIRES_IN = value

    await createRefreshToken('u1')

    expect(db.refreshToken.create.mock.calls[0][0].data.expiresAt).toEqual(
      new Date(Date.parse('2025-01-01T00:00:00Z') + expectedMs)
    )
  })
})

describe('rotateRefreshToken', () => {
  it('revokes the presented token and issues a new one in one transaction', async () => {
    const result = await rotateRefreshToken('raw-token')

    expect(result.userId).toBe('u1')
    expect(result.refreshToken).toMatch(/^[0-9a-f]{96}$/)
    expect(db.refreshToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken('raw-token') } })
    )
    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(db.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revoked: true },
    })
    expect(db.refreshToken.create.mock.calls[0][0].data.tokenHash).toBe(
      hashToken(result.refreshToken)
    )
  })

  it.each([
    ['an empty token', '', undefined, 'Missing refresh token'],
    ['an unknown token', 'raw-token', null, 'Invalid refresh token'],
  ])('rejects %s', async (_label, raw, row, message) => {
    if (row !== undefined) db.refreshToken.findFirst.mockResolvedValue(row)

    await expect(rotateRefreshToken(raw)).rejects.toThrow(message)
    await expect(rotateRefreshToken(raw)).rejects.toBeInstanceOf(ApiError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an already revoked token (reuse detection)', async () => {
    db.refreshToken.findFirst.mockResolvedValue(activeRow({ revoked: true }))

    await expect(rotateRefreshToken('raw-token')).rejects.toThrow('Invalid refresh token')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an expired token', async () => {
    db.refreshToken.findFirst.mockResolvedValue(
      activeRow({ expiresAt: new Date(Date.now() - 1000) })
    )

    await expect(rotateRefreshToken('raw-token')).rejects.toThrow('Refresh token expired')
  })

  it('rejects a token belonging to a disabled account', async () => {
    db.refreshToken.findFirst.mockResolvedValue(activeRow({ user: { isActive: false } }))

    await expect(rotateRefreshToken('raw-token')).rejects.toThrow('Account not found or disabled')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('surfaces a 401 status on every rejection', async () => {
    db.refreshToken.findFirst.mockResolvedValue(null)

    await rotateRefreshToken('raw-token').catch((err: ApiError) => {
      expect(err.status).toBe(401)
    })
  })
})

describe('revokeAllRefreshTokens', () => {
  it('revokes only the user\u2019s still-active tokens', async () => {
    await revokeAllRefreshTokens('u1')

    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true },
    })
  })
})
