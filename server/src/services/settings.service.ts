import { prisma } from '../config/db'

export const PROFILE_EDITING_KEYS = {
  students:  'profileEditing.students',
  lecturers: 'profileEditing.lecturers',
  admins:    'profileEditing.admins',
} as const

export const CURRENT_PERIOD_KEYS = {
  academicYear: 'currentPeriod.academicYear',
  semester:     'currentPeriod.semester',
} as const

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
