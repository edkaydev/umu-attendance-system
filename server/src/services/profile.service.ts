import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { isValidCampusCode } from '../constants/campuses'
import { isProfileEditingEnabled } from './settings.service'
import { getCurriculumUnitIds } from './enrollment.service'
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
 * curriculum mapping for the student's current path (FR-02.4 / FR-02.6).
 */
export async function recalculateEnrollments(
  studentId: string,
  { programmeId, year, semester, academicYear }: StudentPathInput
): Promise<number> {
  const curriculum = await getCurriculumUnitIds(programmeId, year, semester)

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
  return result
}

/** Lecturer changes their faculty selection (toggle-gated). */
export async function updateLecturerProfile(userId: string, facultyIds: string[]) {
  await assertProfileEditingAllowed('lecturers')
  return setLecturerFaculties(userId, facultyIds)
}

/** Profile edits are blocked while the System Admin has frozen the scope. */
async function assertProfileEditingAllowed(
  scope: Parameters<typeof isProfileEditingEnabled>[0]
): Promise<void> {
  if (!(await isProfileEditingEnabled(scope))) {
    throw new ApiError('Profile editing is currently disabled by the System Admin', 403)
  }
}

/** Persist that the user has seen (or skipped) the onboarding tour. */
export async function markTourComplete(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { hasCompletedTour: true },
  })
  return { hasCompletedTour: true }
}
