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
  campusLat: floatEnv('CAMPUS_LAT', 0.00389),
  campusLng: floatEnv('CAMPUS_LNG', 32.01353),
  radiusMeters: floatEnv('CAMPUS_RADIUS_METERS', 500),
}

/** True when a physical check-in at (lat, lng) is inside the campus radius. */
export function isWithinCampus(lat: number, lng: number): boolean {
  return distanceMeters(lat, lng, geofence.campusLat, geofence.campusLng) <= geofence.radiusMeters
}
