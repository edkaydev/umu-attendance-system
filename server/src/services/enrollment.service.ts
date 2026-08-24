import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'

export interface EnrollmentInput {
  studentId: string
  courseUnitId: string
  academicYear: string
  semester: number
}

/**
 * Resolve the course units a (programme, year, semester) cohort takes.
 * Curricula are standing (period-independent) sets maintained by admins.
 */
export async function getCurriculumUnitIds(
  programmeId: string,
  year: number,
  semester: number
): Promise<string[]> {
  const rows = await prisma.curriculumUnit.findMany({
    where: { programmeId, year, semester },
    select: { courseUnitId: true },
  })
  return [...new Set(rows.map((c) => c.courseUnitId))]
}

/**
 * Re-apply the curriculum to every student on a path (programme + year) in
 * the matching active cohort. Used after a Faculty Admin adds/removes a
 * curriculum mapping so that ALL students in that path see the change — not
 * just those who re-save their profile afterwards.
 */
export async function propagateCurriculumToCohort(
  programmeId: string,
  year: number,
  semester: number
): Promise<number> {
  const curriculum = await getCurriculumUnitIds(programmeId, year, semester)

  const students = await prisma.user.findMany({
    where: {
      role: 'student',
      profileComplete: true,
      programmeId,
      year,
      semester,
    },
    select: { id: true, academicYear: true },
  })
  const enrolledStudents = students.filter((s): s is typeof s & { academicYear: string } =>
    Boolean(s.academicYear)
  )
  if (enrolledStudents.length === 0) return 0

  await prisma.$transaction(async (tx) => {
    for (const s of enrolledStudents) {
      await tx.enrollment.deleteMany({
        where: { studentId: s.id, academicYear: s.academicYear, semester },
      })
      if (curriculum.length > 0) {
        await tx.enrollment.createMany({
          data: curriculum.map((courseUnitId) => ({
            studentId: s.id,
            courseUnitId,
            academicYear: s.academicYear,
            semester,
          })),
        })
      }
    }
  })

  return enrolledStudents.length
}

/**
 * Everything a Faculty Admin needs for unit management in their faculty:
 * their faculty's course units (owned + shared) and the students + lecturers
 * in that faculty together with the units each currently has.
 */
export async function getFacultyUnitOverview(facultyId: string) {
  // Owned units
  const ownedUnits = await prisma.courseUnit.findMany({
    where: { facultyId, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  })

  // Shared units (owned by other faculties but shared with this one)
  const sharedLinks = await prisma.courseUnitFaculty.findMany({
    where: { facultyId },
    include: { courseUnit: { select: { id: true, code: true, name: true, isActive: true } } },
  })
  const sharedUnits = sharedLinks
    .map((l) => l.courseUnit)
    .filter((u) => u.isActive)
    .map(({ isActive: _drop, ...u }) => u)

  const ownedIds = new Set(ownedUnits.map((u) => u.id))
  const allUnits = [
    ...ownedUnits,
    ...sharedUnits.filter((u) => !ownedIds.has(u.id)),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const [students, lecturers] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'student', facultyId },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        regNumber: true,
        programme: { select: { id: true, name: true, code: true } },
        year: true,
        semester: true,
        enrollments: {
          select: {
            id: true,
            courseUnitId: true,
            academicYear: true,
            semester: true,
            courseUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      // Lecturers whose primary faculty is this one OR who also teach here
      where: {
        role: 'lecturer',
        OR: [{ facultyId }, { lecturerFaculties: { some: { facultyId } } }],
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        lecturerAssignments: {
          select: {
            id: true,
            courseUnitId: true,
            academicYear: true,
            semester: true,
            courseUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
  ])

  return { courseUnits: allUnits, students, lecturers }
}

/**
 * Enrolment is derived from the curriculum path (programme → year → semester),
 * so individual student enrolment edits are disabled. Faculty Admins manage
 * the path itself via curriculum mappings, which propagate to every student
 * in the cohort (see propagateCurriculumToCohort).
 */
const ENROLLMENT_LOCKED = 'Student units follow the study path — manage them from the Pathways tab instead of editing students individually'

export async function createEnrollment(
  _input: EnrollmentInput,
  _facultyId: string
): Promise<void> {
  throw new ApiError(ENROLLMENT_LOCKED, 403)
}

export async function removeEnrollment(_id: string, _facultyId: string): Promise<void> {
  throw new ApiError(ENROLLMENT_LOCKED, 403)
}
