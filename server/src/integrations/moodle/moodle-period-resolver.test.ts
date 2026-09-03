/**
 * moodle-period-resolver tests — explicit current-period resolution that fails
 * clearly instead of guessing.
 */
import { describe, it, expect } from 'vitest'
import { buildFixtureTree } from './__fixtures__/moodle-categories.fixture'
import { resolveMoodleCurrentPeriod } from './moodle-period-resolver'
import type { MoodleCurrentPeriodConfig } from '../../services/settings.service'

function cfg(overrides: Partial<MoodleCurrentPeriodConfig> = {}): MoodleCurrentPeriodConfig {
  return {
    academicYearId: null,
    academicYearName: null,
    semesterNumber: 1,
    semesterId: null,
    ...overrides,
  }
}

describe('resolveMoodleCurrentPeriod', () => {
  it('refuses to guess when no semester id is configured', () => {
    const res = resolveMoodleCurrentPeriod(buildFixtureTree(), cfg())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('semesterId')
  })

  it('resolves a valid semester and its academic-year ancestor', () => {
    const res = resolveMoodleCurrentPeriod(
      buildFixtureTree(),
      cfg({ semesterId: 71n, academicYearId: 41n, semesterNumber: 1 })
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.period.semester.id).toBe(71n)
      expect(res.period.semester.role).toBe('semester')
      expect(res.period.academicYear?.id).toBe(41n)
      expect(res.period.semesterNumber).toBe(1)
    }
  })

  it('errors when the configured semester id is not in the tree', () => {
    const res = resolveMoodleCurrentPeriod(buildFixtureTree(), cfg({ semesterId: 9999n }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('not found')
  })

  it('errors when the configured id points at a non-semester node', () => {
    // 62 is a collapsed programme-year node, not a semester.
    const res = resolveMoodleCurrentPeriod(buildFixtureTree(), cfg({ semesterId: 62n }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('not "semester"')
  })

  it('errors when the configured academic-year id contradicts the semester', () => {
    // 71 lives under academic year 41, not 42.
    const res = resolveMoodleCurrentPeriod(
      buildFixtureTree(),
      cfg({ semesterId: 71n, academicYearId: 42n })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('does not match')
  })
})
