import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db, writeAuditLog } = vi.hoisted(() => ({
  db: {
    session: { updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn(), createMany: vi.fn() },
  },
  writeAuditLog: vi.fn(),
}))

vi.mock('../config/db', () => ({ prisma: db }))
vi.mock('./audit', () => ({ writeAuditLog }))

import { startSessionScheduler, stopSessionScheduler } from './sessionScheduler'

const NOW = new Date('2025-03-01T10:00:00Z')

/** An open session opened 90 minutes ago with a 60-minute duration → overdue. */
function overdueSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    openedAt: new Date(NOW.getTime() - 90 * 60_000),
    classDuration: 60,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  db.session.findMany.mockResolvedValue([])
  db.session.updateMany.mockResolvedValue({ count: 1 })
  db.session.findUnique.mockResolvedValue({
    courseUnitId: 'cu1',
    academicYear: '2024/2025',
    semester: 1,
    lecturerId: 'lec-1',
  })
  db.enrollment.findMany.mockResolvedValue([{ studentId: 'stu-1' }, { studentId: 'stu-2' }])
  db.attendanceRecord.findMany.mockResolvedValue([{ studentId: 'stu-1' }])
  db.attendanceRecord.createMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  stopSessionScheduler()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startSessionScheduler', () => {
  it('runs a tick immediately and then once a minute', async () => {
    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    expect(db.session.findMany).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(db.session.findMany).toHaveBeenCalledTimes(2)
  })

  it('only ever starts one interval', async () => {
    startSessionScheduler()
    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(60_000)

    // The second call is a no-op: 1 immediate tick + 1 interval tick
    expect(db.session.findMany).toHaveBeenCalledTimes(2)
  })

  it('stops ticking after stopSessionScheduler()', async () => {
    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)
    stopSessionScheduler()
    await vi.advanceTimersByTimeAsync(5 * 60_000)

    expect(db.session.findMany).toHaveBeenCalledTimes(1)
  })

  it('queries only open sessions with a duration opened over a minute ago', async () => {
    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.session.findMany.mock.calls[0][0].where).toEqual({
      status: 'open',
      classDuration: { not: null },
      openedAt: { lte: new Date(NOW.getTime() - 60_000) },
    })
  })
})

describe('auto-close behaviour', () => {
  it('closes an overdue session and marks the missing students absent', async () => {
    db.session.findMany.mockResolvedValue([overdueSession()])

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'sess-1', status: 'open' },
      data: { status: 'closed', closedAt: NOW },
    })
    expect(db.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: [{ sessionId: 'sess-1', studentId: 'stu-2', status: 'absent' }],
    })
    expect(writeAuditLog).toHaveBeenCalledWith(
      'lec-1',
      'SESSION_AUTO_CLOSE',
      'session',
      'sess-1',
      { absenteesAutoMarked: 1, reason: 'classDuration elapsed' }
    )
  })

  it('leaves a session whose duration has not yet elapsed alone', async () => {
    db.session.findMany.mockResolvedValue([
      overdueSession({ openedAt: new Date(NOW.getTime() - 30 * 60_000) }),
    ])

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.session.updateMany).not.toHaveBeenCalled()
  })

  it('skips absent-marking when another tick already closed the session', async () => {
    db.session.findMany.mockResolvedValue([overdueSession()])
    db.session.updateMany.mockResolvedValue({ count: 0 })

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.session.findUnique).not.toHaveBeenCalled()
    expect(db.attendanceRecord.createMany).not.toHaveBeenCalled()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('stops if the session disappeared between the update and the lookup', async () => {
    db.session.findMany.mockResolvedValue([overdueSession()])
    db.session.findUnique.mockResolvedValue(null)

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.enrollment.findMany).not.toHaveBeenCalled()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('writes no absent records when every enrolled student checked in', async () => {
    db.session.findMany.mockResolvedValue([overdueSession()])
    db.attendanceRecord.findMany.mockResolvedValue([
      { studentId: 'stu-1' },
      { studentId: 'stu-2' },
    ])

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.attendanceRecord.createMany).not.toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      'lec-1',
      'SESSION_AUTO_CLOSE',
      'session',
      'sess-1',
      { absenteesAutoMarked: 0, reason: 'classDuration elapsed' }
    )
  })

  it('closes every overdue session in one tick', async () => {
    db.session.findMany.mockResolvedValue([
      overdueSession(),
      overdueSession({ id: 'sess-2' }),
    ])

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(db.session.updateMany.mock.calls.map((c) => c[0].where.id)).toEqual([
      'sess-1',
      'sess-2',
    ])
  })

  it('logs and survives a database failure instead of crashing the tick', async () => {
    db.session.findMany.mockRejectedValue(new Error('db down'))

    startSessionScheduler()
    await vi.advanceTimersByTimeAsync(0)

    expect(console.error).toHaveBeenCalledWith('[scheduler] tick error:', expect.any(Error))

    db.session.findMany.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(db.session.findMany).toHaveBeenCalledTimes(2)
  })
})
