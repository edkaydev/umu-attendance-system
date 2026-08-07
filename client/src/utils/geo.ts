/**
 * Promise wrapper around the browser Geolocation API.
 *
 * Rejects with a typed GeoError so callers can produce helpful messages for
 * each failure mode (permission denied, unavailable, timeout).
 */

export type GeoErrorKind = 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED'

export class GeoError extends Error {
  constructor(
    public readonly kind: GeoErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'GeoError'
  }
}

export interface Coords {
  lat: number
  lng: number
}

/**
 * Returns the device's current GPS position.
 * Resolves with { lat, lng } on success.
 * Rejects with a GeoError on failure.
 *
 * @param timeoutMs  How long to wait for a fix before giving up (default 10 s).
 */
export function getCurrentPosition(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new GeoError('UNSUPPORTED', 'Your browser does not support location services.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        switch (err.code) {
          case GeolocationPositionError.PERMISSION_DENIED:
            reject(
              new GeoError(
                'PERMISSION_DENIED',
                'Location permission was denied. Please allow location access and try again.'
              )
            )
            break
          case GeolocationPositionError.POSITION_UNAVAILABLE:
            reject(
              new GeoError(
                'POSITION_UNAVAILABLE',
                'Your location could not be determined. Make sure GPS is enabled.'
              )
            )
            break
          case GeolocationPositionError.TIMEOUT:
            reject(
              new GeoError('TIMEOUT', 'Location request timed out. Please try again.')
            )
            break
          default:
            reject(new GeoError('POSITION_UNAVAILABLE', 'An unknown location error occurred.'))
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0, // always get a fresh fix; no cached position
      }
    )
  })
}
