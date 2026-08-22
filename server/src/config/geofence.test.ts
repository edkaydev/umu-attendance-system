import { describe, expect, it } from 'vitest'
import { geofence, isNearLecturer, isWithinCampus } from './geofence'

describe('geofence defaults', () => {
  it('centres on Nkozi campus with a 500 m radius', () => {
    expect(geofence.campusLat).toBeCloseTo(0.00389)
    expect(geofence.campusLng).toBeCloseTo(32.01353)
    expect(geofence.radiusMeters).toBe(500)
    expect(geofence.lecturerProximityMeters).toBe(50)
  })
})

describe('isWithinCampus', () => {
  it('accepts the campus centre', () => {
    expect(isWithinCampus(geofence.campusLat, geofence.campusLng)).toBe(true)
  })

  it('accepts a point just inside the radius', () => {
    // ~0.0009° of latitude ≈ 100 m
    expect(isWithinCampus(geofence.campusLat + 0.0009, geofence.campusLng)).toBe(true)
  })

  it('rejects a point well outside the radius', () => {
    expect(isWithinCampus(geofence.campusLat + 0.02, geofence.campusLng)).toBe(false)
  })
})

describe('isNearLecturer', () => {
  const lecturerLat = geofence.campusLat
  const lecturerLng = geofence.campusLng

  it('accepts a student standing with the lecturer', () => {
    expect(isNearLecturer(lecturerLat, lecturerLng, lecturerLat, lecturerLng)).toBe(true)
  })

  it('rejects a student beyond the default 50 m proximity', () => {
    // ~0.0018° of latitude ≈ 200 m
    expect(isNearLecturer(lecturerLat + 0.0018, lecturerLng, lecturerLat, lecturerLng)).toBe(false)
  })

  it('honours a wider per-session override radius', () => {
    expect(
      isNearLecturer(lecturerLat + 0.0018, lecturerLng, lecturerLat, lecturerLng, 300)
    ).toBe(true)
  })

  it('honours a tighter per-session override radius', () => {
    // ~0.00027° of latitude ≈ 30 m: inside the default 50 m, outside a 10 m override
    expect(isNearLecturer(lecturerLat + 0.00027, lecturerLng, lecturerLat, lecturerLng)).toBe(true)
    expect(
      isNearLecturer(lecturerLat + 0.00027, lecturerLng, lecturerLat, lecturerLng, 10)
    ).toBe(false)
  })

  it('falls back to the default radius when the override is null', () => {
    expect(
      isNearLecturer(lecturerLat + 0.0018, lecturerLng, lecturerLat, lecturerLng, null)
    ).toBe(false)
  })
})
