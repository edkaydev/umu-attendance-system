/**
 * Moodle → Attendance synchronisation service.
 *
 * Implements a one-way, read-only (from Moodle's perspective) sync:
 *   Fetch from Moodle → validate → normalise → map → upsert Attendance records
 *
 * Design invariants
 * -----------------
 * 1. IDEMPOTENT — running the sync twice produces the same result as running
 *    it once. Every write uses upsert or findFirst-then-create patterns.
 *
 * 2. NON-DESTRUCTIVE — historical attendance data is never modified.
 *    Enrollment rows for prior academic periods are never touched.
 *    When a student is unenrolled in Moodle for the *current* period, their
 *    Enrollment row for that period is removed but ALL historical records
 *    (AttendanceRecord, Session, ExcuseRequest, AttendanceEdit, AttendanceAlert,
 *    AuditLog) remain intact because they reference Session rows, not Enrollment.
 *
 * 3. OBSERVABLE — every run writes a SyncRun row with stats and any errors.
 *
 * 4. SCOPED — enrollment reconciliation is strictly scoped to the current
 *    academic period (year + semester) from system settings. Prior periods
 *    are read-only.
 *
 * 5. SAFE LOGGING — the Moodle token is never written to logs. Internal
 *    Moodle error details are logged in dev only.
 *
 * Identity matching order for users:
 *   1. moodleUserId (exact, authoritative once set)
 *   2. idnumber / regNumber (Moodle idnumber → Attendance regNumber)
 *   3. email (controlled fallback during migration — logged as a warning)
 * No silent account merging. Collisions are recorded as conflicts.
 *
 * Role mapping:
 *   Moodle "student"                     → Role.student
 *   Moodle "editingteacher" / "teacher"  → Role.lecturer
 *   Moodle "manager" / "coursecreator"   → skipped (never synced)
 */

import { Role } from '@prisma/client'
import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { fetchSiteInfo } from '../integrations/moodle/moodle.users'
import { fetchAllCourses } from '../integrations/moodle/moodle.courses'
import { fetchEnrolledUsers } from '../integrations/moodle/moodle.enrolments'
import { isMoodleConfigured } from '../config/moodle'
import { getCurrentPeriod, getMoodleCurrentPeriodConfig } from './settings.service'
import { writeAuditLog } from '../utils/audit'
import { syncAcademicHierarchy } from './moodle-hierarchy-sync.service'
import { publish } from './events.service'

const MAX_LECTURER_FACULTIES = 3

// ─── Stats tracking ───────────────────────────────────────────────────────────

export interface SyncStats {
  fetched: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  conflicts: number
  errors: number
}

function emptySyncStats(): SyncStats {
  return { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 }
}

// ─── Moodle role shorthands used by UMU ───────────────────────────────────────

const STUDENT_ROLES = new Set(['student'])
const LECTURER_ROLES = new Set(['editingteacher', 'teacher'])
const SKIP_ROLES = new Set(['manager', 'coursecreator', 'coursecreatoradmin'])

function moodleRoleToAttendance(roleShortnames: string[]): Role | null {
  for (const r of roleShortnames) {
    if (STUDENT_ROLES.has(r)) return Role.student
    if (LECTURER_ROLES.has(r)) return Role.lecturer
  }
  return null
}

// ─── Connection test ──────────────────────────────────────────────────────────

/**
 * Verify the Moodle connection and return safe site info.
 * Does NOT write anything to the Attendance database.
 */
export async function testMoodleConnection(): Promise<{
  configured: boolean
  siteName?: string
  siteUrl?: string
  release?: string
  serviceUsername?: string
  availableFunctions?: string[]
}> {
  if (!isMoodleConfigured()) {
    return { configured: false }
  }

  const info = await fetchSiteInfo()
  return { configured: true, ...info }
}

// ─── Last sync status ─────────────────────────────────────────────────────────

/** Return the most recent SyncRun for each entity, or null if none. */
export async function getLastSyncStatus(): Promise<{
  lastRun: {
    id: string
    startedAt: Date
    completedAt: Date | null
    status: string
    entity: string
    stats: unknown
    errorSummary: string | null
    durationMs: number | null
  } | null
}> {
  const lastRun = await prisma.syncRun.findFirst({
    orderBy: { startedAt: 'desc' },
  })
  return { lastRun }
}

// ─── Full synchronisation orchestrator ───────────────────────────────────────

export interface FullSyncResult {
  hierarchy: SyncStats
  users: SyncStats
  courses: SyncStats
  enrolments: SyncStats
  autoAssigned: {
    lecturerFaculties: SyncStats
    studentProgrammes: SyncStats
  }
  durationMs: number
  warnings: string[]
}

/**
 * Run a full Moodle → Attendance sync.
 * Order: courses first (need moodleCourseId), then users, then enrolments.
 *
 * @param actorId  The Attendance user ID triggering the sync (for audit trail).
 */
export async function runFullSync(actorId: string): Promise<FullSyncResult> {
  if (!isMoodleConfigured()) {
    throw new ApiError(
      'Moodle integration is not configured. Set MOODLE_BASE_URL and MOODLE_WS_TOKEN.',
      503,
      'MOODLE_NOT_CONFIGURED'
    )
  }

  const startedAt = Date.now()
  const warnings: string[] = []

  const syncRunId = (await prisma.syncRun.create({
    data: { status: 'running', entity: 'full' },
  })).id

  let hierarchyStats = emptySyncStats()
  let courseStats = emptySyncStats()
  let userStats = emptySyncStats()
  let enrolmentStats = emptySyncStats()
  let lecturerFacultyStats = emptySyncStats()
  let studentProgrammeStats = emptySyncStats()
  let overallStatus = 'success'
  let errorSummary: string | null = null

  try {
    // 0. Academic hierarchy (Phase 2 — mirrors Moodle category tree + courses)
    const hierarchyResult = await syncAcademicHierarchy()
    hierarchyStats = hierarchyResult.stats.hierarchy
    courseStats = hierarchyResult.stats.courses
    warnings.push(...hierarchyResult.warnings)

    // 1. Legacy course sync (shortname→code matching, runs for backward compatibility;
    //    skipped for courses already mapped by the hierarchy sync above)
    const courseResult = await syncCourses(hierarchyResult.moodleCourseIds)
    // Merge legacy course stats into hierarchy course stats
    courseStats.fetched += courseResult.stats.fetched
    courseStats.created += courseResult.stats.created
    courseStats.updated += courseResult.stats.updated
    courseStats.unchanged += courseResult.stats.unchanged
    courseStats.skipped += courseResult.stats.skipped
    courseStats.conflicts += courseResult.stats.conflicts
    courseStats.errors += courseResult.stats.errors
    // Combine mapped IDs: hierarchy-mapped + legacy-mapped
    const allMoodleCourseIds = [...new Set([...hierarchyResult.moodleCourseIds, ...courseResult.moodleCourseIds])]
    warnings.push(...courseResult.warnings)

    // 2. Users (derived from enrolment roster — avoids fetching all Moodle users)
    const userResult = await syncUsersFromEnrolments(allMoodleCourseIds, warnings)
    userStats = userResult.stats

    // 3. Enrolments
    const enrolResult = await syncEnrolments(allMoodleCourseIds, warnings)
    enrolmentStats = enrolResult.stats

    // 4. Auto-assign lecturer faculties from course assignments (Phase 3)
    const lecturerResult = await autoAssignLecturerFaculties(warnings)
    lecturerFacultyStats = lecturerResult

    // 5. Auto-assign student programmes from enrolments (Phase 3)
    const studentResult = await autoAssignStudentProgramme(warnings)
    studentProgrammeStats = studentResult

    if (
      hierarchyStats.errors + courseStats.errors + userStats.errors + enrolmentStats.errors +
      lecturerFacultyStats.errors + studentProgrammeStats.errors > 0 ||
      hierarchyStats.conflicts + courseStats.conflicts + userStats.conflicts + enrolmentStats.conflicts > 0
    ) {
      overallStatus = 'partial'
    }
  } catch (err) {
    overallStatus = 'failed'
    errorSummary = err instanceof Error ? err.message : 'Unknown error'
    console.error('[moodle-sync] full sync failed:', errorSummary)
  }

  const durationMs = Date.now() - startedAt

  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: {
      completedAt: new Date(),
      status: overallStatus,
      durationMs,
      stats: {
        hierarchy: hierarchyStats,
        users: userStats,
        courses: courseStats,
        enrolments: enrolmentStats,
        autoAssigned: { lecturerFaculties: lecturerFacultyStats, studentProgrammes: studentProgrammeStats },
      } as unknown as import('@prisma/client').Prisma.JsonObject,
      errorSummary,
    },
  })

  // Write audit log entry (no secrets — just counts)
  await writeAuditLog(actorId, 'MOODLE_SYNC', 'sync_run', syncRunId, {
    status: overallStatus,
    durationMs,
    hierarchy: hierarchyStats,
    users: userStats,
    courses: courseStats,
    enrolments: enrolmentStats,
    autoAssigned: { lecturerFaculties: lecturerFacultyStats, studentProgrammes: studentProgrammeStats },
  }).catch((e) => console.error('[moodle-sync] audit log write failed:', e.message))

  // Notify connected clients so their dashboards refresh immediately.
  // users-changed  → FA dashboard people list, FacultyUnits user list
  // enrollments-changed → student dashboards, lecturer dashboards, FacultyUnits matrix
  // curriculum-changed  → FA FacultyUnits Course Matrix tab
  // assignments-changed → lecturer dashboard unit list
  publish('users-changed')
  publish('enrollments-changed')
  publish('curriculum-changed')
  publish('assignments-changed')

  return {
    hierarchy: hierarchyStats,
    users: userStats,
    courses: courseStats,
    enrolments: enrolmentStats,
    autoAssigned: { lecturerFaculties: lecturerFacultyStats, studentProgrammes: studentProgrammeStats },
    durationMs,
    warnings,
  }
}

// ─── Course sync ──────────────────────────────────────────────────────────────

interface CourseSyncResult {
  stats: SyncStats
  /** Moodle course IDs that were successfully mapped to a CourseUnit */
  moodleCourseIds: number[]
  warnings: string[]
}

/**
 * Sync Moodle courses → Attendance CourseUnit.moodleCourseId.
 *
 * Matching: Moodle course.shortname (case-insensitive) → CourseUnit.code
 * Sets moodleCourseId on the matched CourseUnit. Does NOT create new
 * CourseUnits — academic structure is managed in Attendance by admins.
 *
 * Courses already mapped by the hierarchy sync (in alreadyMappedIds) are
 * skipped to avoid redundant work.
 */
async function syncCourses(alreadyMappedIds: number[] = []): Promise<CourseSyncResult> {
  const stats = emptySyncStats()
  const mappedIds: number[] = []
  const warnings: string[] = []
  const skipSet = new Set(alreadyMappedIds)

  const moodleCourses = await fetchAllCourses()
  stats.fetched = moodleCourses.length

  for (const mc of moodleCourses) {
    try {
      // Skip courses already mapped by the hierarchy sync
      if (skipSet.has(mc.id)) {
        stats.unchanged++
        mappedIds.push(mc.id)
        continue
      }

      const codeNorm = mc.shortname.trim().toUpperCase()

      // Find a matching CourseUnit by code (case-insensitive)
      const unit = await prisma.courseUnit.findFirst({
        where: { code: { equals: codeNorm } },
      })

      if (!unit) {
        stats.skipped++
        continue
      }

      // Check if another CourseUnit already holds this moodleCourseId
      if (unit.moodleCourseId !== null && Number(unit.moodleCourseId) !== mc.id) {
        const conflict = `CourseUnit ${unit.code} already has moodleCourseId=${unit.moodleCourseId}, Moodle returned id=${mc.id}`
        warnings.push(conflict)
        console.error(`[moodle-sync] course conflict: ${conflict}`)
        stats.conflicts++
        continue
      }

      if (unit.moodleCourseId !== null) {
        stats.unchanged++
        mappedIds.push(mc.id)
        continue
      }

      await prisma.courseUnit.update({
        where: { id: unit.id },
        data: { moodleCourseId: BigInt(mc.id) },
      })
      stats.updated++
      mappedIds.push(mc.id)
    } catch (err) {
      stats.errors++
      console.error(`[moodle-sync] course error for shortname "${mc.shortname}":`, (err as Error).message)
    }
  }

  return { stats, moodleCourseIds: mappedIds, warnings }
}

// ─── User sync (from enrolment roster) ───────────────────────────────────────

interface UserSyncResult {
  stats: SyncStats
  /** Map of moodleUserId → Attendance userId for use in enrolment sync */
  moodleToAttendanceUserId: Map<number, string>
}

/**
 * Discover and sync Moodle users by fetching the roster of each mapped course.
 * Uses identity matching order: moodleUserId → idnumber/regNumber → email.
 */
async function syncUsersFromEnrolments(
  moodleCourseIds: number[],
  warnings: string[]
): Promise<UserSyncResult> {
  const stats = emptySyncStats()
  const moodleToAttendance = new Map<number, string>()

  if (moodleCourseIds.length === 0) return { stats, moodleToAttendanceUserId: moodleToAttendance }

  // Collect unique Moodle users across all course rosters
  const seenMoodleIds = new Set<number>()

  for (const moodleCourseId of moodleCourseIds) {
    let enrolledUsers
    try {
      enrolledUsers = await fetchEnrolledUsers(moodleCourseId)
    } catch (err) {
      stats.errors++
      console.error(`[moodle-sync] failed to fetch enrolled users for course ${moodleCourseId}:`, (err as Error).message)
      continue
    }

    for (const mu of enrolledUsers) {
      if (seenMoodleIds.has(mu.id)) continue
      seenMoodleIds.add(mu.id)
      stats.fetched++

      // Determine role from course-context roles
      const roleShortnames = (mu.roles ?? []).map((r) => r.shortname)
      const hasSkipRole = roleShortnames.some((r) => SKIP_ROLES.has(r))
      if (hasSkipRole) {
        stats.skipped++
        continue
      }

      const attendanceRole = moodleRoleToAttendance(roleShortnames)
      if (attendanceRole === null) {
        stats.skipped++
        continue
      }

      try {
        const attendanceUserId = await upsertMoodleUser(mu, attendanceRole, warnings, stats)
        if (attendanceUserId) {
          moodleToAttendance.set(mu.id, attendanceUserId)
        }
      } catch (err) {
        stats.errors++
        console.error(`[moodle-sync] user upsert error for moodle id ${mu.id}:`, (err as Error).message)
      }
    }
  }

  return { stats, moodleToAttendanceUserId: moodleToAttendance }
}

/**
 * Resolve or create an Attendance User for a Moodle enrolled user.
 * Returns the Attendance user ID, or null if the user should be skipped.
 *
 * Identity matching order:
 *   1. moodleUserId  — existing linked account (authoritative)
 *   2. idnumber      — Moodle idnumber matches regNumber (migration path)
 *   3. email         — controlled fallback, logged as warning
 *
 * NO silent merging: if a match is found via idnumber or email but the
 * found account already has a *different* moodleUserId, it is flagged as
 * a conflict and skipped.
 */
async function upsertMoodleUser(
  mu: { id: number; email: string; fullname: string; firstname: string; lastname: string; idnumber?: string; suspended?: number },
  role: Role,
  warnings: string[],
  stats: SyncStats
): Promise<string | null> {
  const emailNorm = mu.email.trim().toLowerCase()
  const moodleIdBig = BigInt(mu.id)

  // 1. Exact moodleUserId match
  const byMoodleId = await prisma.user.findUnique({ where: { moodleUserId: moodleIdBig } })
  if (byMoodleId) {
    // Account exists and is linked — update name/active status only
    const suspended = (mu.suspended ?? 0) === 1
    const needsUpdate =
      byMoodleId.fullName !== mu.fullname ||
      byMoodleId.isActive === suspended

    if (needsUpdate) {
      await prisma.user.update({
        where: { id: byMoodleId.id },
        data: {
          fullName: mu.fullname,
          isActive: !suspended,
        },
      })
      stats.updated++
    } else {
      stats.unchanged++
    }
    return byMoodleId.id
  }

  // 2. idnumber → regNumber match (migration path)
  let candidate = mu.idnumber?.trim()
    ? await prisma.user.findUnique({ where: { regNumber: mu.idnumber.trim() } })
    : null

  // 3. Email fallback (controlled — logged as warning)
  if (!candidate) {
    candidate = await prisma.user.findUnique({ where: { email: emailNorm } })
    if (candidate) {
      const warn = `Moodle user id=${mu.id} matched by email fallback to Attendance user ${candidate.id} (${emailNorm}). Verify this is intentional.`
      warnings.push(warn)
      console.warn(`[moodle-sync] ${warn}`)
    }
  }

  if (candidate) {
    // Conflict: candidate is already linked to a different Moodle account
    if (candidate.moodleUserId !== null && candidate.moodleUserId !== moodleIdBig) {
      const conflict = `Attendance user ${candidate.id} already linked to moodleUserId=${candidate.moodleUserId}, cannot link to ${mu.id}`
      warnings.push(conflict)
      console.error(`[moodle-sync] conflict: ${conflict}`)
      stats.conflicts++
      return null
    }

    // Guard: never re-role a faculty_admin or system_admin
    if (candidate.role === Role.faculty_admin || candidate.role === Role.system_admin) {
      stats.skipped++
      return candidate.id
    }

    // Link existing account to Moodle identity
    await prisma.user.update({
      where: { id: candidate.id },
      data: {
        moodleUserId: moodleIdBig,
        fullName: mu.fullname,
        isActive: (mu.suspended ?? 0) !== 1,
      },
    })
    stats.updated++
    return candidate.id
  }

  // No match — create new account
  // Safety: reject if email domain doesn't match expected role
  const emailLower = emailNorm
  const isStudentEmail = emailLower.endsWith('@stud.umu.ac.ug')
  const isStaffEmail = emailLower.endsWith('@umu.ac.ug') && !isStudentEmail

  if (role === Role.student && !isStudentEmail) {
    const warn = `Moodle student id=${mu.id} has non-student email domain (${emailLower}). Skipping.`
    warnings.push(warn)
    stats.skipped++
    return null
  }
  if (role === Role.lecturer && !isStaffEmail) {
    const warn = `Moodle lecturer id=${mu.id} has non-staff email domain (${emailLower}). Skipping.`
    warnings.push(warn)
    stats.skipped++
    return null
  }

  const newUser = await prisma.user.create({
    data: {
      email: emailNorm,
      fullName: mu.fullname,
      role,
      moodleUserId: moodleIdBig,
      profileComplete: false,
      isActive: (mu.suspended ?? 0) !== 1,
      regNumber: mu.idnumber?.trim() || null,
    },
  })
  stats.created++
  return newUser.id
}

// ─── Enrolment sync ───────────────────────────────────────────────────────────

interface EnrolmentSyncResult {
  stats: SyncStats
}

/**
 * Sync Moodle course enrolments → Attendance Enrollment and LecturerAssignment.
 *
 * SAFETY INVARIANTS:
 * - Only the CURRENT academic period (from system settings) is written/reconciled.
 * - Historical enrollment rows (prior periods) are NEVER touched.
 * - Enrollment.deleteMany is scoped to { studentId, courseUnitId, academicYear, semester }
 *   for the current period only — it does NOT cascade to AttendanceRecord,
 *   Session, ExcuseRequest, or any other attendance table.
 * - LecturerAssignment writes use a dedicated MOODLE_SYNC system-user actor so
 *   assignedById is never null and audit trails remain meaningful.
 */
async function syncEnrolments(
  moodleCourseIds: number[],
  warnings: string[]
): Promise<EnrolmentSyncResult> {
  const stats = emptySyncStats()

  if (moodleCourseIds.length === 0) return { stats }

  const currentPeriod = await getCurrentPeriod()

  // Resolve the system/integration actor for LecturerAssignment.assignedById
  const systemActor = await getOrCreateSyncActor()

  for (const moodleCourseId of moodleCourseIds) {
    // Find the corresponding Attendance CourseUnit
    const courseUnit = await prisma.courseUnit.findUnique({
      where: { moodleCourseId: BigInt(moodleCourseId) },
    })
    if (!courseUnit) continue

    // Phase 3 — semester scoping: skip courses belonging to a different semester
    if (courseUnit.semesterId) {
      const sem = await prisma.semester.findUnique({
        where: { id: courseUnit.semesterId },
        select: { number: true },
      })
      if (sem && sem.number !== currentPeriod.semester) {
        warnings.push(
          `[enrolment] Skipping course ${courseUnit.code} (id=${courseUnit.id}): semester ${sem.number} ≠ current period semester ${currentPeriod.semester}`
        )
        stats.skipped++
        continue
      }
    }

    let enrolledUsers
    try {
      enrolledUsers = await fetchEnrolledUsers(moodleCourseId)
    } catch (err) {
      stats.errors++
      console.error(`[moodle-sync] enrolment fetch error for course ${moodleCourseId}:`, (err as Error).message)
      continue
    }

    const studentMoodleIds: number[] = []
    const lecturerMoodleIds: number[] = []

    for (const mu of enrolledUsers) {
      const roleShortnames = (mu.roles ?? []).map((r) => r.shortname)
      if (roleShortnames.some((r) => SKIP_ROLES.has(r))) continue

      const role = moodleRoleToAttendance(roleShortnames)
      if (role === Role.student) studentMoodleIds.push(mu.id)
      else if (role === Role.lecturer) lecturerMoodleIds.push(mu.id)
    }

    // ── Student enrollments ──────────────────────────────────────────────────
    const studentUsers = await prisma.user.findMany({
      where: {
        moodleUserId: { in: studentMoodleIds.map(BigInt) },
        role: Role.student,
      },
      select: { id: true, moodleUserId: true },
    })

    const moodleStudentIdToUserId = new Map(
      studentUsers.map((u) => [Number(u.moodleUserId!), u.id])
    )

    // Upsert enrollments for Moodle-enrolled students
    for (const moodleId of studentMoodleIds) {
      const userId = moodleStudentIdToUserId.get(moodleId)
      if (!userId) continue
      stats.fetched++

      try {
        const existing = await prisma.enrollment.findUnique({
          where: {
            studentId_courseUnitId_academicYear_semester: {
              studentId: userId,
              courseUnitId: courseUnit.id,
              academicYear: currentPeriod.academicYear,
              semester: currentPeriod.semester,
            },
          },
        })
        if (existing) {
          stats.unchanged++
        } else {
          await prisma.enrollment.create({
            data: {
              studentId: userId,
              courseUnitId: courseUnit.id,
              academicYear: currentPeriod.academicYear,
              semester: currentPeriod.semester,
            },
          })
          stats.created++
        }
      } catch (err) {
        stats.errors++
        console.error(`[moodle-sync] enrollment upsert error student=${userId} unit=${courseUnit.id}:`, (err as Error).message)
      }
    }

    // CURRENT-PERIOD RECONCILIATION (non-destructive to history):
    // Remove current-period enrollment rows for students no longer in Moodle.
    // This only deletes Enrollment rows — AttendanceRecord rows are unaffected
    // because they are linked to Session, not Enrollment.
    const activeMoodleStudentUserIds = new Set(
      studentMoodleIds
        .map((mid) => moodleStudentIdToUserId.get(mid))
        .filter((id): id is string => id !== undefined)
    )

    // Find current-period enrollments for this course unit that are no longer in Moodle
    const currentEnrollments = await prisma.enrollment.findMany({
      where: {
        courseUnitId: courseUnit.id,
        academicYear: currentPeriod.academicYear,
        semester: currentPeriod.semester,
      },
      select: { id: true, studentId: true },
    })

    for (const enr of currentEnrollments) {
      if (activeMoodleStudentUserIds.has(enr.studentId)) continue
      // Only delete if this student has a moodleUserId (i.e. synced account).
      // Accounts created outside Moodle (CSV import) are never removed here.
      const student = await prisma.user.findUnique({
        where: { id: enr.studentId },
        select: { moodleUserId: true },
      })
      if (student !== null && student.moodleUserId !== null) {
        await prisma.enrollment.delete({ where: { id: enr.id } })
        stats.updated++ // "updated" = membership changed
      }
    }

    // ── Lecturer assignments ─────────────────────────────────────────────────
    const lecturerUsers = await prisma.user.findMany({
      where: {
        moodleUserId: { in: lecturerMoodleIds.map(BigInt) },
        role: Role.lecturer,
      },
      select: { id: true, moodleUserId: true },
    })

    for (const lu of lecturerUsers) {
      stats.fetched++
      try {
        const existing = await prisma.lecturerAssignment.findUnique({
          where: {
            lecturerId_courseUnitId_academicYear_semester: {
              lecturerId: lu.id,
              courseUnitId: courseUnit.id,
              academicYear: currentPeriod.academicYear,
              semester: currentPeriod.semester,
            },
          },
        })
        if (existing) {
          stats.unchanged++
        } else {
          await prisma.lecturerAssignment.create({
            data: {
              lecturerId: lu.id,
              courseUnitId: courseUnit.id,
              academicYear: currentPeriod.academicYear,
              semester: currentPeriod.semester,
              assignedById: systemActor.id,
            },
          })
          stats.created++
        }
      } catch (err) {
        stats.errors++
        console.error(`[moodle-sync] assignment error lecturer=${lu.id} unit=${courseUnit.id}:`, (err as Error).message)
      }
    }
  }

  return { stats }
}

// ─── System sync actor ────────────────────────────────────────────────────────

const SYNC_ACTOR_EMAIL = 'moodle-sync@system.internal'

/**
 * Returns the dedicated Moodle sync system actor user, creating it if absent.
 * This user is the assignedById for Moodle-originated LecturerAssignments,
 * keeping the audit trail meaningful without making assignedById nullable.
 */
async function getOrCreateSyncActor(): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { email: SYNC_ACTOR_EMAIL } })
  if (existing) return { id: existing.id }

  const actor = await prisma.user.create({
    data: {
      email: SYNC_ACTOR_EMAIL,
      fullName: 'Moodle Sync',
      role: Role.system_admin,
      profileComplete: true,
      isActive: false, // Cannot log in — no password, no googleId
    },
  })
  return { id: actor.id }
}

// ─── Auto-assign lecturer faculties (Phase 3) ──────────────────────────────

/**
 * For Moodle-synced lecturers who haven't completed their profile yet,
 * derive faculty memberships from their course assignments via the hierarchy.
 *
 * This runs after syncEnrolments so LecturerAssignment records exist.
 * Only touches lecturers with profileComplete=false — never overwrites
 * manual faculty selections.
 */
async function autoAssignLecturerFaculties(warnings: string[]): Promise<SyncStats> {
  const stats = emptySyncStats()

  const currentPeriod = await getCurrentPeriod()

  // Find unprofiled Moodle-synced lecturers
  const lecturers = await prisma.user.findMany({
    where: {
      role: Role.lecturer,
      moodleUserId: { not: null },
      profileComplete: false,
    },
    select: { id: true, fullName: true },
  })

  for (const lecturer of lecturers) {
    try {
      // Find this lecturer's current-period course assignments
      const assignments = await prisma.lecturerAssignment.findMany({
        where: {
          lecturerId: lecturer.id,
          academicYear: currentPeriod.academicYear,
          semester: currentPeriod.semester,
        },
        select: { courseUnit: { select: { facultyId: true } } },
      })

      // Collect distinct faculty IDs from assigned courses
      const facultyIds = [...new Set(
        assignments.map((a) => a.courseUnit.facultyId).filter((id): id is string => id !== null)
      )]

      if (facultyIds.length === 0) {
        stats.skipped++
        continue
      }

      // Limit to MAX_LECTURER_FACULTIES
      const limited = facultyIds.slice(0, MAX_LECTURER_FACULTIES)
      if (facultyIds.length > MAX_LECTURER_FACULTIES) {
        warnings.push(
          `[auto-assign] Lecturer ${lecturer.fullName} (${lecturer.id}) teaches in ${facultyIds.length} faculties; only ${MAX_LECTURER_FACULTIES} assigned.`
        )
      }

      // Create LecturerFaculty records (first = primary) + set user.facultyId
      await prisma.$transaction([
        prisma.lecturerFaculty.deleteMany({ where: { userId: lecturer.id } }),
        prisma.lecturerFaculty.createMany({
          data: limited.map((facultyId, i) => ({ userId: lecturer.id, facultyId, isPrimary: i === 0 })),
        }),
        prisma.user.update({
          where: { id: lecturer.id },
          data: { facultyId: limited[0], profileComplete: true },
        }),
      ])

      stats.created++
    } catch (err) {
      stats.errors++
      console.error(`[auto-assign] Lecturer faculty error for ${lecturer.id}:`, (err as Error).message)
    }
  }

  return stats
}

// ─── Auto-assign student programme (Phase 3) ───────────────────────────────

/**
 * For Moodle-synced students who haven't completed their profile yet,
 * derive their programme from their course enrolments via the hierarchy.
 *
 * Walks CourseUnit → Semester → ProgrammeYear → Programme and picks
 * the most common programme (majority vote). Only sets profile fields
 * when a clear winner exists — otherwise leaves unassigned for manual profile.
 */
async function autoAssignStudentProgramme(warnings: string[]): Promise<SyncStats> {
  const stats = emptySyncStats()

  const currentPeriod = await getCurrentPeriod()

  // Find unprofiled Moodle-synced students
  const students = await prisma.user.findMany({
    where: {
      role: Role.student,
      moodleUserId: { not: null },
      profileComplete: false,
    },
    select: { id: true, fullName: true },
  })

  for (const student of students) {
    try {
      // Find this student's current-period enrollments
      const enrollments = await prisma.enrollment.findMany({
        where: {
          studentId: student.id,
          academicYear: currentPeriod.academicYear,
          semester: currentPeriod.semester,
        },
        select: {
          courseUnit: {
            select: {
              semesterId: true,
              facultyId: true,
            },
          },
        },
      })

      if (enrollments.length === 0) {
        stats.skipped++
        continue
      }

      // Resolve each course unit's programme via the hierarchy
      // CourseUnit → Semester → ProgrammeYear → Programme
      const programmeCounts = new Map<string, { programmeId: string; facultyId: string; year: number; semester: number; count: number }>()

      for (const enr of enrollments) {
        if (!enr.courseUnit.semesterId) continue

        const semester = await prisma.semester.findUnique({
          where: { id: enr.courseUnit.semesterId },
          select: {
            number: true,
            programmeYear: {
              select: {
                year: true,
                programme: {
                  select: { id: true, facultyId: true },
                },
              },
            },
          },
        })

        if (!semester?.programmeYear?.programme) continue

        const progId = semester.programmeYear.programme.id
        const existing = programmeCounts.get(progId)
        if (existing) {
          existing.count++
        } else {
          programmeCounts.set(progId, {
            programmeId: progId,
            facultyId: semester.programmeYear.programme.facultyId,
            year: semester.programmeYear.year,
            semester: semester.number,
            count: 1,
          })
        }
      }

      if (programmeCounts.size === 0) {
        stats.skipped++
        continue
      }

      // Pick the programme with the most enrolments.
      // If two or more programmes share the highest count (a tie), skip this
      // student and emit a warning — never assign arbitrarily.
      let best: { programmeId: string; facultyId: string; year: number; semester: number } | null = null
      let bestCount = 0
      let tied = false
      for (const [, entry] of programmeCounts) {
        if (entry.count > bestCount) {
          bestCount = entry.count
          best = { programmeId: entry.programmeId, facultyId: entry.facultyId, year: entry.year, semester: entry.semester }
          tied = false
        } else if (entry.count === bestCount) {
          tied = true
        }
      }

      if (!best || tied) {
        if (tied) {
          const tiedIds = [...programmeCounts.entries()]
            .filter(([, e]) => e.count === bestCount)
            .map(([id]) => id)
            .join(', ')
          const warn = `[auto-assign] Student ${student.fullName} (${student.id}) has equal enrolment counts across programmes [${tiedIds}] — cannot auto-assign. Manual profile completion required.`
          warnings.push(warn)
          console.warn(`[moodle-sync] ${warn}`)
        }
        stats.skipped++
        continue
      }

      await prisma.user.update({
        where: { id: student.id },
        data: {
          programmeId: best.programmeId,
          facultyId: best.facultyId,
          year: best.year,
          semester: currentPeriod.semester,
          academicYear: currentPeriod.academicYear,
          profileComplete: true,
        },
      })

      stats.created++
    } catch (err) {
      stats.errors++
      console.error(`[auto-assign] Student programme error for ${student.id}:`, (err as Error).message)
    }
  }

  return stats
}
