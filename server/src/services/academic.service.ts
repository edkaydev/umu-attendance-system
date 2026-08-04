import { prisma } from '../config/db'
import { ApiError } from '../utils/apiResponse'

// ─────────────────────────────────────────────
// CAMPUS (task 25)
// ─────────────────────────────────────────────

export function listCampuses(includeInactive = false) {
  return prisma.campus.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { _count: { select: { faculties: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createCampus(data: { name: string; code: string }) {
  return prisma.campus.create({ data })
}

export async function updateCampus(
  id: string,
  data: { name?: string; code?: string; isActive?: boolean }
) {
  const existing = await prisma.campus.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Campus not found', 404)
  return prisma.campus.update({ where: { id }, data })
}

// ─────────────────────────────────────────────
// FACULTY (task 26)
// ─────────────────────────────────────────────

export function listFaculties(campusId?: string, includeInactive = false) {
  return prisma.faculty.findMany({
    where: {
      ...(campusId ? { campusId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { campus: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createFaculty(data: { campusId: string; name: string; code: string }) {
  const campus = await prisma.campus.findUnique({ where: { id: data.campusId } })
  if (!campus) throw new ApiError('Campus not found', 404)
  return prisma.faculty.create({ data })
}

export async function updateFaculty(
  id: string,
  data: { campusId?: string; name?: string; code?: string; isActive?: boolean }
) {
  const existing = await prisma.faculty.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Faculty not found', 404)
  if (data.campusId) {
    const campus = await prisma.campus.findUnique({ where: { id: data.campusId } })
    if (!campus) throw new ApiError('Campus not found', 404)
  }
  return prisma.faculty.update({ where: { id }, data })
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

export function listCourseUnits(facultyId?: string, includeInactive = false) {
  return prisma.courseUnit.findMany({
    where: {
      ...(facultyId ? { facultyId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { faculty: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createCourseUnit(data: { facultyId: string; code: string; name: string }) {
  const faculty = await prisma.faculty.findUnique({ where: { id: data.facultyId } })
  if (!faculty) throw new ApiError('Faculty not found', 404)
  return prisma.courseUnit.create({ data })
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
  return prisma.courseUnit.update({ where: { id }, data })
}

// ─────────────────────────────────────────────
// CURRICULUM MAPPING (task 29)
// ─────────────────────────────────────────────

export interface CurriculumInput {
  courseUnitId: string
  programmeId: string
  year: number
  semester: number
  academicYear: string
}

export async function createCurriculumMapping(data: CurriculumInput) {
  const [courseUnit, programme] = await Promise.all([
    prisma.courseUnit.findUnique({ where: { id: data.courseUnitId } }),
    prisma.programme.findUnique({ where: { id: data.programmeId } }),
  ])
  if (!courseUnit) throw new ApiError('Course unit not found', 404)
  if (!programme) throw new ApiError('Programme not found', 404)
  if (courseUnit.facultyId !== programme.facultyId) {
    throw new ApiError('Course unit and programme must belong to the same faculty', 400)
  }
  return prisma.curriculumUnit.create({ data })
}

export async function removeCurriculumMapping(id: string) {
  const existing = await prisma.curriculumUnit.findUnique({ where: { id } })
  if (!existing) throw new ApiError('Curriculum mapping not found', 404)
  await prisma.curriculumUnit.delete({ where: { id } })
  return existing
}

export function listCurriculum(filters?: { programmeId?: string; academicYear?: string }) {
  return prisma.curriculumUnit.findMany({
    where: filters ?? {},
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
  const campuses = await prisma.campus.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      faculties: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          programmes: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
          },
        },
      },
    },
  })
  return campuses
}
