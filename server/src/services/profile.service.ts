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

/** Save a student's academic path and rebuild their enrolments. */
async function saveStudentPath(userId: string, input: StudentPathInput) {
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

/** Link a lecturer to an existing faculty. */
async function saveLecturerFaculty(userId: string, facultyId: string) {
  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)

  await prisma.user.update({
    where: { id: userId },
    data: { facultyId, profileComplete: true },
  })
  return { facultyId }
}

/** First-time student profile completion (FR-02.2 → 02.4). */
export async function completeStudentProfile(userId: string, input: StudentPathInput) {
  return saveStudentPath(userId, input)
}

/** Student edits their academic path — enrolments recalculated (FR-02.5/02.6). */
export async function updateStudentProfile(userId: string, input: StudentPathInput) {
  await assertProfileEditingAllowed('students')
  return saveStudentPath(userId, input)
}

/** First-time lecturer profile completion (FR-02.7/02.8). */
export async function completeLecturerProfile(userId: string, facultyId: string) {
  return saveLecturerFaculty(userId, facultyId)
}

/** Lecturer changes their faculty. */
export async function updateLecturerProfile(userId: string, facultyId: string) {
  await assertProfileEditingAllowed('lecturers')
  return saveLecturerFaculty(userId, facultyId)
}

/** Profile edits are blocked while the System Admin has frozen the scope. */
async function assertProfileEditingAllowed(
  scope: Parameters<typeof isProfileEditingEnabled>[0]
): Promise<void> {
  if (!(await isProfileEditingEnabled(scope))) {
    throw new ApiError('Profile editing is currently disabled by the System Admin', 403)
  }
}
