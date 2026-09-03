/**
 * moodle-sync.integration.test.ts — Phase 5: full end-to-end pipeline test.
 *
 * Unlike the unit tests (which stub out syncAcademicHierarchy), this test
 * exercises the REAL orchestra: `runFullSync` → `syncAcademicHierarchy` →
 * legacy course sync → user sync → enrolment sync → auto-assignment of
 * lecturer faculties and student programmes — all against a single coherent,
 * realistic simulated Moodle dataset.
 *
 * The ONLY things mocked are the external boundaries:
 *   - Moodle HTTP fetchers (fetchCategories, fetchAllCourses, fetchEnrolledUsers)
 *   - Prisma (an in-memory fake so created records are later findable, letting
 *     the hierarchy IDs flow correctly into course/user/enrolment sync)
 *   - settings + audit + config/moodle
 *
 * This proves the phases COMPOSE correctly (hierarchy IDs → enrolments →
 * auto-assignment) rather than each in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { MoodleCategory, MoodleCourse, MoodleEnrolledUser } from '../integrations/moodle/moodle.types'

/**
 * A CLEAN, unambiguous Moodle category tree for the integration test, so the
 * pipeline's composition is asserted against a `success` run rather than the
 * messy parser fixture (whose duplicate faculty names are exercised separately
 * in the parser/hierarchy unit tests).
 *
 * Structure (depth in parentheses):
 *   CAMPUSES root (1)
 *   └ NKOZI (2)
 *     └ Faculty of Computing (3)
 *       └ Undergraduate (4)
 *         └ Academic Year 2025/26 (5)
 *           └ Bachelor of Science in Computer Science (6)
 *             └ Year 1 (7)
 *               └ SEM 1 (8)   ← configured current semester
 */
function cleanCategoryFixture(): MoodleCategory[] {
  const cat = (id: number, name: string, parent: number, depth: number): MoodleCategory => ({
    id,
    name,
    parent,
    depth,
    visible: 1,
    path: `/2/${parent === 0 ? '' : parent}/${id}`.replace(/\/\//g, '/'),
  })
  return [
    cat(2, 'CAMPUSES', 0, 1),
    cat(3, 'NKOZI', 2, 2),
    cat(21, 'Faculty of Computing', 3, 3),
    cat(31, 'Undergraduate', 21, 4),
    cat(41, 'Academic Year 2025/26', 31, 5),
    cat(51, 'Bachelor of Science in Computer Science', 41, 6),
    cat(61, 'Year 1', 51, 7),
    cat(71, 'SEM 1', 61, 8),
  ]
}

// ─── In-memory fake Prisma ──────────────────────────────────────────────────
// A tiny stateful fake keyed by model. findFirst/findUnique match on the `where`
// fields the services actually use; create/update mutate the store and remember
// generated ids so downstream lookups resolve. `__raw` exposes each model store
// to the test for reading back created records and for wiring findMany.

const { prismaMock } = vi.hoisted(() => {
  type Rec = Record<string, unknown> & { id: string }

  const stores: Record<string, Rec[]> = {}
  const counters: Record<string, number> = {}

  const __raw: Record<string, Rec[]> = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (!stores[model]) stores[model] = []
        return stores[model]
      },
    }
  )

  function store(name: string): Rec[] {
    if (!stores[name]) stores[name] = []
    return stores[name]
  }
  function nextId(name: string): string {
    counters[name] = (counters[name] ?? 0) + 1
    return `${name}-${counters[name]}`
  }
  function reset() {
    for (const key of Object.keys(stores)) stores[key] = []
    for (const key of Object.keys(counters)) counters[key] = 0
  }

  /** match a record against a `where` object (equality, plus composed key unfold). */
  function matches(rec: Rec, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue
      // Prisma composite-key form: { A_B_C: { a, b, c } } → match each part.
      if (typeof v === 'object' && v !== null && k.includes('_')) {
        for (const part of k.split('_')) {
          if (!part) continue
          const want = (v as Record<string, unknown>)[part]
          if (want !== undefined && rec[part] !== want) return false
        }
        continue
      }
      if (rec[k] !== v) return false
    }
    return true
  }

  /** findMany supporting in/notIn/not filters on simple keys (BigInt-safe). */
  function findMany(name: string) {
    return vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      let list = store(name).slice()
      if (where) {
        for (const [k, v] of Object.entries(where)) {
          if (v === undefined) continue
          const f = v as { in?: unknown[]; notIn?: unknown[]; not?: unknown }
          if (f && typeof f === 'object' && 'in' in f) {
            list = list.filter((r) => f.in!.some((x) => String(x) === String(r[k])))
          } else if (f && typeof f === 'object' && 'notIn' in f) {
            list = list.filter((r) => !f.notIn!.some((x) => String(x) === String(r[k])))
          } else if (f && typeof f === 'object' && 'not' in f) {
            list = list.filter((r) => (f.not === null ? r[k] != null : String(r[k]) !== String(f.not)))
          } else {
            list = list.filter((r) => r[k] === v)
          }
        }
      }
      return list
    })
  }

  function findFirstOrUnique(name: string) {
    return vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      return store(name).find((r) => matches(r, where)) ?? null
    })
  }
  function create(name: string) {
    return vi.fn(async ({ data }: { data: Rec }) => {
      const rec: Rec = { ...data, id: nextId(name) }
      store(name).push(rec)
      return rec
    })
  }
  function update(name: string) {
    return vi.fn(async ({ where, data }: { where: { id: string }; data: Rec }) => {
      const rec = store(name).find((r) => r.id === where.id)
      if (!rec) throw new Error(`update ${name}: record ${where.id} not found`)
      Object.assign(rec, data)
      return rec
    })
  }

  /** Enrich a courseUnitId-owning record with its nested courseUnit relation. */
  function withCourseUnit(rec: Rec): Rec {
    const unit = store('courseUnit').find((u) => u.id === rec.courseUnitId)
    const copy: Rec = { ...rec }
    if (unit) copy.courseUnit = { ...unit }
    else copy.courseUnit = undefined
    return copy
  }

  // findMany that also materialises the nested `courseUnit` relation (used by
  // auto-assignment which reads a.courseUnit.facultyId / e.courseUnit.semesterId).
  function findManyWithCourseUnit(name: string) {
    const base = findMany(name)
    return vi.fn(async (args: { where?: Record<string, unknown> } = {}) => {
      const rows = await base(args)
      return rows.map(withCourseUnit)
    })
  }

  // findUnique/findFirst for semester that materialises nested programmeYear→
  // programme relations (used by student auto-assignment).
  function semesterLookup() {
    return vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const sem = store('semester').find((r) => matches(r, where)) ?? null
      if (!sem) return null
      const py = store('programmeYear').find((r) => r.id === sem.programmeYearId)
      const copy: Rec = { ...sem }
      if (py) {
        const p = store('programme').find((r) => r.id === py.programmeId)
        copy.programmeYear = { ...py, programme: p ? { ...p } : null }
      }
      return copy
    })
  }

  // findFirst for programmeYear that materialises nested programme relation.
  function programmeYearLookup() {
    return vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const py = store('programmeYear').find((r) => matches(r, where)) ?? null
      if (!py) return null
      const p = store('programme').find((r) => r.id === py.programmeId)
      return { ...py, programme: p ? { ...p } : null }
    })
  }

  const prismaMock = {
    syncRun: {
      create: vi.fn(async ({ data }) => {
        const rec: Rec = { ...data, id: nextId('syncRun'), completedAt: null, stats: null, errorSummary: null }
        store('syncRun').push(rec)
        return rec
      }),
      findFirst: vi.fn(async () => store('syncRun').slice().reverse()[0] ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Rec }) => Object.assign(store('syncRun').find((r) => r.id === where.id)!, data)),
    },

    faculty: { findFirst: findFirstOrUnique('faculty'), create: create('faculty'), update: update('faculty'), updateMany: vi.fn(async () => ({ count: 0 })) },
    academicLevel: { findFirst: findFirstOrUnique('academicLevel'), create: create('academicLevel'), update: update('academicLevel'), updateMany: vi.fn(async () => ({ count: 0 })) },
    academicYear: { findFirst: findFirstOrUnique('academicYear'), create: create('academicYear'), update: update('academicYear'), updateMany: vi.fn(async () => ({ count: 0 })) },
    programme: { findFirst: findFirstOrUnique('programme'), create: create('programme'), update: update('programme'), updateMany: vi.fn(async () => ({ count: 0 })) },
    programmeYear: { findFirst: programmeYearLookup(), create: create('programmeYear'), update: update('programmeYear'), updateMany: vi.fn(async () => ({ count: 0 })) },
    semester: {
      findFirst: semesterLookup(),
      findUnique: semesterLookup(),
      create: create('semester'),
      update: update('semester'),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    courseUnit: { findFirst: findFirstOrUnique('courseUnit'), create: create('courseUnit'), update: update('courseUnit'), findUnique: findFirstOrUnique('courseUnit') },
    semesterCourseUnit: { create: create('semesterCourseUnit') },

    user: { findUnique: findFirstOrUnique('user'), findMany: findMany('user'), create: create('user'), update: update('user') },
    enrollment: { findUnique: findFirstOrUnique('enrollment'), findMany: findManyWithCourseUnit('enrollment'), create: create('enrollment'), delete: vi.fn(async () => ({})) },
    lecturerAssignment: { findUnique: findFirstOrUnique('lecturerAssignment'), findMany: findManyWithCourseUnit('lecturerAssignment'), create: create('lecturerAssignment') },
    lecturerFaculty: {
      deleteMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        const arr = store('lecturerFaculty')
        for (let i = arr.length - 1; i >= 0; i--) {
          if (where && Object.entries(where).every(([k, v]) => arr[i][k] === v)) arr.splice(i, 1)
        }
        return { count: 0 }
      }),
      createMany: vi.fn(async ({ data }: { data: Rec | Rec[] }) => {
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) store('lecturerFaculty').push({ ...item, id: nextId('lecturerFaculty') })
        return { count: items.length }
      }),
    },

    $transaction: vi.fn(async (fns: unknown[]) => {
      for (const fn of fns) await fn
    }),

    __raw,
    __reset: reset,
  }

  return { prismaMock }
})

vi.mock('../config/db', () => ({ prisma: prismaMock }))
vi.mock('../utils/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../config/moodle', () => ({ isMoodleConfigured: vi.fn(() => true) }))
vi.mock('../integrations/moodle/moodle.users', () => ({ fetchSiteInfo: vi.fn() }))
vi.mock('../integrations/moodle/moodle.categories', () => ({ fetchCategories: vi.fn() }))
vi.mock('../integrations/moodle/moodle.courses', () => ({ fetchAllCourses: vi.fn() }))
vi.mock('../integrations/moodle/moodle.enrolments', () => ({ fetchEnrolledUsers: vi.fn() }))
vi.mock('./settings.service', () => ({
  isMoodleConfigured: vi.fn(() => true),
  getDefaultUserPasswordHash: vi.fn().mockResolvedValue('hashed-default'),
  getCurrentPeriod: vi.fn().mockResolvedValue({ academicYear: '2025/2026', semester: 1 }),
  getMoodleCurrentPeriodConfig: vi.fn().mockResolvedValue({
    academicYearId: 41n,
    academicYearName: '2025/26',
    semesterNumber: 1,
    semesterId: 71n,
  }),
}))

import { fetchCategories } from '../integrations/moodle/moodle.categories'
import { fetchAllCourses } from '../integrations/moodle/moodle.courses'
import { fetchEnrolledUsers } from '../integrations/moodle/moodle.enrolments'
import { runFullSync } from './moodle-sync.service'

const mockedCategories = fetchCategories as ReturnType<typeof vi.fn>
const mockedCourses = fetchAllCourses as ReturnType<typeof vi.fn>
const mockedEnrolledUsers = fetchEnrolledUsers as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.__reset()

  mockedCategories.mockResolvedValue(cleanCategoryFixture())
  mockedCourses.mockResolvedValue([])
  mockedEnrolledUsers.mockResolvedValue([])
})

describe('Phase 5 — full end-to-end pipeline', () => {
  it('composes hierarchy → users → enrolments → auto-assignment for one coherent dataset', async () => {
    // A Moodle course inside the current-semester category (SEM 1 = id 71),
    // whose category ancestry reaches "Faculty of Computing" (category 21).
    mockedCourses.mockResolvedValue([
      { id: 10, shortname: 'CS101', fullname: 'Introduction to Computer Science', categoryid: 71 },
    ])

    mockedEnrolledUsers.mockResolvedValue([
      {
        id: 100,
        username: 's100',
        firstname: 'Alice',
        lastname: 'Student',
        fullname: 'Alice Student',
        email: 'alice@stud.umu.ac.ug',
        idnumber: 'REG001',
        roles: [{ roleid: 5, name: 'Student', shortname: 'student', sortorder: 0 }],
      },
      {
        id: 200,
        username: 'l200',
        firstname: 'Bob',
        lastname: 'Lecturer',
        fullname: 'Bob Lecturer',
        email: 'bob@umu.ac.ug',
        roles: [{ roleid: 3, name: 'Teacher', shortname: 'editingteacher', sortorder: 0 }],
      },
    ])

    const result = await runFullSync('sysadmin-1')

    // ── 1. The sync ran cleanly: no errors and no conflicts ──
    expect(result.hierarchy.errors).toBe(0)
    expect(result.courses.errors).toBe(0)
    expect(result.users.errors).toBe(0)
    expect(result.enrolments.errors).toBe(0)
    expect(result.hierarchy.conflicts).toBe(0)

    // ── 2. Hierarchy created the academic nodes from the category tree ──
    expect(prismaMock.__raw.faculty.some((f) => f.moodleCategoryId === 21n && f.campusCode === 'NKZ')).toBe(true)
    expect(prismaMock.__raw.programme.length).toBeGreaterThan(0)
    // The current semester (SEM 1 = category 71) is materialised.
    expect(prismaMock.__raw.semester.some((s) => s.moodleCategoryId === 71n)).toBe(true)

    // ── 3. The course maps to a CourseUnit keyed by moodleCourseId=10 ──
    const unit = prismaMock.__raw.courseUnit.find((u) => u.moodleCourseId === 10n)
    expect(unit).toBeDefined()
    expect(unit!.code).toBe('CS101')
    // The unit links to the created faculty + current semester via the hierarchy.
    const faculty = prismaMock.__raw.faculty.find((f) => f.id === unit!.facultyId)
    const semester = prismaMock.__raw.semester.find((s) => s.id === unit!.semesterId)
    expect(faculty?.moodleCategoryId).toBe(21n)
    expect(semester?.moodleCategoryId).toBe(71n)

    // ── 4. Users were created from the course roster ──
    const student = prismaMock.__raw.user.find((u) => u.email === 'alice@stud.umu.ac.ug')
    const lecturer = prismaMock.__raw.user.find((u) => u.email === 'bob@umu.ac.ug')
    expect(student).toBeDefined()
    expect(student!.moodleUserId).toBe(100n)
    expect(student!.role).toBe('student')
    expect(student!.regNumber).toBe('REG001')
    expect(lecturer).toBeDefined()
    expect(lecturer!.moodleUserId).toBe(200n)
    expect(lecturer!.role).toBe('lecturer')
    expect(result.users.created).toBe(2)

    // ── 5. Enrolment + lecturer assignment created for the current period ──
    expect(prismaMock.__raw.enrollment.some((e) => e.studentId === student!.id && e.courseUnitId === unit!.id)).toBe(true)
    expect(prismaMock.__raw.lecturerAssignment.some((a) => a.lecturerId === lecturer!.id && a.courseUnitId === unit!.id)).toBe(true)
    expect(result.enrolments.created).toBe(2)

    // ── 6. Auto-assignment wired lecturer faculty + student programme ──
    // Lecturer faculty derived from the course assignment's faculty.
    expect(result.autoAssigned.lecturerFaculties.created).toBe(1)
    expect(prismaMock.__raw.lecturerFaculty.some((lf) => lf.userId === lecturer!.id)).toBe(true)
    // Student programme derived by walking CourseUnit → Semester → ProgrammeYear → Programme.
    expect(result.autoAssigned.studentProgrammes.created).toBe(1)
    const updatedStudent = prismaMock.__raw.user.find((u) => u.id === student!.id)!
    expect(updatedStudent.profileComplete).toBe(true)
    expect(updatedStudent.programmeId).toBeDefined()

    // ── 7. SyncRun recorded as success with combined stats ──
    expect(prismaMock.__raw.syncRun[0].status).toBe('success')
  })

  it('is idempotent — a second full sync changes nothing (no duplicate records)', async () => {
    mockedCourses.mockResolvedValue([
      { id: 10, shortname: 'CS101', fullname: 'Introduction to Computer Science', categoryid: 71 },
    ])
    mockedEnrolledUsers.mockResolvedValue([
      {
        id: 100,
        username: 's100',
        firstname: 'Alice',
        lastname: 'Student',
        fullname: 'Alice Student',
        email: 'alice@stud.umu.ac.ug',
        idnumber: 'REG001',
        roles: [{ roleid: 5, name: 'Student', shortname: 'student', sortorder: 0 }],
      },
      {
        id: 200,
        username: 'l200',
        firstname: 'Bob',
        lastname: 'Lecturer',
        fullname: 'Bob Lecturer',
        email: 'bob@umu.ac.ug',
        roles: [{ roleid: 3, name: 'Teacher', shortname: 'editingteacher', sortorder: 0 }],
      },
    ])

    await runFullSync('sysadmin-1')
    const unitCount = prismaMock.__raw.courseUnit.length
    const userCount = prismaMock.__raw.user.length
    const enrollmentCount = prismaMock.__raw.enrollment.length
    const assignmentCount = prismaMock.__raw.lecturerAssignment.length

    const second = await runFullSync('sysadmin-1')

    // Nothing duplicated.
    expect(prismaMock.__raw.courseUnit.length).toBe(unitCount)
    expect(prismaMock.__raw.user.length).toBe(userCount)
    expect(prismaMock.__raw.enrollment.length).toBe(enrollmentCount)
    expect(prismaMock.__raw.lecturerAssignment.length).toBe(assignmentCount)
    // No new creates on the second pass — everything is unchanged.
    expect(second.hierarchy.created).toBe(0)
    expect(second.users.created).toBe(0)
    expect(second.enrolments.created).toBe(0)
    expect(second.autoAssigned.studentProgrammes.created).toBe(0)
    expect(second.autoAssigned.lecturerFaculties.created).toBe(0)
  })
})
