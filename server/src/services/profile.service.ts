import { prisma } from '../config/db'
import { publish } from './events.service'
import { ApiError } from '../utils/apiResponse'
import { isValidCampusCode } from '../constants/campuses'
import { isProfileEditingEnabled } from './settings.service'
import { getCurrentPeriod } from './settings.service'
export interface StudentPathInput {
  campusCode: string
  facultyId: string
  programmeId: string
  year: number
  semester: number
  regNumber: string
  studentNumber: string
  academicYear: string
}

export async function validateStudentPath(input: StudentPathInput): Promise<void> {
  if (!isValidCampusCode(input.campusCode)) {
    throw new ApiError('Campus not found', 404)
  }
  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    include: { faculty: true },
  })
  if (!programme) throw new ApiError('Programme not found', 404)
  if (programme.facultyId !== input.facultyId) {
    throw new ApiError('Programme does not belong to the selected faculty', 400)
  }
  if (programme.faculty.campusCode.toUpperCase() !== input.campusCode.toUpperCase()) {
    throw new ApiError('Faculty does not belong to the selected campus', 400)
  }
}

/**
 * Recalculate a student's enrolments for the given academic year + semester.
 * Old enrolments in that period are removed, then recreated from the
 * Moodle-sourced curriculum (SemesterCourseUnit) for the student's current
 * path (programme + year + semester). Falls back to the legacy CurriculumUnit
 * table only when no Moodle-sourced semester is linked, so existing behaviour
 * is preserved for programmes not yet synced from Moodle.
 * CORE units only — electives are chosen separately via the picker.
 */
export async function recalculateEnrollments(
  studentId: string,
  { programmeId, year, semester, academicYear }: StudentPathInput
): Promise<number> {
  // Prefer Moodle-sourced curriculum: find the Semester node for this path
  // (Programme → ProgrammeYear → Semester) and read SemesterCourseUnit rows.
  const semesterNode = await prisma.semester.findFirst({
    where: {
      number: semester,
      programmeYear: {
        year,
        programmeId,
      },
    },
    select: { id: true },
  })

  let curriculum: string[]

  if (semesterNode) {
    // Moodle-sourced path: SemesterCourseUnit is the authoritative curriculum
    const rows = await prisma.semesterCourseUnit.findMany({
      where: { semesterId: semesterNode.id },
      select: { courseUnitId: true },
    })
    curriculum = [...new Set(rows.map((r) => r.courseUnitId))]
  } else {
    // Legacy fallback: CurriculumUnit (used until Moodle sync has run)
    const rows = await prisma.curriculumUnit.findMany({
      where: { programmeId, year, semester, isElective: false },
      select: { courseUnitId: true },
    })
    curriculum = [...new Set(rows.map((r) => r.courseUnitId))]
  }

  await prisma.enrollment.deleteMany({
    where: { studentId, academicYear, semester },
  })

  if (curriculum.length > 0) {
    await prisma.enrollment.createMany({
      data: curriculum.map((courseUnitId) => ({
        studentId,
        courseUnitId,
        academicYear,
        semester,
      })),
    })
  }

  return curriculum.length
}

/** Map Prisma unique-violation errors to friendly messages. */
export function friendlyUniqueError(e: unknown): never {
  const target = (e as { code?: string; meta?: { target?: string[] } }).code === 'P2002'
    ? (e as { meta?: { target?: string[] } }).meta?.target ?? []
    : []
  if (target.some((t) => t.includes('regNumber'))) {
    throw new ApiError('That registration number is already used by another student', 409)
  }
  if (target.some((t) => t.includes('studentNumber'))) {
    throw new ApiError('That student number is already used by another student', 409)
  }
  throw e as Error
}

/** First-time student profile completion (FR-02.2 → 02.4). */
export async function completeStudentProfile(userId: string, input: StudentPathInput) {
  await validateStudentPath(input)
  await prisma.user.update({
    where: { id: userId },
    data: {
      facultyId: input.facultyId,
      programmeId: input.programmeId,
      year: input.year,
      semester: input.semester,
      academicYear: input.academicYear,
      regNumber: input.regNumber,
      studentNumber: input.studentNumber,
      profileComplete: true,
    },
  }).catch(friendlyUniqueError)
  const unitsEnrolled = await recalculateEnrollments(userId, input)
  publish('enrollments-changed')
  return { unitsEnrolled }
}

/** Student edits their profile — only Reg/Student numbers may change (toggle-gated). */
export async function updateStudentProfile(userId: string, input: StudentPathInput) {
  await assertProfileEditingAllowed('students')
  // Academic path (campus/faculty/programme/year) is fixed by the curriculum —
  // ignore whatever the client sends and update the two identity numbers only.
  await prisma.user.update({
    where: { id: userId },
    data: {
      regNumber: input.regNumber,
      studentNumber: input.studentNumber,
      profileComplete: true,
    },
  }).catch(friendlyUniqueError)
  return { updatedFields: ['regNumber', 'studentNumber'] }
}

export const MAX_LECTURER_FACULTIES = 3

/** Validate + replace a lecturer's faculty memberships (first entry = primary). */
async function setLecturerFaculties(userId: string, facultyIds: string[]) {
  const unique = [...new Set(facultyIds)]
  if (unique.length < 1) throw new ApiError('Select at least one faculty', 400)
  if (unique.length > MAX_LECTURER_FACULTIES) {
    throw new ApiError(`You can belong to at most ${MAX_LECTURER_FACULTIES} faculties`, 400)
  }
  const faculties = await prisma.faculty.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true },
  })
  if (faculties.length !== unique.length) {
    throw new ApiError('One of the selected faculties was not found or is inactive', 404)
  }

  // Primary faculty stays denormalised on users.facultyId so existing
  // faculty-scoped queries keep working.
  await prisma.$transaction([
    prisma.lecturerFaculty.deleteMany({ where: { userId } }),
    prisma.lecturerFaculty.createMany({
      data: unique.map((facultyId, i) => ({ userId, facultyId, isPrimary: i === 0 })),
    }),
    prisma.user.update({ where: { id: userId }, data: { facultyId: unique[0] } }),
  ])
  return { facultyIds: unique }
}

/** First-time lecturer profile completion — pick their faculties (max 3). */
export async function completeLecturerProfile(userId: string, facultyIds: string[]) {
  const result = await setLecturerFaculties(userId, facultyIds)
  await prisma.user.update({
    where: { id: userId },
    data: { profileComplete: true },
  })
  publish('users-changed')
  return result
}

/** Lecturer changes their faculty selection (toggle-gated). */
export async function updateLecturerProfile(userId: string, facultyIds: string[]) {
  await assertProfileEditingAllowed('lecturers')
  const result = await setLecturerFaculties(userId, facultyIds)
  publish('users-changed')
  return result
}

/** Profile edits are blocked while the System Admin has frozen the scope. */
async function assertProfileEditingAllowed(
  scope: Parameters<typeof isProfileEditingEnabled>[0]
): Promise<void> {
  if (!(await isProfileEditingEnabled(scope))) {
    throw new ApiError('Profile editing is currently disabled by the System Admin', 403)
  }
}

// ─── Lazy auto-detection (on-demand, at login time) ──────────────────────────

export interface AutoDetectResult {
  detected: boolean
  facultyId?: string
  programmeId?: string
  year?: number
  semester?: number
  academicYear?: string
  regNumber?: string | null
}

/**
 * Attempt to detect a student's programme/faculty/year from their Moodle
 * enrolments at login time. Reuses the same hierarchy-walking logic as
 * autoAssignStudentProgramme in the sync service, but runs on-demand for
 * a single student.
 *
 * Returns { detected: true } with the resolved path fields when successful,
 * or { detected: false } when the student has no enrolments, no hierarchy
 * data, or a tied majority vote.
 *
 * On success, updates the user record with the detected path AND sets
 * profileComplete = true. Caller must still redirect to /profile/setup
 * when detected = false.
 */
export async function autoDetectStudentProfile(userId: string): Promise<AutoDetectResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      moodleUserId: true,
      profileComplete: true,
      facultyId: true,
      programmeId: true,
      year: true,
      regNumber: true,
    },
  })

  if (!user || user.role !== 'student' || user.moodleUserId === null || user.profileComplete) {
    return { detected: false }
  }

  const currentPeriod = await getCurrentPeriod()
  if (!currentPeriod) return { detected: false }

  // Find this student's current-period enrolments
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: userId,
      academicYear: currentPeriod.academicYear,
      semester: currentPeriod.semester,
    },
    select: {
      courseUnit: {
        select: { semesterId: true, facultyId: true },
      },
    },
  })

  if (enrollments.length === 0) return { detected: false }

  // Walk the hierarchy: CourseUnit → Semester → ProgrammeYear → Programme
  // and count how many enrolments map to each programme (majority vote).
  const programmeCounts = new Map<
    string,
    { programmeId: string; facultyId: string; year: number; semester: number; count: number }
  >()

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

  if (programmeCounts.size === 0) return { detected: false }

  // Pick the programme with the most enrolments.
  // Skip on a tie — never assign arbitrarily.
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

  if (!best || tied) return { detected: false }

  // Detection succeeded — persist the path
  await prisma.user.update({
    where: { id: userId },
    data: {
      programmeId: best.programmeId,
      facultyId: best.facultyId,
      year: best.year,
      semester: currentPeriod.semester,
      academicYear: currentPeriod.academicYear,
      profileComplete: true,
    },
  })

  publish('users-changed')

  return {
    detected: true,
    facultyId: best.facultyId,
    programmeId: best.programmeId,
    year: best.year,
    semester: currentPeriod.semester,
    academicYear: currentPeriod.academicYear,
    regNumber: user.regNumber,
  }
}

/**
 * Attempt to auto-detect a lecturer's faculty from their course assignments.
 * Same logic as autoAssignLecturerFaculties in the sync service, on-demand.
 */
export async function autoDetectLecturerProfile(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      moodleUserId: true,
      profileComplete: true,
    },
  })

  if (!user || user.role !== 'lecturer' || user.moodleUserId === null || user.profileComplete) {
    return false
  }

  const currentPeriod = await getCurrentPeriod()
  if (!currentPeriod) return false

  const assignments = await prisma.lecturerAssignment.findMany({
    where: {
      lecturerId: userId,
      academicYear: currentPeriod.academicYear,
      semester: currentPeriod.semester,
    },
    select: { courseUnit: { select: { facultyId: true } } },
  })

  const facultyIds = [...new Set(
    assignments.map((a) => a.courseUnit.facultyId).filter((id): id is string => id !== null)
  )]

  if (facultyIds.length === 0) return false

  const limited = facultyIds.slice(0, MAX_LECTURER_FACULTIES)

  await prisma.$transaction([
    prisma.lecturerFaculty.deleteMany({ where: { userId } }),
    prisma.lecturerFaculty.createMany({
      data: limited.map((facultyId, i) => ({ userId, facultyId, isPrimary: i === 0 })),
    }),
    prisma.user.update({
      where: { id: userId },
      data: { facultyId: limited[0], profileComplete: true },
    }),
  ])

  publish('users-changed')
  return true
}

/** Persist that the user has seen (or skipped) the onboarding tour. */
export async function markTourComplete(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { hasCompletedTour: true },
  })
  return { hasCompletedTour: true }
}
