import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { Response } from 'express'
import { Role } from '@prisma/client'

export interface AccessTokenPayload {
  sub: string
  email: string
  role: Role
}

const ACCESS_COOKIE = 'access_token'
const REFRESH_COOKIE = 'refresh_token'

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  }
}

/** Sign an access JWT (1 hour default). */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  })
}

/** Generate a random opaque refresh token (unpredictable, stored hashed). */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex')
}

/** Set both HttpOnly cookies on the response. */
export function setAuthCookies(
  res: Response,
  { accessToken, refreshToken }: { accessToken: string; refreshToken: string }
): void {
  const accessMaxAge = msFromEnv(process.env.JWT_ACCESS_EXPIRES_IN, '1h')
  const refreshMaxAge = msFromEnv(process.env.JWT_REFRESH_EXPIRES_IN, '7d')

  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(accessMaxAge))
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(refreshMaxAge))
}

/** Clear both HttpOnly cookies (logout). */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(0), maxAge: undefined })
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(0), maxAge: undefined })
}

export const authCookieNames = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
}

/** Parse a relative expires-in string ("1h", "7d", "30m") into milliseconds. */
function msFromEnv(value: string | undefined, fallback: string): number {
  const v = value || fallback
  const match = /^(\d+)([smhd])$/.exec(v.trim())
  if (!match) return 60 * 60 * 1000 // default 1h
  const n = Number(match[1])
  const unit = match[2]
  const ms =
    unit === 's' ? n * 1000 : unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3600_000 : n * 86400_000
  return ms
}
