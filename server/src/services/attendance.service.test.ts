/**
 * attendanceCalc + alert evaluation tests (FR-07, FR-08)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  attendancePercentage,
  attendanceStatus,
  alertLevelsForPct,
  ALERT_THRESHOLDS,
} from '../utils/attendanceCalc'

// ── attendancePercentage (FR-07.3) ─────────────────────────────────────────

describe('attendancePercentage', () => {
  it('returns 100 when no sessions have been held', () => {
    expect(attendancePercentage(0, 0)).toBe(100)
  })

  it('calculates correctly when all sessions attended', () => {
    expect(attendancePercentage(10, 10)).toBe(100)
  })

  it('calculates correctly with some absences', () => {
    expect(attendancePercentage(8, 10)).toBe(80)
  })

  it('counts excused sessions as attended', () => {
    // 7 present + 1 excused = 8 out of 10
    expect(attendancePercentage(8, 10)).toBe(80)
  })

  it('returns 0 when student attended nothing', () => {
    expect(attendancePercentage(0, 10)).toBe(0)
  })

  it('handles fractional percentages', () => {
    expect(attendancePercentage(7, 9)).toBeCloseTo(77.78, 1)
  })
})

// ── attendanceStatus (FR-07) ───────────────────────────────────────────────

describe('attendanceStatus', () => {
  it('returns good at exactly 80%', () => {
    expect(attendanceStatus(80)).toBe('good')
  })

  it('returns good above 80%', () => {
    expect(attendanceStatus(100)).toBe('good')
    expect(attendanceStatus(90)).toBe('good')
  })

  it('returns warning at 79%', () => {
    expect(attendanceStatus(79)).toBe('warning')
  })

  it('returns warning at exactly 75%', () => {
    expect(attendanceStatus(75)).toBe('warning')
  })

  it('returns not_eligible below 75%', () => {
    expect(attendanceStatus(74.9)).toBe('not_eligible')
    expect(attendanceStatus(50)).toBe('not_eligible')
    expect(attendanceStatus(0)).toBe('not_eligible')
  })
})

// ── ALERT_THRESHOLDS constants ────────────────────────────────────────────

describe('ALERT_THRESHOLDS', () => {
  it('warning threshold is 80', () => {
    expect(ALERT_THRESHOLDS.warning).toBe(80)
  })

  it('critical threshold is 75', () => {
    expect(ALERT_THRESHOLDS.critical).toBe(75)
  })
})

// ── alertLevelsForPct (FR-08.1 / FR-08.2) ────────────────────────────────

describe('alertLevelsForPct', () => {
  it('fires no alerts above 80%', () => {
    const r = alertLevelsForPct(81)
    expect(r.warning).toBe(false)
    expect(r.critical).toBe(false)
  })

  it('fires warning at exactly 80%', () => {
    const r = alertLevelsForPct(80)
    expect(r.warning).toBe(true)
    expect(r.critical).toBe(false)
  })

  it('fires warning between 75 and 80', () => {
    const r = alertLevelsForPct(77)
    expect(r.warning).toBe(true)
    expect(r.critical).toBe(false)
  })

  it('fires both warning and critical below 75%', () => {
    const r = alertLevelsForPct(74)
    expect(r.warning).toBe(true)
    expect(r.critical).toBe(true)
  })

  it('fires both at exactly 0%', () => {
    const r = alertLevelsForPct(0)
    expect(r.warning).toBe(true)
    expect(r.critical).toBe(true)
  })

  it('fires neither above threshold boundary', () => {
    const r = alertLevelsForPct(100)
    expect(r.warning).toBe(false)
    expect(r.critical).toBe(false)
  })
})

// ── alert evaluation service (FR-08) ─────────────────────────────────────

vi.mock('../config/db', () => ({
  prisma: {
    session: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    attendanceAlert: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('./email.service', () => ({ notifyAlertRecipients: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from '../config/db'
import { evaluateAttendanceAlerts } from './alert.service'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

beforeEach(() => vi.clearAllMocks())

describe('evaluateAttendanceAlerts', () => {
  const UNIT = 'cu1'
  const YEAR = '2025/2026'
  const SEM = 1

  it('returns early and creates no alerts when no sessions are closed', async () => {
    db.session.findMany.mockResolvedValue([])
    const result = await evaluateAttendanceAlerts(UNIT, YEAR, SEM)
    expect(result).toEqual({ created: [], resolved: [] })
    expect(db.attendanceAlert.create).not.toHaveBeenCalled()
  })

  it('creates a WARNING alert when student drops to exactly 80%', async () => {
    // 10 sessions, student attended 8 → 80% → warning fires
    db.session.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` })))
    db.enrollment.findMany.mockResolvedValue([{ studentId: 'stu1' }])
    db.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ studentId: 'stu1', status: i < 7 ? 'present' : 'excused' }))
    )
    db.attendanceAlert.findMany.mockResolvedValue([]) // no active alerts
    db.attendanceAlert.create.mockResolvedValue({ id: 'al1' })

    const result = await evaluateAttendanceAlerts(UNIT, YEAR, SEM)
    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({ alertType: 'warning', attendancePct: 80 })
  })

  it('creates both WARNING and CRITICAL alerts below 75%', async () => {
    // 10 sessions, student attended 7 → 70% → both fire
    db.session.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` })))
    db.enrollment.findMany.mockResolvedValue([{ studentId: 'stu1' }])
    db.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 7 }, () => ({ studentId: 'stu1', status: 'present' }))
    )
    db.attendanceAlert.findMany.mockResolvedValue([])
    db.attendanceAlert.create.mockResolvedValue({ id: 'al1' })

    const result = await evaluateAttendanceAlerts(UNIT, YEAR, SEM)
    expect(result.created).toHaveLength(2)
    const types = result.created.map((c) => c.alertType).sort()
    expect(types).toEqual(['critical', 'warning'])
  })

  it('does NOT duplicate an alert that is already active', async () => {
    // Student at 70% but warning alert already exists and unresolved
    db.session.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` })))
    db.enrollment.findMany.mockResolvedValue([{ studentId: 'stu1' }])
    db.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 7 }, () => ({ studentId: 'stu1', status: 'present' }))
    )
    db.attendanceAlert.findMany.mockResolvedValue([
      { id: 'al1', studentId: 'stu1', alertType: 'warning', resolved: false },
      { id: 'al2', studentId: 'stu1', alertType: 'critical', resolved: false },
    ])
    db.attendanceAlert.create.mockResolvedValue({ id: 'al3' })

    const result = await evaluateAttendanceAlerts(UNIT, YEAR, SEM)
    expect(result.created).toHaveLength(0) // no new alerts
    expect(db.attendanceAlert.create).not.toHaveBeenCalled()
  })

  it('resolves an alert when student recovers above threshold', async () => {
    // Student now at 85% — warning alert should be resolved
    db.session.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` })))
    db.enrollment.findMany.mockResolvedValue([{ studentId: 'stu1' }])
    db.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 9 }, () => ({ studentId: 'stu1', status: 'present' })) // 90%? no, 9/10 = 90
    )
    db.attendanceAlert.findMany.mockResolvedValue([
      { id: 'al1', studentId: 'stu1', alertType: 'warning', resolved: false },
    ])
    db.attendanceAlert.updateMany.mockResolvedValue({ count: 1 })

    const result = await evaluateAttendanceAlerts(UNIT, YEAR, SEM)
    expect(result.resolved).toBe(1)
    expect(db.attendanceAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { resolved: true } })
    )
  })

  it('fires a new alert after recovery and re-drop (FR-08.6)', async () => {
    // Student dropped again after a prior alert was resolved
    db.session.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` })))
    db.enrollment.findMany.mockResolvedValue([{ studentId: 'stu1' }])
    db.attendanceRecord.findMany.mockResolvedValue(
      Array.from({ length: 8 }, () => ({ studentId: 'stu1', status: 'present' })) // 80%
    )
    // No active (unresolved) alerts — previous one was resolved during recovery
    db.attendanceAlert.findMany.mockResolvedValue([])
    db.attendanceAlert.create.mockResolvedValue({ id: 'al2' })

    const result = await evaluateAttendanceAlerts(UNIT, YEAR, SEM)
    expect(result.created).toHaveLength(1)
    expect(result.created[0].alertType).toBe('warning')
  })
})
