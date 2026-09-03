/**
 * moodle-sync.service unit tests
 *
 * Focus on orchestration logic and role mapping. All external I/O (Moodle
 * HTTP APIs, Prisma, settings, audit) is mocked — no real DB or network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock heavy dependencies before the module is imported ──────────────────
// vi.hoisted lets the top-level mock fixture be referenced from hoisted
// vi.mock factories (who otherwise cannot see module-scope variables).
const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      syncRun: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      courseUnit: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      enrollment: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
      lecturerAssignment: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
      semester: { findUnique: vi.fn() },
      lecturerFaculty: { deleteMany: vi.fn(), createMany: vi.fn() },
      $transaction: vi.fn(async (fns: unknown[]) => {
        for (const fn of fns) await fn
      }),
    },
  }
})

vi.mock('../config/db', () => ({ prisma: prismaMock }))

vi.mock('../utils/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

vi.mock('../config/moodle', () => ({
  isMoodleConfigured: vi.fn(() => true),
}))

vi.mock('../integrations/moodle/moodle.users', () => ({
  fetchSiteInfo: vi.fn(),
}))
vi.mock('../integrations/moodle/moodle.courses', () => ({
  fetchAllCourses: vi.fn(),
}))
vi.mock('../integrations/moodle/moodle.enrolments', () => ({
  fetchEnrolledUsers: vi.fn(),
}))

vi.mock('./moodle-hierarchy-sync.service', () => ({
  syncAcademicHierarchy: vi.fn().mockResolvedValue({
    stats: {
      hierarchy: { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 },
      courses: { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 },
    },
    moodleCourseIds: [],
    warnings: [],
  }),
}))

vi.mock('./settings.service', () => ({
  isMoodleConfigured: vi.fn(() => true),
  getDefaultUserPasswordHash: vi.fn().mockResolvedValue('hashed-default'),
  getCurrentPeriod: vi.fn().mockResolvedValue({ academicYear: '2025/2026', semester: 1 }),
}))

import { isMoodleConfigured } from '../config/moodle'
import { fetchSiteInfo } from '../integrations/moodle/moodle.users'
import { fetchAllCourses } from '../integrations/moodle/moodle.courses'
import { fetchEnrolledUsers } from '../integrations/moodle/moodle.enrolments'
import { prisma } from '../config/db'
import { runFullSync, testMoodleConnection, getLastSyncStatus } from './moodle-sync.service'
import { syncAcademicHierarchy } from './moodle-hierarchy-sync.service'

const mocked = {
  fetchSiteInfo: fetchSiteInfo as ReturnType<typeof vi.fn>,
  fetchAllCourses: fetchAllCourses as ReturnType<typeof vi.fn>,
  fetchEnrolledUsers: fetchEnrolledUsers as ReturnType<typeof vi.fn>,
  isMoodleConfigured: isMoodleConfigured as ReturnType<typeof vi.fn>,
  syncAcademicHierarchy: syncAcademicHierarchy as ReturnType<typeof vi.fn>,
  syncRunCreate: (prismaMock.syncRun.create as ReturnType<typeof vi.fn>),
  syncRunUpdate: (prismaMock.syncRun.update as ReturnType<typeof vi.fn>),
  courseUnitFindFirst: (prismaMock.courseUnit.findFirst as ReturnType<typeof vi.fn>),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.isMoodleConfigured.mockReturnValue(true)
  prismaMock.syncRun.create.mockResolvedValue({ id: 'run1' })
  prismaMock.syncRun.update.mockResolvedValue({ id: 'run1' })
  prismaMock.courseUnit.findFirst.mockResolvedValue(null)
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.semester.findUnique.mockResolvedValue(null)
  prismaMock.lecturerAssignment.findMany.mockResolvedValue([])
  prismaMock.lecturerFaculty.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.lecturerFaculty.createMany.mockResolvedValue({ count: 0 })
  prismaMock.$transaction.mockImplementation(async (fns: unknown[]) => {
    for (const fn of fns) await fn
  })
  mocked.syncAcademicHierarchy.mockResolvedValue({
    stats: {
      hierarchy: { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 },
      courses: { fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, conflicts: 0, errors: 0 },
    },
    moodleCourseIds: [],
    warnings: [],
  })
})

describe('testMoodleConnection', () => {
  it('returns non-configured when Moodle env missing', async () => {
    mocked.isMoodleConfigured.mockReturnValue(false)
    const result = await testMoodleConnection()
    expect(result).toEqual({ configured: false })
    expect(mocked.fetchSiteInfo).not.toHaveBeenCalled()
  })

  it('returns site info when configured', async () => {
    mocked.fetchSiteInfo.mockResolvedValue({
      siteName: 'UMU',
      siteUrl: 'https://moodle.umu.ac.ug',
      release: '5.0.2',
      version: '2024042200',
      serviceUsername: 'umu_sync_admin',
      availableFunctions: ['core_webservice_get_site_info'],
    })
    const result = await testMoodleConnection()
    expect(result.configured).toBe(true)
    expect(result.siteName).toBe('UMU')
  })
})

describe('getLastSyncStatus', () => {
  it('returns the most recent sync run', async () => {
    prismaMock.syncRun.findFirst.mockResolvedValue({ id: 'run1', startedAt: new Date(), status: 'success' })
    const { lastRun } = await getLastSyncStatus()
    expect(lastRun?.id).toBe('run1')
  })
})

describe('runFullSync', () => {
  it('throws when Moodle is not configured', async () => {
    mocked.isMoodleConfigured.mockReturnValue(false)
    await expect(runFullSync('actor')).rejects.toThrow(/not configured/i)
  })

  it('runs an empty sync cleanly when no courses map', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.courseUnit.findFirst.mockResolvedValue(null) // no course matches

    const result = await runFullSync('actor-1')

    expect(prismaMock.syncRun.create).toHaveBeenCalled()
    expect(prismaMock.syncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run1' },
        data: expect.objectContaining({ status: 'success' }),
      })
    )
    // No users or enrolments fetched because there are no mapped courses
    expect(mocked.fetchEnrolledUsers).not.toHaveBeenCalled()
    expect(result.warnings).toEqual([])
  })

  it('maps courses, syncs users and enrolments', async () => {
    mocked.fetchAllCourses.mockResolvedValue([
      { id: 10, shortname: 'CS101', fullname: 'Intro to CS' },
    ])
    // course shortname CS101 → CourseUnit code CS101
    prismaMock.courseUnit.findFirst.mockResolvedValue({
      id: 'unit1',
      code: 'CS101',
      moodleCourseId: null,
    })
    prismaMock.courseUnit.findUnique.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })
    prismaMock.courseUnit.update.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })

    mocked.fetchEnrolledUsers.mockResolvedValue([
      {
        id: 100,
        email: 'student@stud.umu.ac.ug',
        fullname: 'Alice Student',
        firstname: 'Alice',
        lastname: 'Student',
        roles: [{ shortname: 'student' }],
      },
      {
        id: 200,
        email: 'teacher@umu.ac.ug',
        fullname: 'Bob Teacher',
        firstname: 'Bob',
        lastname: 'Teacher',
        roles: [{ shortname: 'editingteacher' }],
      },
    ])

    // All user lookups return null → both users are brand new (created).
    // The sync actor also comes back null, so a fresh one is created too.
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockImplementation(async ({ data }: { data: { email: string } }) => ({
      id: data.email === 'student@stud.umu.ac.ug' ? 'stu1'
        : data.email === 'teacher@umu.ac.ug' ? 'lec1'
        : 'sys-actor',
      ...(data as object),
    }))

    // findMany emulates the moodleUserId-in filter so student/lecturer
    // lookups within the enrolled set resolve to the right Attendance user.
    prismaMock.user.findMany.mockImplementation(async ({ where }: { where: { moodleUserId?: { in?: bigint[] } } }) => {
      const wanted = where?.moodleUserId?.in ?? []
      const all = [
        { id: 'stu1', moodleUserId: BigInt(100) },
        { id: 'lec1', moodleUserId: BigInt(200) },
      ]
      return all.filter((u) => wanted.includes(u.moodleUserId))
    })

    prismaMock.enrollment.findUnique.mockResolvedValue(null)
    prismaMock.enrollment.create.mockResolvedValue({ id: 'enr1' })
    prismaMock.enrollment.findMany.mockResolvedValue([])
    prismaMock.lecturerAssignment.findUnique.mockResolvedValue(null)
    prismaMock.lecturerAssignment.create.mockResolvedValue({ id: 'assign1' })

    const result = await runFullSync('actor-1')

    // 1 course linked (updated), 2 users created,
    // 1 student enrolment + 1 lecturer assignment (both under "enrolments")
    expect(result.courses.updated).toBe(1)
    expect(result.users.created).toBe(2)
    expect(result.enrolments.created).toBe(2)
    expect(result.enrolments.updated).toBe(0)
    expect(result.users.errors).toBe(0)
    expect(result.enrolments.errors).toBe(0)
  })

  it('never re-roles an existing faculty/system admin', async () => {
    mocked.fetchAllCourses.mockResolvedValue([{ id: 10, shortname: 'CS101', fullname: 'x' }])
    prismaMock.courseUnit.findFirst.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: null })
    prismaMock.courseUnit.findUnique.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })
    prismaMock.courseUnit.update.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })

    // Moodle has a "student" whose email matches an existing faculty_admin.
    mocked.fetchEnrolledUsers.mockResolvedValue([
      { id: 100, email: 'admin@umu.ac.ug', fullname: 'Admin', firstname: 'A', lastname: 'D', roles: [{ shortname: 'student' }] },
    ])

    // No moodleUserId link; email fallback finds the existing admin account.
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { email?: string; moodleUserId?: bigint } }) => {
      if (where.moodleUserId !== undefined) return null
      if (where.email === 'admin@umu.ac.ug') {
        return { id: 'admin1', fullName: 'Admin', email: 'admin@umu.ac.ug', role: 'faculty_admin', moodleUserId: null, isActive: true }
      }
      return null
    })
    prismaMock.user.update.mockResolvedValue({ id: 'admin1' })
    prismaMock.user.create.mockResolvedValue({ id: 'x' })
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.enrollment.findMany.mockResolvedValue([])

    const result = await runFullSync('actor-1')

    // The admin is skipped (not re-roled, not re-linked) and never updated/created.
    expect(result.users.skipped).toBe(1)
    expect(result.users.created).toBe(0)
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'student' }) })
    )
  })

  it('skips a Moodle student whose email domain does not match', async () => {
    mocked.fetchAllCourses.mockResolvedValue([{ id: 10, shortname: 'CS101', fullname: 'x' }])
    prismaMock.courseUnit.findFirst.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: null })
    prismaMock.courseUnit.findUnique.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })
    prismaMock.courseUnit.update.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })

    // A Moodle "student" with a non-university email domain.
    mocked.fetchEnrolledUsers.mockResolvedValue([
      { id: 100, email: 'someone@gmail.com', fullname: 'Gmail', firstname: 'G', lastname: 'U', roles: [{ shortname: 'student' }] },
    ])

    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.enrollment.findMany.mockResolvedValue([])

    const result = await runFullSync('actor-1')

    expect(result.users.skipped).toBe(1)
    expect(result.users.created).toBe(0)
    // No student account was created (only the internal sync actor may be created)
    expect(prismaMock.user.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'someone@gmail.com' }) })
    )
  })
})

describe('auto-assign lecturer faculties', () => {
  it('creates LecturerFaculty for unprofiled lecturers with course assignments', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    // One unprofiled lecturer with moodleUserId
    prismaMock.user.findMany.mockImplementation(async ({ where }) => {
      if (where?.role === 'lecturer') {
        return [{ id: 'lec1', fullName: 'Bob Teacher' }]
      }
      return [] // students
    })
    // Lecturer has one course assignment
    prismaMock.lecturerAssignment.findMany.mockResolvedValue([
      { courseUnit: { facultyId: 'fac-1' } },
    ])
    prismaMock.user.update.mockResolvedValue({ id: 'lec1' })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.lecturerFaculties.created).toBe(1)
    expect(prismaMock.lecturerFaculty.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'lec1', facultyId: 'fac-1', isPrimary: true }),
        ]),
      })
    )
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lec1' },
        data: expect.objectContaining({ facultyId: 'fac-1', profileComplete: true }),
      })
    )
  })

  it('skips lecturers who already have profileComplete', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.user.findMany.mockImplementation(async ({ where }) => {
      if (where?.role === 'lecturer') {
        return [] // no unprofiled lecturers
      }
      return []
    })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.lecturerFaculties.created).toBe(0)
    expect(prismaMock.lecturerFaculty.createMany).not.toHaveBeenCalled()
  })

  it('skips lecturers with no course assignments', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.user.findMany.mockImplementation(async ({ where }) => {
      if (where?.role === 'lecturer') {
        return [{ id: 'lec1', fullName: 'No Courses' }]
      }
      return []
    })
    prismaMock.lecturerAssignment.findMany.mockResolvedValue([])

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.lecturerFaculties.skipped).toBe(1)
    expect(prismaMock.lecturerFaculty.createMany).not.toHaveBeenCalled()
  })
})

describe('auto-assign student programme', () => {
  it('assigns programme from majority of course enrolments', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    // No unprofiled lecturers, one unprofiled student
    prismaMock.user.findMany.mockImplementation(async ({ where }) => {
      if (where?.role === 'lecturer') return []
      if (where?.role === 'student') return [{ id: 'stu1', fullName: 'Alice Student' }]
      return []
    })
    // Student has 2 enrolments, both in same programme
    prismaMock.enrollment.findMany.mockImplementation(async ({ where }) => {
      if (where?.studentId === 'stu1') {
        return [
          { courseUnit: { semesterId: 'sem-1', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-1', facultyId: 'fac-1' } },
        ]
      }
      return []
    })
    prismaMock.semester.findUnique.mockResolvedValue({
      number: 1,
      programmeYear: { year: 1, programme: { id: 'prog-1', facultyId: 'fac-1' } },
    })
    prismaMock.user.update.mockResolvedValue({ id: 'stu1' })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.studentProgrammes.created).toBe(1)
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stu1' },
        data: expect.objectContaining({
          programmeId: 'prog-1',
          facultyId: 'fac-1',
          year: 1,
          semester: 1,
          profileComplete: true,
        }),
      })
    )
  })

  it('skips students with no enrolments', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.user.findMany.mockImplementation(async ({ where }) => {
      if (where?.role === 'lecturer') return []
      if (where?.role === 'student') return [{ id: 'stu1', fullName: 'No Enrolments' }]
      return []
    })
    prismaMock.enrollment.findMany.mockResolvedValue([])

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.studentProgrammes.skipped).toBe(1)
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ profileComplete: true }) })
    )
  })

  it('skips students who already have profileComplete', async () => {
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.user.findMany.mockImplementation(async ({ where }) => {
      // No unprofiled students returned
      if (where?.role === 'student') return []
      return []
    })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.studentProgrammes.created).toBe(0)
  })
})

// ─── Regression tests added for production fixes ──────────────────────────

describe('enrollment reconciliation — null guard (Finding 1)', () => {
  it('does NOT delete enrollment when user.findUnique returns null (ghost enrollment)', async () => {
    // A mapped course with one enrolled Moodle student
    mocked.fetchAllCourses.mockResolvedValue([{ id: 10, shortname: 'CS101', fullname: 'x' }])
    prismaMock.courseUnit.findFirst.mockResolvedValue(null) // legacy course sync: no match
    prismaMock.courseUnit.findUnique.mockResolvedValue({
      id: 'unit1',
      code: 'CS101',
      moodleCourseId: BigInt(10),
      semesterId: null,
    })

    mocked.fetchEnrolledUsers.mockResolvedValue([
      {
        id: 100,
        email: 'student@stud.umu.ac.ug',
        fullname: 'Alice',
        firstname: 'Alice',
        lastname: 'S',
        roles: [{ shortname: 'student' }],
      },
    ])

    // The enrolled Moodle student IS in the current roster (no reconciliation deletion
    // for them). But there is also a ghost enrollment row for a student (id='ghost-stu')
    // that is no longer in Moodle — and whose user record has been deleted from the DB.
    prismaMock.user.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      // Return moodle-student lookup for enrolled user
      const inFilter = (where?.moodleUserId as { in?: bigint[] } | undefined)?.in ?? []
      if (inFilter.length > 0) {
        return [{ id: 'stu1', moodleUserId: BigInt(100) }]
      }
      return []
    })

    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string; moodleUserId?: bigint } }) => {
      // The ghost student's user record returns null (deleted from DB)
      if (where.id === 'ghost-stu') return null
      // All other lookups (sync actor, etc.) return null too
      return null
    })
    prismaMock.user.create.mockResolvedValue({ id: 'sys-actor', email: 'moodle-sync@system.internal', role: 'system_admin' })

    prismaMock.enrollment.findUnique.mockResolvedValue(null) // no existing enrollment for stu1
    prismaMock.enrollment.create.mockResolvedValue({ id: 'enr1' })

    // The ghost enrollment row — studentId='ghost-stu' is NOT in the active Moodle roster
    prismaMock.enrollment.findMany.mockResolvedValue([
      { id: 'ghost-enr', studentId: 'ghost-stu' },
    ])

    prismaMock.lecturerAssignment.findUnique.mockResolvedValue(null)
    prismaMock.lecturerAssignment.findMany.mockResolvedValue([])

    await runFullSync('actor-1')

    // The ghost enrollment must NOT be deleted because the user lookup returned null
    expect(prismaMock.enrollment.delete).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ghost-enr' } })
    )
  })

  it('DOES delete enrollment when user exists AND has a non-null moodleUserId', async () => {
    mocked.fetchAllCourses.mockResolvedValue([{ id: 10, shortname: 'CS101', fullname: 'x' }])
    // Legacy course sync: findFirst by code matches the unit (not yet linked)
    prismaMock.courseUnit.findFirst.mockResolvedValue({
      id: 'unit1',
      code: 'CS101',
      moodleCourseId: null,
    })
    // After legacy sync updates moodleCourseId, findUnique by moodleCourseId returns it
    prismaMock.courseUnit.findUnique.mockImplementation(async ({ where }: { where: { moodleCourseId?: bigint } }) => {
      if (where.moodleCourseId === BigInt(10)) {
        return { id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10), semesterId: null }
      }
      return null
    })
    prismaMock.courseUnit.update.mockResolvedValue({ id: 'unit1', code: 'CS101', moodleCourseId: BigInt(10) })

    // Empty Moodle roster for this course (no one enrolled in Moodle any more)
    mocked.fetchEnrolledUsers.mockResolvedValue([])

    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string; moodleUserId?: bigint } }) => {
      if (where.id === 'stu-moodle') {
        // This student exists and has a moodleUserId — should be reconciled away
        return { id: 'stu-moodle', moodleUserId: BigInt(999) }
      }
      return null
    })
    prismaMock.user.create.mockResolvedValue({ id: 'sys-actor', email: 'moodle-sync@system.internal', role: 'system_admin' })

    // One current-period enrollment for a Moodle-synced student no longer in Moodle
    prismaMock.enrollment.findMany.mockResolvedValue([
      { id: 'stale-enr', studentId: 'stu-moodle' },
    ])
    prismaMock.enrollment.findUnique.mockResolvedValue(null)
    prismaMock.enrollment.delete.mockResolvedValue({})
    prismaMock.lecturerAssignment.findUnique.mockResolvedValue(null)
    prismaMock.lecturerAssignment.findMany.mockResolvedValue([])

    await runFullSync('actor-1')

    expect(prismaMock.enrollment.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'stale-enr' } })
    )
  })
})

describe('auto-assign student programme — tie handling (Finding 5)', () => {
  // Helper: set up no courses, no lecturers, one unprofiled student
  function setupTieBase() {
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.user.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { role?: string })?.role === 'lecturer') return []
      if ((where as { role?: string })?.role === 'student') {
        return [{ id: 'stu1', fullName: 'Alice Student' }]
      }
      return []
    })
  }

  it('skips and warns when two programmes are tied (2 vs 2)', async () => {
    setupTieBase()

    // Two courses, one from each programme — equal count
    prismaMock.enrollment.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { studentId?: string })?.studentId === 'stu1') {
        return [
          { courseUnit: { semesterId: 'sem-a', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-b', facultyId: 'fac-1' } },
        ]
      }
      return []
    })

    prismaMock.semester.findUnique.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { id?: string })?.id === 'sem-a') {
        return { number: 1, programmeYear: { year: 1, programme: { id: 'prog-A', facultyId: 'fac-1' } } }
      }
      if ((where as { id?: string })?.id === 'sem-b') {
        return { number: 1, programmeYear: { year: 1, programme: { id: 'prog-B', facultyId: 'fac-1' } } }
      }
      return null
    })

    const result = await runFullSync('actor-1')

    // Student must be skipped, not assigned
    expect(result.autoAssigned.studentProgrammes.skipped).toBe(1)
    expect(result.autoAssigned.studentProgrammes.created).toBe(0)
    // profileComplete must NOT be set
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'stu1' }, data: expect.objectContaining({ profileComplete: true }) })
    )
    // A warning naming the tied programmes must have been emitted
    expect(result.warnings.some((w) => w.includes('prog-A') && w.includes('prog-B'))).toBe(true)
  })

  it('skips and warns on a three-way tie (1 vs 1 vs 1)', async () => {
    setupTieBase()

    prismaMock.enrollment.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { studentId?: string })?.studentId === 'stu1') {
        return [
          { courseUnit: { semesterId: 'sem-a', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-b', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-c', facultyId: 'fac-1' } },
        ]
      }
      return []
    })

    prismaMock.semester.findUnique.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      const mapping: Record<string, string> = { 'sem-a': 'prog-A', 'sem-b': 'prog-B', 'sem-c': 'prog-C' }
      const progId = mapping[(where as { id?: string })?.id ?? '']
      if (!progId) return null
      return { number: 1, programmeYear: { year: 1, programme: { id: progId, facultyId: 'fac-1' } } }
    })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.studentProgrammes.skipped).toBe(1)
    expect(result.autoAssigned.studentProgrammes.created).toBe(0)
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ profileComplete: true }) })
    )
  })

  it('assigns correctly when one programme has a clear majority (3 vs 1)', async () => {
    setupTieBase()

    prismaMock.enrollment.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { studentId?: string })?.studentId === 'stu1') {
        return [
          { courseUnit: { semesterId: 'sem-a', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-a', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-a', facultyId: 'fac-1' } },
          { courseUnit: { semesterId: 'sem-b', facultyId: 'fac-1' } },
        ]
      }
      return []
    })

    prismaMock.semester.findUnique.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { id?: string })?.id === 'sem-a') {
        return { number: 1, programmeYear: { year: 2, programme: { id: 'prog-A', facultyId: 'fac-1' } } }
      }
      if ((where as { id?: string })?.id === 'sem-b') {
        return { number: 1, programmeYear: { year: 1, programme: { id: 'prog-B', facultyId: 'fac-1' } } }
      }
      return null
    })
    prismaMock.user.update.mockResolvedValue({ id: 'stu1' })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.studentProgrammes.created).toBe(1)
    expect(result.autoAssigned.studentProgrammes.skipped).toBe(0)
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stu1' },
        data: expect.objectContaining({ programmeId: 'prog-A', year: 2, profileComplete: true }),
      })
    )
  })
})

describe('auto-assign student programme — cross-semester enrolment (Finding cross-semester)', () => {
  it('always assigns currentPeriod.semester to the student profile, not the hierarchy semester node number', async () => {
    // Setup: currentPeriod.semester = 1, but the Moodle hierarchy node for the
    // enrolled course has semester.number = 2 (a data inconsistency in Moodle).
    // The student profile must use currentPeriod.semester (1), not the hierarchy
    // node value (2).
    mocked.fetchAllCourses.mockResolvedValue([])
    prismaMock.user.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { role?: string })?.role === 'lecturer') return []
      if ((where as { role?: string })?.role === 'student') {
        return [{ id: 'stu1', fullName: 'Alice Student' }]
      }
      return []
    })

    prismaMock.enrollment.findMany.mockImplementation(async ({ where }: { where?: Record<string, unknown> }) => {
      if ((where as { studentId?: string })?.studentId === 'stu1') {
        return [{ courseUnit: { semesterId: 'sem-mismatch', facultyId: 'fac-1' } }]
      }
      return []
    })

    // The hierarchy Semester node says semester.number = 2 even though the enrollment
    // was queried under currentPeriod.semester = 1.
    prismaMock.semester.findUnique.mockResolvedValue({
      number: 2,  // hierarchy node says 2
      programmeYear: { year: 1, programme: { id: 'prog-A', facultyId: 'fac-1' } },
    })
    prismaMock.user.update.mockResolvedValue({ id: 'stu1' })

    const result = await runFullSync('actor-1')

    expect(result.autoAssigned.studentProgrammes.created).toBe(1)

    // The student's semester must be currentPeriod.semester (1), NOT the
    // hierarchy node's semester.number (2).
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stu1' },
        data: expect.objectContaining({
          programmeId: 'prog-A',
          semester: 1,  // ← currentPeriod.semester, correct
          profileComplete: true,
        }),
      })
    )
  })
})
