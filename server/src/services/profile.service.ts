import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { isProfileEditingEnabled } from './settings.service'
export interface StudentPathInput {
  campusId: string
  facultyId: string
  programmeId: string
  year: number
  semester: number
  regNumber: string
  academicYear: string
}

export async function validateStudentPath(input: StudentPathInput): Promise<void> {
  const programme = await prisma.programme.findUnique({
    where: { id: input.programmeId },
    include: { faculty: true },
  })
  if (!programme) throw new ApiError('Programme not found', 404)
  if (programme.facultyId !== input.facultyId) {
    throw new ApiError('Programme does not belong to the selected faculty', 400)
  }
  if (programme.faculty.campusId !== input.campusId) {
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
  const curriculum = await prisma.curriculumUnit.findMany({
    where: { programmeId, year, semester, academicYear },
    select: { courseUnitId: true },
  })

  await prisma.enrollment.deleteMany({
    where: { studentId, academicYear, semester },
  })

  if (curriculum.length > 0) {
    await prisma.enrollment.createMany({
      data: curriculum.map((c) => ({
        studentId,
        courseUnitId: c.courseUnitId,
        academicYear,
        semester,
      })),
    })
  }

  return curriculum.length
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
      profileComplete: true,
    },
  })
  const unitsEnrolled = await recalculateEnrollments(userId, input)
  return { unitsEnrolled }
}

/** Student edits their academic path — enrolments recalculated (FR-02.5/02.6). */
export async function updateStudentProfile(userId: string, input: StudentPathInput) {
  await assertProfileEditingAllowed('students')
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
      profileComplete: true,
    },
  })
  const unitsEnrolled = await recalculateEnrollments(userId, input)
  return { unitsEnrolled }
}

/** First-time lecturer profile completion (FR-02.7/02.8). */
export async function completeLecturerProfile(userId: string, facultyId: string) {
  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)

  await prisma.user.update({
    where: { id: userId },
    data: { facultyId, profileComplete: true },
  })
  return { facultyId }
}

/** Lecturer changes their faculty. */
export async function updateLecturerProfile(userId: string, facultyId: string) {
  await assertProfileEditingAllowed('lecturers')
  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)

  await prisma.user.update({
    where: { id: userId },
    data: { facultyId, profileComplete: true },
  })
  return { facultyId }
}

/** Profile edits are blocked while the System Admin has frozen the scope. */
async function assertProfileEditingAllowed(
  scope: Parameters<typeof isProfileEditingEnabled>[0]
): Promise<void> {
  if (!(await isProfileEditingEnabled(scope))) {
    throw new ApiError('Profile editing is currently disabled by the System Admin', 403)
  }
}
