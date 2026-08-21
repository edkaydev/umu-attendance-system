import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'
import { CAMPUSES, isValidCampusCode, campusName } from '../constants/campuses'
import { propagateCurriculumToCohort } from './enrollment.service'

// ─────────────────────────────────────────────
// CAMPUS (fixed locations, defined in code)
// ─────────────────────────────────────────────

export function listCampuses() {
  return CAMPUSES.map((c) => ({ ...c, isActive: true }))
}

// ─────────────────────────────────────────────
// FACULTY (task 26)
// ─────────────────────────────────────────────

export async function listFaculties(campusCode?: string, includeInactive = false) {
  const faculties = await prisma.faculty.findMany({
    where: {
      ...(campusCode ? { campusCode: campusCode.toUpperCase() } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: 'asc' },
  })
  return faculties.map((f) => ({ ...f, campusName: campusName(f.campusCode) }))
}

export async function createFaculty(data: { campusCode: string; name: string; code: string }) {
  if (!isValidCampusCode(data.campusCode)) {
    throw new ApiError(`Campus "${data.campusCode}" not found`, 404)
  }
  return prisma.faculty.create({ data: { ...data, campusCode: data.campusCode.toUpperCase() } })
}

export async function updateFaculty(
  id: string,
  data: { campusCode?: string; name?: string; code?: string; isActive?: boolean }
) {
  const existing = await prisma.faculty.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Faculty not found', 404)
  if (data.campusCode && !isValidCampusCode(data.campusCode)) {
    throw new ApiError(`Campus "${data.campusCode}" not found`, 404)
  }
  return prisma.faculty.update({
    where: { id },
    data: {
      ...data,
      ...(data.campusCode ? { campusCode: data.campusCode.toUpperCase() } : {}),
    },
  })
}

// ─────────────────────────────────────────────
// PROGRAMME (task 27)
// ─────────────────────────────────────────────

export function listProgrammes(facultyId?: string, includeInactive = false) {
  return prisma.programme.findMany({
    where: {
      ...(facultyId ? { facultyId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { faculty: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createProgramme(data: { facultyId: string; name: string; code: string }) {
  const faculty = await prisma.faculty.findUnique({ where: { id: data.facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)
  return prisma.programme.create({ data })
}

export async function updateProgramme(
  id: string,
  data: { facultyId?: string; name?: string; code?: string; isActive?: boolean }
) {
  const existing = await prisma.programme.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Programme not found', 404)
  if (data.facultyId) {
    const faculty = await prisma.faculty.findUnique({ where: { id: data.facultyId } })
    if (!faculty) throw new ApiError('Faculty not found', 404)
  }
  return prisma.programme.update({ where: { id }, data })
}

// ─────────────────────────────────────────────
// COURSE UNIT (task 28)
// ─────────────────────────────────────────────

/** Returns course units owned by OR shared with a faculty. */
export async function listCourseUnits(facultyId?: string, includeInactive = false) {
  if (!facultyId) {
    return prisma.courseUnit.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        faculty: { select: { id: true, name: true } },
        sharedFaculties: { include: { faculty: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    })
  }

  // Units owned by this faculty
  const owned = await prisma.courseUnit.findMany({
    where: { facultyId, ...(includeInactive ? {} : { isActive: true }) },
    include: {
      faculty: { select: { id: true, name: true } },
      sharedFaculties: { include: { faculty: { select: { id: true, name: true } } } },
    },
    orderBy: { name: 'asc' },
  })

  // Units shared with this faculty via join table (owned by other faculties)
  const sharedLinks = await prisma.courseUnitFaculty.findMany({
    where: { facultyId },
    include: {
      courseUnit: {
        include: {
          faculty: { select: { id: true, name: true } },
          sharedFaculties: { include: { faculty: { select: { id: true, name: true } } } },
        },
      },
    },
  })

  const ownedIds = new Set(owned.map((u) => u.id))
  const shared = sharedLinks
    .map((l) => l.courseUnit)
    .filter((u) => !ownedIds.has(u.id) && (includeInactive || u.isActive))

  return [...owned, ...shared].sort((a, b) => a.name.localeCompare(b.name))
}

export async function createCourseUnit(data: { facultyId: string; code: string; name: string }) {
  const faculty = await prisma.faculty.findUnique({ where: { id: data.facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)
  return prisma.courseUnit.create({
    data,
    include: {
      faculty: { select: { id: true, name: true } },
      sharedFaculties: { include: { faculty: { select: { id: true, name: true } } } },
    },
  })
}

export async function updateCourseUnit(
  id: string,
  data: { facultyId?: string; code?: string; name?: string; isActive?: boolean }
) {
  const existing = await prisma.courseUnit.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Course unit not found', 404)
  if (data.facultyId) {
    const faculty = await prisma.faculty.findUnique({ where: { id: data.facultyId } })
    if (!faculty) throw new ApiError('Faculty not found', 404)
  }
  return prisma.courseUnit.update({
    where: { id },
    data,
    include: {
      faculty: { select: { id: true, name: true } },
      sharedFaculties: { include: { faculty: { select: { id: true, name: true } } } },
    },
  })
}

/** Share a course unit with an additional faculty. */
export async function addCourseUnitFaculty(courseUnitId: string, facultyId: string) {
  const [courseUnit, faculty] = await Promise.all([
    prisma.courseUnit.findUnique({ where: { id: courseUnitId } }),
    prisma.faculty.findUnique({ where: { id: facultyId } }),
  ])
  if (!courseUnit) throw new ApiError('Course unit not found', 404)
  if (!faculty) throw new ApiError('Faculty not found', 404)
  if (courseUnit.facultyId === facultyId) {
    throw new ApiError('This is already the owning faculty', 400)
  }
  return prisma.courseUnitFaculty.create({ data: { courseUnitId, facultyId } })
}

/** Remove a shared-faculty link from a course unit. */
export async function removeCourseUnitFaculty(courseUnitId: string, facultyId: string) {
  const link = await prisma.courseUnitFaculty.findUnique({
    where: { courseUnitId_facultyId: { courseUnitId, facultyId } },
  })
  if (!link) throw new ApiError('Faculty share not found', 404)
  await prisma.courseUnitFaculty.delete({
    where: { courseUnitId_facultyId: { courseUnitId, facultyId } },
  })
  return link
}

// ─────────────────────────────────────────────
// CURRICULUM MAPPING (task 29)
// ─────────────────────────────────────────────

export interface CurriculumInput {
  courseUnitId: string
  programmeId: string
  year: number
  semester: number
}

/**
 * Create a curriculum mapping. Path sets are standing — they persist across
 * academic periods until an admin changes them.
 *
 * Any faculty may map any existing course unit into their programmes: units
 * like Ethics legitimately cut across faculties, so no share-first gate.
 * @param actorFacultyId  When provided (faculty_admin), the programme must belong
 *                        to the actor's faculty.
 */
export async function createCurriculumMapping(data: CurriculumInput, actorFacultyId?: string | null) {
  const [courseUnit, programme] = await Promise.all([
    prisma.courseUnit.findUnique({ where: { id: data.courseUnitId } }),
    prisma.programme.findUnique({ where: { id: data.programmeId } }),
  ])
  if (!courseUnit) throw new ApiError('Course unit not found', 404)
  if (!programme) throw new ApiError('Programme not found', 404)

  // Faculty Admin scoping: programme must belong to their faculty
  if (actorFacultyId) {
    if (programme.facultyId !== actorFacultyId) {
      throw new ApiError('You can only map curriculum for programmes in your own faculty', 403)
    }
  }

  const mapping = await prisma.curriculumUnit.create({ data })

  const affected = await propagateCurriculumToCohort(
    data.programmeId,
    data.year,
    data.semester
  )

  return { ...mapping, studentsAffected: affected }
}

export async function removeCurriculumMapping(id: string, actorFacultyId?: string | null) {
  const existing = await prisma.curriculumUnit.findUnique({
    where: { id },
    include: { programme: { select: { facultyId: true } } },
  })
  if (!existing) throw new ApiError('Curriculum mapping not found', 404)

  // Faculty Admin scoping: can only remove mappings in their own faculty
  if (actorFacultyId && existing.programme.facultyId !== actorFacultyId) {
    throw new ApiError('You can only remove curriculum mappings for your own faculty', 403)
  }

  await prisma.curriculumUnit.delete({ where: { id } })

  const studentsAffected = await propagateCurriculumToCohort(
    existing.programmeId,
    existing.year,
    existing.semester
  )

  return { ...existing, studentsAffected }
}

export function listCurriculum(filters?: { programmeId?: string; facultyId?: string }) {
  const { facultyId, ...rest } = filters ?? {}
  return prisma.curriculumUnit.findMany({
    where: {
      ...rest,
      ...(facultyId ? { programme: { facultyId } } : {}),
    },
    include: {
      courseUnit: { select: { id: true, code: true, name: true } },
      programme: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ programmeId: 'asc' }, { year: 'asc' }, { semester: 'asc' }],
  })
}

// ─────────────────────────────────────────────
// PROFILE CASCADE OPTIONS (campus → faculty → programme)
// ─────────────────────────────────────────────

export async function getProfileOptions() {
  const faculties = await prisma.faculty.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      programmes: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
      },
    },
  })

  return CAMPUSES.map((c) => ({
    id: c.code,
    code: c.code,
    name: c.name,
    isActive: true,
    faculties: faculties
      .filter((f) => f.campusCode === c.code)
      .map(({ campusCode, ...f }) => f),
  }))
}
