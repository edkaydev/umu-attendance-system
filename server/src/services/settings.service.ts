import { prisma } from '../config/db'

export const PROFILE_EDITING_KEYS = {
  students:  'profileEditing.students',
  lecturers: 'profileEditing.lecturers',
  admins:    'profileEditing.admins',
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
