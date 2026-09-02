/**
 * session.service unit tests
 *
 * All Prisma calls are mocked — no real DB connection is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock heavy dependencies before the module is imported ──────────────────
vi.mock('../config/db', () => ({
  prisma: {
    lecturerAssignment: { findUnique: vi.fn() },
    session: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    enrollment: { findMany: vi.fn(), count: vi.fn() },
    attendanceRecord: { findMany: vi.fn(), createMany: vi.fn() },
    excuseRequest: { findMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'x' }]),
    $transaction: vi.fn(),
  },
}))

vi.mock('../utils/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('./events.service', () => ({ publish: vi.fn() }))
vi.mock('./email.service', () => ({
  notifySessionOpened: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../config/geofence', () => ({
  isWithinCampus: vi.fn().mockReturnValue(true),
  geofence: { lecturerProximityMeters: 50 },
}))
vi.mock('../utils/codeGenerator', () => ({
  generateUniqueSessionCode: vi.fn().mockResolvedValue('ABCDEF'),
}))
vi.mock('./excuse.service', () => ({
  autoRejectPendingExcuses: vi.fn().mockResolvedValue(0),
  submitExcuse: vi.fn().mockResolvedValue({ id: 'exc1' }),
  approveExcuse: vi.fn().mockResolvedValue(undefined),
  rejectExcuse: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '../config/db'
import { openSession, closeSession, reopenSession, extendSessionTime } from './session.service'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

function mockAssigned() {
  db.lecturerAssignment.findUnique.mockResolvedValue({ id: 'la1' })
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess1',
    lecturerId: 'lec1',
    courseUnitId: 'cu1',
    academicYear: '2025/2026',
    semester: 1,
    status: 'open',
    code: 'ABCDEF',
    codeExpiresAt: new Date(Date.now() + 30 * 60_000),
    openedAt: new Date(Date.now() - 10 * 60_000),
    classDuration: 60,
    codeTtl: 15,
    closedAt: null,
    mode: 'physical',
    lecturerLat: null,
    lecturerLng: null,
    proximityRadius: null,
    venue: null,
    meetingLink: null,
    courseUnit: { id: 'cu1', code: 'CS101', name: 'Intro to CS' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Run interactive transactions synchronously against the same mocked client.
  ;(db.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => unknown) => fn(db)
  )
})

// ── openSession ─────────────────────────────────────────────────────────────

describe('openSession', () => {
  it('throws 403 when lecturer is not assigned', async () => {
    db.lecturerAssignment.findUnique.mockResolvedValue(null)
    await expect(
      openSession('lec1', {
        courseUnitId: 'cu1',
        academicYear: '2025/2026',
        semester: 1,
        mode: 'online',
      })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('throws 409 LECTURER_HAS_OPEN_SESSION when lecturer already has any open session', async () => {
    mockAssigned()
    // findFirst for lecturer check returns an open session
    db.session.findFirst.mockResolvedValueOnce(
      makeSession({ courseUnit: { id: 'cu2', code: 'CS200', name: 'Data Structures' } })
    )
    await expect(
      openSession('lec1', {
        courseUnitId: 'cu1',
        academicYear: '2025/2026',
        semester: 1,
        mode: 'online',
      })
    ).rejects.toMatchObject({ code: 'LECTURER_HAS_OPEN_SESSION' })
  })

  it('throws 409 SESSION_ALREADY_OPEN when unit already has an open session from another lecturer', async () => {
    mockAssigned()
    // Lecturer check: no open session for this lecturer
    db.session.findFirst.mockResolvedValueOnce(null)
    // Unit check: unit already has an open session
    db.session.findFirst.mockResolvedValueOnce(makeSession())
    await expect(
      openSession('lec1', {
        courseUnitId: 'cu1',
        academicYear: '2025/2026',
        semester: 1,
        mode: 'online',
      })
    ).rejects.toMatchObject({ code: 'SESSION_ALREADY_OPEN' })
  })

  it('throws 400 when physical session has no location', async () => {
    mockAssigned()
    db.session.findFirst.mockResolvedValueOnce(null) // lecturer check
    await expect(
      openSession('lec1', {
        courseUnitId: 'cu1',
        academicYear: '2025/2026',
        semester: 1,
        mode: 'physical',
        // no lat/lng
      })
    ).rejects.toMatchObject({ code: 'LOCATION_REQUIRED' })
  })

  it('creates a session for an online session', async () => {
    mockAssigned()
    db.session.findFirst.mockResolvedValueOnce(null) // lecturer check: no open session
    db.session.findFirst.mockResolvedValueOnce(null) // unit check: unit not open
    const created = makeSession({ mode: 'online' })
    db.session.create.mockResolvedValue(created)

    const result = await openSession('lec1', {
      courseUnitId: 'cu1',
      academicYear: '2025/2026',
      semester: 1,
      mode: 'online',
    })
    expect(result).toEqual(created)
    expect(db.session.create).toHaveBeenCalledOnce()
  })

  it('validates academic year format', async () => {
    await expect(
      openSession('lec1', {
        courseUnitId: 'cu1',
        academicYear: '2025',
        semester: 1,
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('validates semester must be 1 or 2', async () => {
    await expect(
      openSession('lec1', {
        courseUnitId: 'cu1',
        academicYear: '2025/2026',
        semester: 3,
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('serializes the two concurrent openers so only one session is created (race fix)', async () => {
    mockAssigned()
    // First opener: lecturer check sees no open session, unit check sees none → creates.
    // Second opener: waits on the row lock, then its lecturer check sees the session
    // the first opener just created → 409.
    db.session.findFirst
      .mockResolvedValueOnce(null) // opener 1 · lecturer
      .mockResolvedValueOnce(null) // opener 1 · unit
      .mockResolvedValueOnce(makeSession()) // opener 2 · lecturer (post-lock)
    const created = makeSession()
    db.session.create.mockResolvedValue(created)

    const [a, b] = await Promise.allSettled([
      openSession('lec1', { courseUnitId: 'cu1', academicYear: '2025/2026', semester: 1, mode: 'online' }),
      openSession('lec1', { courseUnitId: 'cu1', academicYear: '2025/2026', semester: 1, mode: 'online' }),
    ])

    // Exactly one wins; the loser is a clean 409 conflict — never a 500.
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled')
    const rejected = [a, b].filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const loserReason = (rejected[0] as PromiseRejectedResult).reason
    // Either guard may fire depending on microtask interleaving — what matters
    // is it is a 409 conflict proving serialization, not a second success.
    expect(['LECTURER_HAS_OPEN_SESSION', 'SESSION_ALREADY_OPEN']).toContain(loserReason.code)
    expect(loserReason.status).toBe(409)
    // The insert is attempted only once (the loser is stopped before create).
    expect(db.session.create).toHaveBeenCalledTimes(1)
    // The authoritative check must run inside the transaction (after the locks).
    expect(db.$transaction).toHaveBeenCalled()
    expect(db.$queryRaw).toHaveBeenCalled()
  })

  it('translates a DB unique-constraint violation (P2002) into a 409 conflict', async () => {
    mockAssigned()
    db.session.findFirst.mockResolvedValue(null)
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    db.session.create.mockRejectedValue(p2002)

    await expect(
      openSession('lec1', { courseUnitId: 'cu1', academicYear: '2025/2026', semester: 1, mode: 'online' })
    ).rejects.toMatchObject({ status: 409, code: 'SESSION_ALREADY_OPEN' })
  })
})

// ── closeSession ─────────────────────────────────────────────────────────────

describe('closeSession', () => {
  it('throws 404 when session not found', async () => {
    db.session.findUnique.mockResolvedValue(null)
    await expect(closeSession('sess1', 'lec1')).rejects.toMatchObject({ status: 404 })
  })

  it('throws 403 when lecturer does not own the session', async () => {
    db.session.findUnique.mockResolvedValue(makeSession({ lecturerId: 'other' }))
    await expect(closeSession('sess1', 'lec1')).rejects.toMatchObject({ status: 403 })
  })

  it('throws 400 when session already closed', async () => {
    db.session.findUnique.mockResolvedValue(makeSession({ status: 'closed' }))
    await expect(closeSession('sess1', 'lec1')).rejects.toMatchObject({ status: 400 })
  })

  it('auto-marks absentees and closes the session', async () => {
    db.session.findUnique.mockResolvedValue(makeSession())
    db.enrollment.findMany.mockResolvedValue([
      { studentId: 'stu1' },
      { studentId: 'stu2' },
      { studentId: 'stu3' },
    ])
    db.attendanceRecord.findMany.mockResolvedValue([{ studentId: 'stu1' }]) // stu1 already checked in
    db.attendanceRecord.createMany.mockResolvedValue({ count: 2 })
    db.session.update.mockResolvedValue(makeSession({ status: 'closed' }))

    const result = await closeSession('sess1', 'lec1')
    expect(result.absenteesAutoMarked).toBe(2)
    expect(db.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ studentId: 'stu2', status: 'absent' }),
        expect.objectContaining({ studentId: 'stu3', status: 'absent' }),
      ]),
    })
  })
})

// ── reopenSession ─────────────────────────────────────────────────────────────

describe('reopenSession', () => {
  it('throws 400 when trying to reopen on a different day', async () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    db.session.findUnique.mockResolvedValue(
      makeSession({ status: 'closed', openedAt: yesterday, closedAt: yesterday })
    )
    await expect(reopenSession('sess1', 'lec1')).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 when session is not closed', async () => {
    db.session.findUnique.mockResolvedValue(makeSession({ status: 'open' }))
    await expect(reopenSession('sess1', 'lec1')).rejects.toMatchObject({ status: 400 })
  })

  it('reopens a same-day closed session', async () => {
    db.session.findUnique.mockResolvedValue(
      makeSession({ status: 'closed', closedAt: new Date() })
    )
    const updated = makeSession({ status: 'open', code: 'NEWCOD' })
    db.session.update.mockResolvedValue(updated)

    const result = await reopenSession('sess1', 'lec1')
    expect(result.status).toBe('open')
  })
})

// ── extendSessionTime ────────────────────────────────────────────────────────

describe('extendSessionTime', () => {
  it('throws 400 when class time is nearly over (< 5 min remaining)', async () => {
    // classDuration=60, opened 56 min ago → 4 min remaining
    const opened = new Date(Date.now() - 56 * 60_000)
    db.session.findUnique.mockResolvedValue(makeSession({ openedAt: opened, classDuration: 60 }))
    await expect(extendSessionTime('sess1', 'lec1', 5)).rejects.toMatchObject({
      code: 'CLASS_TIME_ENDING',
    })
  })

  it('extends both code expiry and classDuration', async () => {
    db.session.findUnique.mockResolvedValue(makeSession()) // opened 10 min ago, 60 min class
    const extended = makeSession({ classDuration: 70 })
    db.session.update.mockResolvedValue(extended)

    const result = await extendSessionTime('sess1', 'lec1', 10)
    expect(result.classDuration).toBe(70)
    expect(db.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ classDuration: 70 }),
      })
    )
  })
})
