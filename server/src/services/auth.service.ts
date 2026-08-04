import { Response } from 'express'
import { Role, User } from '@prisma/client'
import { prisma } from '../config/db'
import { signAccessToken, setAuthCookies, clearAuthCookies } from './jwt.service'
import { createRefreshToken, rotateRefreshToken, revokeAllRefreshTokens } from './refresh-token.service'
import { ApiError } from '../utils/apiResponse'

const DASHBOARD_BY_ROLE: Record<Role, string> = {
  student: '/student',
  lecturer: '/lecturer',
  faculty_admin: '/faculty-admin',
  system_admin: '/system-admin',
}

export function dashboardUrlForRole(role: Role): string {
  return DASHBOARD_BY_ROLE[role] ?? '/login'
}

/** Map passport strategy errors to a short URL-safe reason. */
export function mapOAuthError(message: string): string {
  switch (message) {
    case 'INVALID_DOMAIN':
      return 'invalid-domain'
    case 'NOT_REGISTERED':
      return 'not-registered'
    case 'ACCOUNT_DISABLED':
      return 'account-disabled'
    case 'No email returned from Google':
      return 'no-email'
    default:
      return 'error'
  }
}

function clientUrl(): string {
  return process.env.CLIENT_URL || 'http://localhost:5173'
}

/**
 * Issue access + refresh tokens, set HttpOnly cookies, and return the
 * redirect URL for the browser (profile setup on first login, otherwise
 * the role dashboard).
 */
export async function finalizeLogin(user: User, res: Response): Promise<string> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role })
  const refreshToken = await createRefreshToken(user.id)
  setAuthCookies(res, { accessToken, refreshToken })

  const target = user.profileComplete ? dashboardUrlForRole(user.role) : '/profile/setup'
  return `${clientUrl()}${target}`
}

/** Rotate the refresh token and re-issue access + refresh cookies. */
export async function refreshSession(rawRefreshToken: string, res: Response): Promise<void> {
  const { refreshToken, userId } = await rotateRefreshToken(rawRefreshToken)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new ApiError('Account not found', 401)
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role })
  setAuthCookies(res, { accessToken, refreshToken })
}

/** Revoke refresh tokens and clear cookies. */
export async function logoutSession(userId: string, res: Response): Promise<void> {
  await revokeAllRefreshTokens(userId)
  clearAuthCookies(res)
}

/** Full profile for the /auth/me endpoint. */
export async function getCurrentUser(userId: string): Promise<{
  id: string
  email: string
  fullName: string
  role: Role
  profileComplete: boolean
  facultyId: string | null
  faculty: { id: string; name: string; code: string } | null
  programmeId: string | null
  programme: { id: string; name: string; code: string } | null
  year: number | null
  semester: number | null
  academicYear: string | null
  regNumber: string | null
  isActive: boolean
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      profileComplete: true,
      facultyId: true,
      faculty: { select: { id: true, name: true, code: true } },
      programmeId: true,
      programme: { select: { id: true, name: true, code: true } },
      year: true,
      semester: true,
      academicYear: true,
      regNumber: true,
      isActive: true,
    },
  })

  if (!user) {
    throw new ApiError('Account not found', 404)
  }

  return user
}
