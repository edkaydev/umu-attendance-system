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
  const mappings = await prisma.curriculumUnit.findMany({
    where: { programmeId, year, semester },
    select: { courseUnitId: true, isElective: true },
  })
  const coreIds = [...new Set(mappings.filter((m) => !m.isElective).map((m) => m.courseUnitId))]
  const pathIds = [...new Set(mappings.map((m) => m.courseUnitId))] // core ∪ electives

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
      // Removed from the path → disappears everywhere (records stay for history)
      if (pathIds.length > 0) {
        await tx.enrollment.deleteMany({
          where: {
            studentId: s.id,
            academicYear: s.academicYear,
            semester,
            courseUnitId: { notIn: pathIds },
          },
        })
      } else {
        await tx.enrollment.deleteMany({
          where: { studentId: s.id, academicYear: s.academicYear, semester },
        })
      }

      // Core units are everyone's by default — electives come from the picker
      const missing = coreIds.length
        ? await tx.enrollment.findMany({
            where: {
              studentId: s.id,
              academicYear: s.academicYear,
              semester,
              courseUnitId: { in: coreIds },
            },
            select: { courseUnitId: true },
          }).then((rows) => new Set(rows.map((r) => r.courseUnitId)))
        : new Set<string>()
      const toCreate = coreIds.filter((id) => !missing.has(id))
      if (toCreate.length > 0) {
        await tx.enrollment.createMany({
          data: toCreate.map((courseUnitId) => ({
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

/* ─────────────────────────── Electives ─────────────────────────── */

export interface ElectiveOffering {
  courseUnitId: string
  code: string
  name: string
  selected: boolean
  /** Student already has attendance here — cannot be un-picked */
  locked: boolean
}

/**
 * The elective picker state for a student's CURRENT path cell
 * (programme + year + semester): offered electives, what they picked,
 * the pick-N rule and whether they still owe choices.
 */
export async function getElectiveOfferings(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      programmeId: true,
      year: true,
      semester: true,
      academicYear: true,
      programme: { select: { id: true, name: true } },
    },
  })
  if (!student?.programmeId || !student.year || !student.semester) return null

  const [requirement, electiveRows] = await Promise.all([
    prisma.electiveRequirement.findUnique({
      where: {
        programmeId_year_semester: {
          programmeId: student.programmeId,
          year: student.year,
          semester: student.semester,
        },
      },
    }),
    prisma.curriculumUnit.findMany({
      where: {
        programmeId: student.programmeId,
        year: student.year,
        semester: student.semester,
        isElective: true,
      },
      include: { courseUnit: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  if (electiveRows.length === 0) return null

  const offeringIds = [...new Set(electiveRows.map((r) => r.courseUnit.id))]

  // Current selections + whether any attendance exists (swap-lock)
  const [enrollments, lockedRecords] = await Promise.all([
    student.academicYear
      ? prisma.enrollment.findMany({
          where: {
            studentId,
            academicYear: student.academicYear,
            semester: student.semester,
            courseUnitId: { in: offeringIds },
          },
          select: { id: true, courseUnitId: true },
        })
      : Promise.resolve([] as { id: string; courseUnitId: string }[]),
    student.academicYear
      ? prisma.attendanceRecord.findMany({
          where: {
            studentId,
            session: {
              academicYear: student.academicYear,
              semester: student.semester,
              courseUnitId: { in: offeringIds },
            },
          },
          select: { session: { select: { courseUnitId: true } } },
        })
      : Promise.resolve([] as { session: { courseUnitId: string } }[]),
  ])

  const selectedIds = new Set(enrollments.map((e) => e.courseUnitId))
  const lockedIds = new Set(lockedRecords.map((r) => r.session.courseUnitId))

  const offerings: ElectiveOffering[] = electiveRows.map((row) => ({
    courseUnitId: row.courseUnit.id,
    code: row.courseUnit.code,
    name: row.courseUnit.name,
    selected: selectedIds.has(row.courseUnit.id),
    locked: lockedIds.has(row.courseUnit.id),
  }))

  const minPick = requirement?.minPick ?? 1
  return {
    programme: student.programme,
    year: student.year,
    semester: student.semester,
    minPick,
    pickedCount: offerings.filter((o) => o.selected).length,
    satisfied: offerings.filter((o) => o.selected).length >= minPick,
    offerings,
  }
}

/**
 * Persist a student's elective choices (enrollment IS the selection).
 * Rules:
 *  - every unit must be an elective offered on the student's current path cell
 *  - must meet the cell's pick-N minimum
 *  - a chosen unit with existing attendance cannot be dropped (swap-lock)
 */
export async function saveElectiveSelections(studentId: string, courseUnitIds: string[]) {
  const unique = [...new Set(courseUnitIds)]
  const state = await getElectiveOfferings(studentId)
  if (!state) throw new ApiError('No electives are offered on your study path', 404)

  const byId = new Map(state.offerings.map((o) => [o.courseUnitId, o]))
  for (const id of unique) {
    if (!byId.has(id)) throw new ApiError('One of the selected units is not an elective on your path', 400)
  }
  if (unique.length < state.minPick) {
    throw new ApiError(`You must choose at least ${state.minPick} elective${state.minPick > 1 ? 's' : ''}`, 400)
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { academicYear: true, semester: true, programmeId: true, year: true },
  })
  if (!student?.academicYear) throw new ApiError('Complete your profile first', 400)

  const previouslySelected = new Set(
    state.offerings.filter((o) => o.selected).map((o) => o.courseUnitId)
  )
  for (const o of state.offerings) {
    if (o.locked && o.selected && !unique.includes(o.courseUnitId)) {
      throw new ApiError(`${o.code} has attendance recorded — it can no longer be dropped`, 403)
    }
  }

  await prisma.$transaction(async (tx) => {
    const toAdd = unique.filter((id) => !previouslySelected.has(id))
    const toRemoveIds = state.offerings
      .filter((o) => o.selected && !o.locked && !unique.includes(o.courseUnitId))
      .map((o) => o.courseUnitId)

    if (toAdd.length > 0) {
      await tx.enrollment.createMany({
        data: toAdd.map((courseUnitId) => ({
          studentId,
          courseUnitId,
          academicYear: student.academicYear!,
          semester: student.semester ?? state.semester,
        })),
      })
    }
    if (toRemoveIds.length > 0) {
      await tx.enrollment.deleteMany({
        where: {
          studentId,
          academicYear: student.academicYear!,
          semester: student.semester ?? state.semester,
          courseUnitId: { in: toRemoveIds },
        },
      })
    }
  })

  return getElectiveOfferings(studentId)
}
