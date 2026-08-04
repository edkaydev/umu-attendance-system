import { describe, it, expect } from 'vitest'
import {
  attendancePercentage,
  attendanceStatus,
  alertLevelsForPct,
  ALERT_THRESHOLDS,
} from './attendanceCalc'

describe('attendancePercentage (FR-07.3)', () => {
  it('returns (present + excused) / total × 100', () => {
    expect(attendancePercentage(4, 5)).toBeCloseTo(80)
    expect(attendancePercentage(3, 4)).toBeCloseTo(75)
    expect(attendancePercentage(9, 10)).toBeCloseTo(90)
  })

  it('returns 100 when no sessions have been held', () => {
    expect(attendancePercentage(0, 0)).toBe(100)
  })

  it('handles zero attendance', () => {
    expect(attendancePercentage(0, 5)).toBe(0)
  })

  it('treats only present and excused as attended', () => {
    // 2 present + 1 excused out of 5 → 60%
    expect(attendancePercentage(3, 5)).toBe(60)
  })
})

describe('attendanceStatus eligibility', () => {
  it('is good above 80%', () => {
    expect(attendanceStatus(81)).toBe('good')
    expect(attendanceStatus(100)).toBe('good')
  })

  it('is warning at 80% and down to 75%', () => {
    expect(attendanceStatus(80)).toBe('warning')
    expect(attendanceStatus(75)).toBe('warning')
  })

  it('is not_eligible below 75%', () => {
    expect(attendanceStatus(74.9)).toBe('not_eligible')
    expect(attendanceStatus(0)).toBe('not_eligible')
  })
})

describe('alertLevelsForPct (FR-08.1/08.2)', () => {
  it('fires warning at or below 80%', () => {
    expect(alertLevelsForPct(80).warning).toBe(true)
    expect(alertLevelsForPct(79).warning).toBe(true)
    expect(alertLevelsForPct(81).warning).toBe(false)
  })

  it('fires critical below 75% (not at exactly 75)', () => {
    expect(alertLevelsForPct(75).critical).toBe(false)
    expect(alertLevelsForPct(74.9).critical).toBe(true)
  })

  it('fires both warning and critical when deeply low', () => {
    const { warning, critical } = alertLevelsForPct(50)
    expect(warning).toBe(true)
    expect(critical).toBe(true)
  })

  it('matches the documented thresholds', () => {
    expect(ALERT_THRESHOLDS.warning).toBe(80)
    expect(ALERT_THRESHOLDS.critical).toBe(75)
  })
})
