import { useEffect, useState } from 'react'
import { attendanceApi, checkinApi } from '../api/endpoints'
import type { LiveSessionForStudent } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

export default function StudentAttendance() {
  const toast = useToast()
  const [data, setData] = useState<Awaited<ReturnType<typeof attendanceApi.my>> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [live, setLive] = useState<LiveSessionForStudent[]>([])

  useEffect(() => {
    attendanceApi
      .my()
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load attendance'))
      .finally(() => setLoaded(true))

    checkinApi
      .live()
      .then(setLive)
      .catch(() => {}) // non-critical — pending indicators just won't show
  }, [toast])

  if (!loaded) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-h2 font-bold text-text-primary">Could not load attendance</h1>
        <p className="max-w-sm text-body text-text-secondary">
          There was a problem loading your attendance records. Please refresh the page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">My Attendance</h1>
        <p className="text-body-sm text-text-secondary">
          {data.period
            ? `Academic Year ${data.period.academicYear} · Semester ${data.period.semester}`
            : 'No enrollments found yet'}
        </p>
      </div>

      <p className="rounded border border-border bg-surface-1 px-4 py-3 text-body-sm text-text-secondary">
        Minimum requirement is 80% attendance per course unit. Below 80% you receive a warning;
        below 75% you become ineligible to sit the examination.
      </p>

      {data.units.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-body-sm text-text-secondary">
            Attendance records will appear here once your lecturers hold and close sessions.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.units.map((u) => {
            // Unit has a live open session where student already checked in — pending update
            const liveForUnit = live.find(
              (s) => s.courseUnit.id === u.courseUnit.id && s.checkedIn
            )
            return (
              <Card key={u.courseUnit.id}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{u.courseUnit.name}</p>
                    <p className="text-xs text-text-secondary">{u.courseUnit.code}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge status={u.status} />
                    {liveForUnit && (
                      <span className="inline-flex items-center rounded-full border border-warning-border bg-warning-light px-2 py-0.5 text-xs font-medium text-warning">
                        Session in progress
                      </span>
                    )}
                  </div>
                </div>
                <ProgressBar percentage={u.percentage} />
                <div className="mt-2 flex items-center justify-between text-body-sm text-text-secondary">
                  <span>
                    {u.attended} of {u.sessionsHeld} closed sessions
                  </span>
                  <span className="font-semibold text-text-primary">{u.percentage}%</span>
                </div>
                {liveForUnit && (
                  <p className="mt-1.5 text-xs text-text-disabled">
                    ✓ Checked in · attendance updates when the lecturer closes the session
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
