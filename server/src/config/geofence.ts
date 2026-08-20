import { distanceMeters } from '../utils/geo'

function floatEnv(key: string, fallback: number): number {
  const v = Number(process.env[key])
  return Number.isFinite(v) ? v : fallback
}

/**
 * Campus geo-fence centre + radius, read from env vars.
 * Defaults to Nkozi Campus coordinates with a 500 m radius.
 */
export const geofence = {
  campusLat:    floatEnv('CAMPUS_LAT', 0.00389),
  campusLng:    floatEnv('CAMPUS_LNG', 32.01353),
  radiusMeters: floatEnv('CAMPUS_RADIUS_METERS', 500),

  /**
   * How close (in metres) a student must be to the lecturer's recorded
   * position to pass the proximity check.  Default 50 m.
   */
  lecturerProximityMeters: floatEnv('LECTURER_PROXIMITY_RADIUS_METERS', 50),
}

/** True when a physical check-in at (lat, lng) is inside the campus radius. */
export function isWithinCampus(lat: number, lng: number): boolean {
  return distanceMeters(lat, lng, geofence.campusLat, geofence.campusLng) <= geofence.radiusMeters
}

/**
 * True when a student at (studentLat, studentLng) is within the configured
 * proximity radius of the lecturer at (lecturerLat, lecturerLng).
 *
 * @param overrideRadius  Per-session radius stored at session-open time (optional).
 *                        Falls back to the env-var default when not set.
 */
export function isNearLecturer(
  studentLat: number,
  studentLng: number,
  lecturerLat: number,
  lecturerLng: number,
  overrideRadius?: number | null
): boolean {
  const radius = overrideRadius ?? geofence.lecturerProximityMeters
  return distanceMeters(studentLat, studentLng, lecturerLat, lecturerLng) <= radius
}
