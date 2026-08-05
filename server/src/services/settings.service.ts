import { prisma } from '../config/db'

export const PROFILE_EDITING_KEY = 'profileEditingEnabled'

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

/** Whether users are allowed to edit their own profiles (default: yes). */
export async function isProfileEditingEnabled(): Promise<boolean> {
  return (await getSetting(PROFILE_EDITING_KEY, 'true')) === 'true'
}
