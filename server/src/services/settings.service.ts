import { prisma } from '../config/db'
import { hashPassword } from '../utils/password'

export const PROFILE_EDITING_KEYS = {
  students:  'profileEditing.students',
  lecturers: 'profileEditing.lecturers',
  admins:    'profileEditing.admins',
} as const

export const CURRENT_PERIOD_KEYS = {
  academicYear: 'currentPeriod.academicYear',
  semester:     'currentPeriod.semester',
} as const

/** New local accounts use this until a System Admin sets an organisation-specific one. */
export const INITIAL_DEFAULT_USER_PASSWORD = 'Umu@2026'
export const DEFAULT_USER_PASSWORD_KEY = 'auth.defaultUserPasswordHash'

export type ProfileEditingScope = keyof typeof PROFILE_EDITING_KEYS

/** Read a system setting, falling back to a default when unset. */
export async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } })
  return row?.value ?? fallback
}

/** Upsert a system setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

/**
 * Returns a bcrypt hash suitable for a newly-created account. The plaintext
 * default is never stored in the database; only a configured bcrypt hash is.
 */
export async function getDefaultUserPasswordHash(): Promise<string> {
  const hash = await getSetting(DEFAULT_USER_PASSWORD_KEY, '')
  return hash || hashPassword(INITIAL_DEFAULT_USER_PASSWORD)
}

export async function getDefaultUserPasswordStatus(): Promise<{ configured: boolean }> {
  const hash = await getSetting(DEFAULT_USER_PASSWORD_KEY, '')
  return { configured: Boolean(hash) }
}

export async function setDefaultUserPassword(password: string): Promise<void> {
  await setSetting(DEFAULT_USER_PASSWORD_KEY, await hashPassword(password))
}

export interface ProfileEditingSettings {
  students: boolean
  lecturers: boolean
  admins: boolean
}

/** Read all three profile-editing scopes (each defaults to enabled). */
export async function getProfileEditingSettings(): Promise<ProfileEditingSettings> {
  const [students, lecturers, admins] = await Promise.all([
    getSetting(PROFILE_EDITING_KEYS.students, 'true'),
    getSetting(PROFILE_EDITING_KEYS.lecturers, 'true'),
    getSetting(PROFILE_EDITING_KEYS.admins, 'true'),
  ])
  return {
    students: students === 'true',
    lecturers: lecturers === 'true',
    admins: admins === 'true',
  }
}

/** Whether a given scope is allowed to edit (default: yes). */
export async function isProfileEditingEnabled(scope: ProfileEditingScope): Promise<boolean> {
  return (await getSetting(PROFILE_EDITING_KEYS[scope], 'true')) === 'true'
}

// ─── Current academic period ───────────────────────────────────────────────

export interface CurrentPeriod {
  academicYear: string
  semester: number
}

function defaultAcademicYear(): string {
  const now = new Date()
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}/${y + 1}`
}

/** Read the current global academic period (defaults to current year, sem 1). */
export async function getCurrentPeriod(): Promise<CurrentPeriod> {
  const [academicYear, semester] = await Promise.all([
    getSetting(CURRENT_PERIOD_KEYS.academicYear, defaultAcademicYear()),
    getSetting(CURRENT_PERIOD_KEYS.semester, '1'),
  ])
  return { academicYear, semester: Number(semester) }
}

/** Persist a new current global academic period. */
export async function setCurrentPeriod(academicYear: string, semester: number): Promise<CurrentPeriod> {
  await Promise.all([
    setSetting(CURRENT_PERIOD_KEYS.academicYear, academicYear),
    setSetting(CURRENT_PERIOD_KEYS.semester, String(semester)),
  ])
  return { academicYear, semester }
}

// ─── Support & user guide ────────────────────────────────────────────────────

export const SUPPORT_KEYS = {
  email: 'support.email',
  phone: 'support.phone',
  guide: 'userGuide.content',
} as const

export interface SupportSettings {
  email: string
  phone: string
  guide: string
}

const DEFAULT_GUIDE = `UMU ATTENDANCE SYSTEM — USER GUIDE

RULES
• Check in for every class you attend — attendance is recorded per session.
• You can only check in while a session is open and your code is still valid.
• Sharing check-in codes or checking in on behalf of someone else is a serious offence.
• Only your own attendance may ever be recorded under your name.
• Attendance below 80% triggers a warning alert; below 75% a critical alert.

BEST PRACTICES
• Keep your login details private and change your password regularly.
• Make sure your profile (campus, faculty, programme and year) is complete and up to date.
• Confirm your enrolled units each semester and report any mistakes to your Faculty Admin.
• Report missing or incorrect attendance records to your lecturer as soon as possible.

ADVICE
• Bookmark the system URL and use a stable internet connection.
• Use a supported, up-to-date browser for the best experience.
• For any issue, contact support using the details below.`

/** Read support contact details + the user guide (defaults provided). */
export async function getSupportSettings(): Promise<SupportSettings> {
  const [email, phone, guide] = await Promise.all([
    getSetting(SUPPORT_KEYS.email, 'support@umu.ac.ug'),
    getSetting(SUPPORT_KEYS.phone, ''),
    getSetting(SUPPORT_KEYS.guide, DEFAULT_GUIDE),
  ])
  return { email, phone, guide }
}

/** Upsert support contact details + the user guide (System Admin only). */
export async function setSupportSettings(
  data: { email?: string; phone?: string; guide?: string }
): Promise<SupportSettings> {
  if (data.email !== undefined) await setSetting(SUPPORT_KEYS.email, data.email)
  if (data.phone !== undefined) await setSetting(SUPPORT_KEYS.phone, data.phone)
  if (data.guide !== undefined) await setSetting(SUPPORT_KEYS.guide, data.guide)
  return getSupportSettings()
}
