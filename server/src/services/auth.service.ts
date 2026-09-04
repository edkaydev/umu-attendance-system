import { Response } from 'express'
import { Role } from '@prisma/client'
import { userRepository } from '../repositories/user.repository'
import { prisma } from '../config/db'
import { signAccessToken, setAuthCookies, clearAuthCookies } from './jwt.service'
import { createRefreshToken, rotateRefreshToken, revokeAllRefreshTokens } from './refresh-token.service'
import { ApiError } from '../utils/apiResponse'
import { roleMatchesEmail } from '../utils/domain'
import { autoDetectStudentProfile, autoDetectLecturerProfile } from './profile.service'

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
    case 'NOT_SYNCHRONIZED':
      return 'not-synchronized'
    case 'ACCOUNT_DISABLED':
      return 'account-disabled'
    case 'NO_EMAIL':
      return 'no-email'
    case 'OAUTH_STATE_MISSING':
    case 'OAUTH_STATE_MISMATCH':
      return 'oauth-state'
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
}

/**
 * Issue access + refresh tokens, set HttpOnly cookies, and return the
 * redirect URL for the browser (profile setup on first login, otherwise
 * the role dashboard).
 *
 * For students and lecturers with profileComplete=false, attempts lazy
 * auto-detection from Moodle enrolments before falling back to the
 * profile setup page. This means most Moodle-synced users never see
 * the manual profile form.
 */
export async function finalizeLogin(user: AuthUser, res: Response): Promise<string> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role })
  const refreshToken = await createRefreshToken(user.id)
  setAuthCookies(res, { accessToken, refreshToken })

  let profileComplete = user.profileComplete

  // Lazy auto-detection: try to resolve the profile from Moodle data
  // before sending the user to the manual profile form.
  if (!profileComplete) {
    if (user.role === Role.student) {
      const result = await autoDetectStudentProfile(user.id)
      if (result.detected) {
        // Auto-detection resolved programme/faculty/year from enrolments.
        // Check if the student still needs to enter identity numbers
        // (regNumber, studentNumber). If so, revert profileComplete so
        // they land on /profile/setup where the path is shown read-only
        // and they just fill in the remaining fields.
        const fullUser = await userRepository.findFullProfile(user.id)
        const needsIdentityNumbers = !fullUser?.regNumber || !fullUser?.studentNumber
        if (needsIdentityNumbers) {
          await prisma.user.update({
            where: { id: user.id },
            data: { profileComplete: false },
          })
        } else {
          profileComplete = true
        }
      }
    } else if (user.role === Role.lecturer) {
      const detected = await autoDetectLecturerProfile(user.id)
      if (detected) {
        profileComplete = true
      }
    }
  }

  const target = profileComplete
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

/** Full profile for the /auth/me endpoint. */
export async function getCurrentUser(userId: string): Promise<{
  id: string
  email: string
  fullName: string
  role: Role
  profileComplete: boolean
  hasCompletedTour: boolean
  facultyId: string | null
  faculty: { id: string; name: string; code: string } | null
  lecturerFaculties: {
    facultyId: string
    isPrimary: boolean
    faculty: { id: string; name: string }
  }[]
  programmeId: string | null
  programme: { id: string; name: string; code: string } | null
  year: number | null
  semester: number | null
  academicYear: string | null
  regNumber: string | null
  studentNumber: string | null
  moodleLinked: boolean
  isActive: boolean
}> {
  const user = await userRepository.findFullProfile(userId)

  if (!user) {
    throw new ApiError('Account not found', 404)
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    profileComplete: user.profileComplete,
    hasCompletedTour: user.hasCompletedTour,
    facultyId: user.facultyId,
    faculty: user.faculty,
    lecturerFaculties: user.lecturerFaculties,
    programmeId: user.programmeId,
    programme: user.programme,
    year: user.year,
    semester: user.semester,
    academicYear: user.academicYear,
    regNumber: user.regNumber,
    studentNumber: user.studentNumber,
    moodleLinked: user.moodleUserId !== null,
    isActive: user.isActive,
  }
}
