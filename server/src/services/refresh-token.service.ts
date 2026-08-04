import crypto from 'crypto'
import { prisma } from '../config/db'
import { generateRefreshToken } from './jwt.service'
import { ApiError } from '../utils/apiResponse'

const REFRESH_TTL_DAYS = 7

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Create a refresh token row for a user, returning the raw token. */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
    },
  })
  return token
}

/**
 * Rotate a refresh token: validate the raw token, revoke it,
 * and issue a fresh one. Returns { refreshToken, userId }.
 */
export async function rotateRefreshToken(rawToken: string): Promise<{
  refreshToken: string
  userId: string
}> {
  if (!rawToken) {
    throw new ApiError('Missing refresh token', 401)
  }

  const tokenHash = hashToken(rawToken)
  const existing = await prisma.refreshToken.findFirst({
    where: { tokenHash },
    include: { user: true },
  })

  if (!existing || existing.revoked) {
    throw new ApiError('Invalid refresh token', 401)
  }

  if (existing.expiresAt < new Date()) {
    throw new ApiError('Refresh token expired', 401)
  }

  if (!existing.user.isActive) {
    throw new ApiError('Account not found or disabled', 401)
  }

  // Revoke the old token and issue a new one (rotation)
  const refreshToken = generateRefreshToken()
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revoked: true },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
      },
    }),
  ])

  return { refreshToken, userId: existing.userId }
}

/** Revoke all active refresh tokens for a user (logout). */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  })
}

export { hashToken }
