import { useEffect, useState } from 'react'
import { settingsApi, CurrentPeriod } from '../api/endpoints'

/** Returns the global current academic period set by the System Admin.
 *  Falls back to the current academic year + semester 1 while loading. */
export function usePeriod(): { period: CurrentPeriod | null; loading: boolean } {
  const [period, setPeriod] = useState<CurrentPeriod | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsApi
      .currentPeriod()
      .then(setPeriod)
      .catch(() => {
        // graceful fallback: compute locally
        const now = new Date()
        const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
        setPeriod({ academicYear: `${y}/${y + 1}`, semester: 1 })
      })
      .finally(() => setLoading(false))
  }, [])

  return { period, loading }
}
