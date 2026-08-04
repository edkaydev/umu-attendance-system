import { useEffect, useState } from 'react'
import { attendanceApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

export default function StudentAttendance() {
  const toast = useToast()
  const [data, setData] = useState<Awaited<ReturnType<typeof attendanceApi.my>> | null>(null)

  useEffect(() => {
    attendanceApi
      .my()
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load attendance'))
  }, [toast])

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
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

      <p className="rounded border-l-4 border-info bg-info-light px-4 py-3 text-body-sm text-text-primary">
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
          {data.units.map((u) => (
            <Card key={u.courseUnit.id}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{u.courseUnit.name}</p>
                  <p className="text-xs text-text-secondary">{u.courseUnit.code}</p>
                </div>
                <Badge status={u.status} />
              </div>
              <ProgressBar percentage={u.percentage} />
              <div className="mt-2 flex items-center justify-between text-body-sm text-text-secondary">
                <span>
                  {u.attended} of {u.sessionsHeld} sessions
                </span>
                <span className="font-semibold text-text-primary">{u.percentage}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
