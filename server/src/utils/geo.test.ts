import { describe, expect, it } from 'vitest'
import { distanceMeters } from './geo'

const CAMPUS_LAT = 0.00389
const CAMPUS_LNG = 32.01353

describe('distanceMeters (haversine)', () => {
  it('returns 0 for identical points', () => {
    expect(distanceMeters(CAMPUS_LAT, CAMPUS_LNG, CAMPUS_LAT, CAMPUS_LNG)).toBe(0)
  })

  it('returns ~111 km for one degree of longitude at the equator', () => {
    const d = distanceMeters(0, 32, 0, 33)
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })

  it('puts a nearby point (~500 m) just inside a 500 m radius', () => {
    const d = distanceMeters(CAMPUS_LAT, CAMPUS_LNG, CAMPUS_LAT + 0.0045, CAMPUS_LNG)
    expect(d).toBeGreaterThan(400)
    expect(d).toBeLessThan(600)
  })

  it('puts a far point well outside the campus radius', () => {
    const d = distanceMeters(CAMPUS_LAT, CAMPUS_LNG, 0.05, 32.05)
    expect(d).toBeGreaterThan(5000)
  })
})
