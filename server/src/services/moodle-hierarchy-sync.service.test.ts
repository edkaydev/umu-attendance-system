/**
 * moodle-hierarchy-sync.service tests
 *
 * Tests the academic hierarchy sync: Faculty, AcademicLevel, AcademicYear,
 * Programme, ProgrammeYear, Semester, and CourseUnit creation/update via
 * Moodle category tree parsing. All external I/O is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock heavy dependencies ────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    faculty: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    academicLevel: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    academicYear: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    programme: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    programmeYear: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    semester: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    courseUnit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    semesterCourseUnit: { create: vi.fn() },
  },
}))

vi.mock('../config/db', () => ({ prisma: prismaMock }))

vi.mock('../integrations/moodle/moodle.categories', () => ({
  fetchCategories: vi.fn(),
}))

vi.mock('../integrations/moodle/moodle.courses', () => ({
  fetchAllCourses: vi.fn(),
}))

vi.mock('./settings.service', () => ({
  getMoodleCurrentPeriodConfig: vi.fn(),
}))

import { fetchCategories } from '../integrations/moodle/moodle.categories'
import { fetchAllCourses } from '../integrations/moodle/moodle.courses'
import { getMoodleCurrentPeriodConfig } from './settings.service'
import { syncAcademicHierarchy } from './moodle-hierarchy-sync.service'
import { moodleCategoryFixture } from '../integrations/moodle/__fixtures__/moodle-categories.fixture'

const mockedFetchCategories = fetchCategories as ReturnType<typeof vi.fn>
const mockedFetchAllCourses = fetchAllCourses as ReturnType<typeof vi.fn>
const mockedGetMoodleCurrentPeriodConfig = getMoodleCurrentPeriodConfig as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockedFetchCategories.mockResolvedValue(moodleCategoryFixture())
  mockedFetchAllCourses.mockResolvedValue([])
  mockedGetMoodleCurrentPeriodConfig.mockResolvedValue({
    academicYearId: null,
    academicYearName: null,
    semesterNumber: 1,
    semesterId: 71n,
  })
  // Default: all findFirst calls return null (empty DB)
  prismaMock.faculty.findFirst.mockResolvedValue(null)
  prismaMock.academicLevel.findFirst.mockResolvedValue(null)
  prismaMock.academicYear.findFirst.mockResolvedValue(null)
  prismaMock.programme.findFirst.mockResolvedValue(null)
  prismaMock.programmeYear.findFirst.mockResolvedValue(null)
  prismaMock.semester.findFirst.mockResolvedValue(null)
  prismaMock.courseUnit.findFirst.mockResolvedValue(null)
  // Default: create returns a generic id
  prismaMock.faculty.create.mockImplementation(async ({ data }) => ({ id: 'fac-new', ...data }))
  prismaMock.academicLevel.create.mockImplementation(async ({ data }) => ({ id: 'level-new', ...data }))
  prismaMock.academicYear.create.mockImplementation(async ({ data }) => ({ id: 'year-new', ...data }))
  prismaMock.programme.create.mockImplementation(async ({ data }) => ({ id: 'prog-new', ...data }))
  prismaMock.programmeYear.create.mockImplementation(async ({ data }) => ({ id: 'py-new', ...data }))
  prismaMock.semester.create.mockImplementation(async ({ data }) => ({ id: 'sem-new', ...data }))
  prismaMock.courseUnit.create.mockImplementation(async ({ data }) => ({ id: 'unit-new', ...data }))
  prismaMock.semesterCourseUnit.create.mockImplementation(async ({ data }) => ({ id: 'scu-new', ...data }))
})

describe('syncAcademicHierarchy', () => {
  it('returns stats and empty moodleCourseIds when no Moodle courses exist', async () => {
    const result = await syncAcademicHierarchy()

    expect(result.stats.hierarchy.fetched).toBe(moodleCategoryFixture().length)
    expect(result.moodleCourseIds).toEqual([])
    expect(result.warnings).toBeDefined()
  })

  it('creates faculties by matching Moodle campus names to hardcoded campus codes', async () => {
    const result = await syncAcademicHierarchy()

    // Should have created a Faculty for "Faculty of Computing" under NKOZI
    expect(prismaMock.faculty.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campusCode: 'NKZ',
          name: 'Faculty of Computing',
        }),
      })
    )
  })

  it('skips faculties when campus name does not match any hardcoded campus', async () => {
    const categories = moodleCategoryFixture().map((c) =>
      c.id === 3 ? { ...c, name: 'Unknown Campus' } : c
    )
    mockedFetchCategories.mockResolvedValue(categories)

    const result = await syncAcademicHierarchy()

    expect(prismaMock.faculty.create).not.toHaveBeenCalled()
    expect(result.warnings.join('\n')).toContain('Unknown Campus')
  })

  it('updates an existing faculty when name or campusCode changes', async () => {
    // Faculty id=21 already synced — findFirst returns it for moodleCategoryId=21
    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) {
        return { id: 'fac-1', moodleCategoryId: 21n, name: 'Old Name', campusCode: 'NKZ', isActive: false }
      }
      return null
    })

    const result = await syncAcademicHierarchy()

    // Faculty should be updated with new name and re-activated
    expect(prismaMock.faculty.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fac-1' },
        data: expect.objectContaining({ name: 'Faculty of Computing', isActive: true }),
      })
    )
  })

  it('creates academic levels and years under a faculty', async () => {
    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) return { id: 'fac-1', moodleCategoryId: 21n }
      return null
    })

    const result = await syncAcademicHierarchy()

    expect(prismaMock.academicLevel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Undergraduate' }),
      })
    )
    expect(prismaMock.academicYear.create).toHaveBeenCalled()
  })

  it('creates programmes linked to academic years', async () => {
    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) return { id: 'fac-1', moodleCategoryId: 21n }
      return null
    })

    const result = await syncAcademicHierarchy()

    expect(prismaMock.programme.create).toHaveBeenCalled()
  })

  it('creates semesters under programme years', async () => {
    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) return { id: 'fac-1', moodleCategoryId: 21n }
      return null
    })

    const result = await syncAcademicHierarchy()

    expect(prismaMock.programmeYear.create).toHaveBeenCalled()
    // SEM 1 (id=71) under the hidden tree should be parseable
    expect(prismaMock.semester.create).toHaveBeenCalled()
  })

  it('soft-deactivates faculties not in the current Moodle tree', async () => {
    const result = await syncAcademicHierarchy()

    // updateMany should have been called to soft-deactivate faculties
    expect(prismaMock.faculty.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })

  it('throws when categories cannot be fetched', async () => {
    mockedFetchCategories.mockRejectedValue(new Error('Network error'))
    await expect(syncAcademicHierarchy()).rejects.toThrow(/Failed to fetch Moodle categories/)
  })

  it('throws when period config is missing', async () => {
    mockedGetMoodleCurrentPeriodConfig.mockResolvedValue({
      academicYearId: null, academicYearName: null, semesterNumber: 1, semesterId: null,
    })
    await expect(syncAcademicHierarchy()).rejects.toThrow(/Cannot resolve current period/)
  })

  it('skips course units with no category id', async () => {
    mockedFetchAllCourses.mockResolvedValue([
      { id: 100, shortname: 'TEST101', fullname: 'Test Course', categoryid: null },
    ])

    const result = await syncAcademicHierarchy()

    expect(result.stats.courses.skipped).toBe(1)
    expect(prismaMock.courseUnit.create).not.toHaveBeenCalled()
  })

  it('skips course units whose semester ancestor is not in the tree', async () => {
    mockedFetchAllCourses.mockResolvedValue([
      { id: 100, shortname: 'TEST101', fullname: 'Test Course', categoryid: 9999 },
    ])

    const result = await syncAcademicHierarchy()

    expect(result.stats.courses.skipped).toBeGreaterThanOrEqual(1)
  })
})

describe('syncAcademicHierarchy — course units', () => {
  it('creates a course unit linked to the correct semester and faculty', async () => {
    mockedFetchAllCourses.mockResolvedValue([
      { id: 100, shortname: 'CSC61101', fullname: 'Computer Science 1', categoryid: 71 },
    ])

    // Resolve faculty for moodleCategoryId=21 → fac-1
    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) return { id: 'fac-1', moodleCategoryId: 21n }
      return null
    })

    // Resolve semester for moodleCategoryId=71 → sem-1
    prismaMock.semester.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 71n) return { id: 'sem-1', moodleCategoryId: 71n }
      return null
    })

    prismaMock.courseUnit.findFirst.mockResolvedValue(null)

    const result = await syncAcademicHierarchy()

    expect(result.stats.courses.created).toBe(1)
    expect(result.moodleCourseIds).toContain(100)
    expect(prismaMock.courseUnit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moodleCourseId: BigInt(100),
          semesterId: 'sem-1',
          facultyId: 'fac-1',
          code: 'CSC61101',
        }),
      })
    )
    expect(prismaMock.semesterCourseUnit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ semesterId: 'sem-1' }),
      })
    )
  })

  it('updates an existing course unit when semester or name changes', async () => {
    mockedFetchAllCourses.mockResolvedValue([
      { id: 100, shortname: 'CSC61101', fullname: 'Computer Science 1 (Updated)', categoryid: 71 },
    ])

    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) return { id: 'fac-1', moodleCategoryId: 21n }
      return null
    })
    prismaMock.semester.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 71n) return { id: 'sem-1', moodleCategoryId: 71n }
      return null
    })

    prismaMock.courseUnit.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCourseId === BigInt(100)) {
        return {
          id: 'unit-1',
          moodleCourseId: BigInt(100),
          semesterId: 'sem-old',
          facultyId: 'fac-1',
          name: 'Computer Science 1',
          code: 'CSC61101',
          isActive: false,
        }
      }
      return null
    })

    const result = await syncAcademicHierarchy()

    expect(result.stats.courses.updated).toBe(1)
    expect(prismaMock.courseUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          semesterId: 'sem-1',
          name: 'Computer Science 1 (Updated)',
          isActive: true,
        }),
      })
    )
  })
})

describe('parseYearNumber validation (Finding 4)', () => {
  // These tests exercise the validation through syncAcademicHierarchy, which
  // calls parseYearNumber internally when processing programme-year nodes.
  // We inject a single minimal tree with one programme-year whose name we vary.

  function singlePYFixture(pyName: string) {
    // Minimal flat category list:
    //   2 CAMPUSES (root), 3 NKOZI, 21 Faculty, 31 Undergraduate,
    //   41 Academic Year, 51 Programme, 61 programme-year (name = pyName),
    //   71 SEM 1 — required so the period resolver finds the configured semesterId=71n.
    return [
      { id: 2, name: 'CAMPUSES', parent: 0, depth: 1, visible: 1, path: '/2' },
      { id: 3, name: 'NKOZI', parent: 2, depth: 2, visible: 1, path: '/2/3' },
      { id: 21, name: 'Faculty of Computing', parent: 3, depth: 3, visible: 1, path: '/2/3/21' },
      { id: 31, name: 'Undergraduate', parent: 21, depth: 4, visible: 1, path: '/2/3/21/31' },
      { id: 41, name: 'Academic Year 2025/26', parent: 31, depth: 5, visible: 1, path: '/2/3/21/31/41' },
      { id: 51, name: 'Bachelor of Science in CS', parent: 41, depth: 6, visible: 1, path: '/2/3/21/31/41/51' },
      { id: 61, name: pyName, parent: 51, depth: 7, visible: 1, path: '/2/3/21/31/41/51/61' },
      { id: 71, name: 'SEM 1', parent: 61, depth: 8, visible: 1, path: '/2/3/21/31/41/51/61/71' },
    ]
  }

  beforeEach(() => {
    // Resolve faculty, level, year, programme lookups for the minimal tree
    prismaMock.faculty.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 21n) return { id: 'fac-1', moodleCategoryId: 21n, campusCode: 'NKZ', isActive: true }
      return null
    })
    prismaMock.academicLevel.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 31n) return { id: 'level-1', moodleCategoryId: 31n, facultyId: 'fac-1', isActive: true }
      return null
    })
    prismaMock.academicYear.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 41n) return { id: 'year-1', moodleCategoryId: 41n, levelId: 'level-1', isActive: true }
      return null
    })
    prismaMock.programme.findFirst.mockImplementation(async ({ where }) => {
      if (where?.moodleCategoryId === 51n) return { id: 'prog-1', moodleCategoryId: 51n, facultyId: 'fac-1', academicYearId: 'year-1', isActive: true }
      return null
    })
    prismaMock.programmeYear.findFirst.mockResolvedValue(null)
    prismaMock.semester.findFirst.mockResolvedValue(null)
  })

  it.each([
    ['Year 1', 1],
    ['Year 2', 2],
    ['Year 3', 3],
    ['Year 6', 6],
  ])('creates ProgrammeYear for valid name "%s" with year=%d', async (pyName, expectedYear) => {
    mockedFetchCategories.mockResolvedValue(singlePYFixture(pyName))
    mockedFetchAllCourses.mockResolvedValue([])

    const result = await syncAcademicHierarchy()

    expect(prismaMock.programmeYear.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ year: expectedYear }),
      })
    )
    expect(result.stats.hierarchy.skipped).toBe(0)
  })

  it.each([
    ['Year 0'],
    ['Year 7'],
    ['Year 9'],
    ['No number here'],
  ])('skips and warns for invalid programme-year name "%s"', async (pyName) => {
    mockedFetchCategories.mockResolvedValue(singlePYFixture(pyName))
    mockedFetchAllCourses.mockResolvedValue([])

    const result = await syncAcademicHierarchy()

    expect(prismaMock.programmeYear.create).not.toHaveBeenCalled()
    expect(result.stats.hierarchy.skipped).toBeGreaterThanOrEqual(1)
    expect(result.warnings.join('\n')).toMatch(/does not contain a valid year number|Skipped/)
  })
})
