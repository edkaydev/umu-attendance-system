import { prisma } from '../config/db'
import { CAMPUSES, campusName } from '../constants/campuses'

// ─────────────────────────────────────────────
// CAMPUS (fixed locations, defined in code)
// ─────────────────────────────────────────────

export function listCampuses() {
  return CAMPUSES.map((c) => ({ ...c, isActive: true }))
}

// ─────────────────────────────────────────────
// FACULTY (read-only — created by Moodle hierarchy sync)
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

// ─────────────────────────────────────────────
// PROGRAMME (read-only — created by Moodle hierarchy sync)
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

// ─────────────────────────────────────────────
// COURSE UNIT (read-only — created by Moodle hierarchy sync)
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

// ─────────────────────────────────────────────
// CURRICULUM (read-only — managed by Moodle hierarchy sync)
// ─────────────────────────────────────────────

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
