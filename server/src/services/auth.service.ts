import { Response } from 'express'
import { Role, User } from '@prisma/client'
import { userRepository } from '../repositories/user.repository'
import { signAccessToken, setAuthCookies, clearAuthCookies } from './jwt.service'
import { createRefreshToken, rotateRefreshToken, revokeAllRefreshTokens } from './refresh-token.service'
import { ApiError } from '../utils/apiResponse'
import { hashPassword, verifyPassword } from '../utils/password'
import { roleMatchesEmail } from '../utils/domain'

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
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '')
}

interface AuthUser {
  id: string
  email: string
  role: Role
  profileComplete: boolean
  mustChangePassword: boolean
}

/**
 * Issue access + refresh tokens, set HttpOnly cookies, and return the
 * redirect URL for the browser (password change on first login, profile
 * setup on first login, otherwise the role dashboard).
 */
export async function finalizeLogin(user: AuthUser, res: Response): Promise<string> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role })
  const refreshToken = await createRefreshToken(user.id)
  setAuthCookies(res, { accessToken, refreshToken })

  const target = user.mustChangePassword
    ? '/password/change'
    : user.profileComplete
      ? dashboardUrlForRole(user.role)
      : '/profile/setup'
  return `${clientUrl()}${target}`
}

/** Rotate the refresh token and re-issue access + refresh cookies. */
export async function refreshSession(rawRefreshToken: string, res: Response): Promise<void> {
  const { refreshToken, userId } = await rotateRefreshToken(rawRefreshToken)

  const user = await userRepository.findById(userId)
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

/**
 * Verify email + password and return the account for session creation.
 * Rejects wrong credentials, disabled accounts, and emails whose domain does
 * not match the account's role (students must be @stud.umu.ac.ug).
 */
export async function loginWithPassword(email: string, password: string): Promise<AuthUser> {
  const user = await userRepository.findByEmail(email.trim().toLowerCase())

  if (!user) {
    throw new ApiError('This email is not registered. Please contact system support.', 404)
  }
  if (!user.password || !(await verifyPassword(password, user.password))) {
    throw new ApiError('Invalid email or password', 401)
  }
  if (!user.isActive) {
    throw new ApiError('Account is disabled', 403)
  }
  if (!roleMatchesEmail(user.role, user.email)) {
    throw new ApiError('This email cannot sign in to this account type', 403)
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profileComplete: user.profileComplete,
    mustChangePassword: user.mustChangePassword,
  }
}

/**
 * Change the user's password. Requires the current password; once changed
 * the "must change password" flag is cleared and all other sessions are
 * revoked so the new password takes effect everywhere.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new ApiError('Password must be at least 6 characters', 400)
  }

  const user = await userRepository.findById(userId)
  if (!user) {
    throw new ApiError('Account not found', 404)
  }
  if (!user.password || !(await verifyPassword(currentPassword, user.password))) {
    throw new ApiError('Current password is incorrect', 400)
  }
  if (await verifyPassword(newPassword, user.password)) {
    throw new ApiError('New password must be different from the current one', 400)
  }

  await userRepository.update(userId, {
    password: await hashPassword(newPassword),
    mustChangePassword: false,
  })
  await revokeAllRefreshTokens(userId)
}

/** Full profile for the /auth/me endpoint. */
export async function getCurrentUser(userId: string): Promise<{
  id: string
  email: string
  fullName: string
  role: Role
  profileComplete: boolean
  hasCompletedTour: boolean
  mustChangePassword: boolean
  facultyId: string | null
  faculty: { id: string; name: string; code: string } | null
  programmeId: string | null
  programme: { id: string; name: string; code: string } | null
  year: number | null
  semester: number | null
  academicYear: string | null
  regNumber: string | null
  studentNumber: string | null
  isActive: boolean
}> {
  const user = await userRepository.findFullProfile(userId)

  if (!user) {
    throw new ApiError('Account not found', 404)
  }

  return user
}
