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

// ─── End-of-semester database reset ─────────────────────────────────────────

export interface ResetDatabaseResult {
  deletedAttendanceEdits: number
  deletedAttendanceRecords: number
  deletedSessions: number
  deletedEnrollments: number
  deletedAssignments: number
  deletedAlerts: number
  deletedCurriculumUnits: number
  deletedCourseUnitFaculties: number
  deletedCourseUnits: number
  deletedProgrammes: number
  deletedFaculties: number
  deletedUsers: number
  deletedRefreshTokens: number
  deletedAuditLogs: number
}

/**
 * End-of-semester full database wipe.
 *
 * Deletes ALL transactional and academic data in the correct FK order.
 * System Admin accounts (role = system_admin) and system settings are KEPT
 * so the admin can still log in and reconfigure for the next semester.
 *
 * @param actorId  The system_admin user performing the reset (never deleted).
 */
export async function resetDatabase(actorId: string): Promise<ResetDatabaseResult> {
  // Run everything in a transaction so it's all-or-nothing
  return prisma.$transaction(async (tx) => {
    // 1. Attendance edits (FK → attendance_records)
    const { count: deletedAttendanceEdits } = await tx.attendanceEdit.deleteMany({})

    // 2. Attendance records (FK → sessions, users)
    const { count: deletedAttendanceRecords } = await tx.attendanceRecord.deleteMany({})

    // 3. Sessions (FK → course_units, users)
    const { count: deletedSessions } = await tx.session.deleteMany({})

    // 4. Enrollments (FK → users, course_units)
    const { count: deletedEnrollments } = await tx.enrollment.deleteMany({})

    // 5. Lecturer assignments (FK → users, course_units)
    const { count: deletedAssignments } = await tx.lecturerAssignment.deleteMany({})

    // 6. Attendance alerts (FK → users, course_units)
    const { count: deletedAlerts } = await tx.attendanceAlert.deleteMany({})

    // 7. Curriculum units (FK → course_units, programmes)
    const { count: deletedCurriculumUnits } = await tx.curriculumUnit.deleteMany({})

    // 8. Course-unit ↔ faculty sharing links (FK → course_units, faculties)
    const { count: deletedCourseUnitFaculties } = await tx.courseUnitFaculty.deleteMany({})

    // 9. Course units (FK → faculties)
    const { count: deletedCourseUnits } = await tx.courseUnit.deleteMany({})

    // 10. Programmes (FK → faculties)
    const { count: deletedProgrammes } = await tx.programme.deleteMany({})

    // 11. Non-system-admin users — refresh tokens + audit logs first to free FKs
    const nonAdminUserIds = await tx.user.findMany({
      where: { role: { not: 'system_admin' } },
      select: { id: true },
    })
    const ids = nonAdminUserIds.map((u) => u.id)

    const { count: deletedRefreshTokens } = await tx.refreshToken.deleteMany({
      where: { userId: { in: ids } },
    })
    const { count: deletedAuditLogs } = await tx.auditLog.deleteMany({
      where: { userId: { in: ids } },
    })
    const { count: deletedUsers } = await tx.user.deleteMany({
      where: { role: { not: 'system_admin' } },
    })

    // 12. Faculties (safe now — all FK children gone)
    const { count: deletedFaculties } = await tx.faculty.deleteMany({})

    return {
      deletedAttendanceEdits,
      deletedAttendanceRecords,
      deletedSessions,
      deletedEnrollments,
      deletedAssignments,
      deletedAlerts,
      deletedCurriculumUnits,
      deletedCourseUnitFaculties,
      deletedCourseUnits,
      deletedProgrammes,
      deletedFaculties,
      deletedUsers,
      deletedRefreshTokens,
      deletedAuditLogs,
    }
  }, { timeout: 60000 }) // allow up to 60 s for large datasets
}
