import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

type DashData = Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>

function Stat({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: number | string
  variant?: 'default' | 'danger' | 'warning'
}) {
  const colour =
    variant === 'danger'
      ? 'text-danger'
      : variant === 'warning'
      ? 'text-warning'
      : 'text-text-primary'
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-white p-4">
      <span className={`text-h2 font-bold leading-none ${colour}`}>{value}</span>
      <span className="text-body-sm text-text-secondary">{label}</span>
    </div>
  )
}

export default function FacultyAdminDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<DashData | null>(null)

  useEffect(() => {
    dashboardApi
      .facultyAdmin()
      .then(setData)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard')
      )
  }, [toast])

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  // Faculty not yet assigned to this admin — show a clear setup prompt
  if ((data as { facultyNotAssigned?: boolean }).facultyNotAssigned) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-light">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-warning">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h1 className="text-h2 font-bold text-text-primary">Faculty not assigned</h1>
        <p className="max-w-sm text-body text-text-secondary">
          Your account has not been linked to a faculty yet. Please contact the System Admin to assign you to the correct faculty.
        </p>
        <p className="text-body-sm text-text-disabled">
          Once assigned, this dashboard will show your faculty's attendance data.
        </p>
      </div>
    )
  }

  const criticalAlerts = data.activeAlerts.filter((a) => a.alertType === 'critical')
  const warningAlerts  = data.activeAlerts.filter((a) => a.alertType === 'warning')

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">
            {user?.faculty?.name ?? 'Faculty Admin'}
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            Attendance overview for your faculty
          </p>
        </div>
        <Link
          to="/faculty-admin/reports"
          className="inline-flex min-h-[44px] items-center rounded bg-umu-red px-6 text-body font-semibold text-white transition-colors hover:bg-umu-red-dark"
        >
          Generate Reports
        </Link>
      </div>

      {/* ── Critical alert banner ── */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-danger-border bg-danger-light p-4">
          <span className="mt-0.5 text-danger">
            {/* Alert icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
          <div>
            <p className="text-body font-semibold text-danger">
              {criticalAlerts.length} student{criticalAlerts.length > 1 ? 's' : ''} below the 75% eligibility threshold
            </p>
            <p className="mt-0.5 text-body-sm text-danger">
              Email alerts have been sent to the students, their lecturers, and you.
            </p>
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Course Units"    value={data.overview.courseUnits} />
        <Stat label="Students"        value={data.overview.students} />
        <Stat label="Lecturers"       value={data.overview.lecturers} />
        <Stat label="Sessions Today"  value={data.overview.sessionsToday} />
        <Stat
          label="Active Alerts"
          value={data.overview.activeAlerts}
          variant={criticalAlerts.length > 0 ? 'danger' : warningAlerts.length > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Active alerts */}
        <Card
          title={`Active Alerts (${data.activeAlerts.length})`}
          noPadding={data.activeAlerts.length > 0}
        >
          {data.activeAlerts.length === 0 ? (
            <p className="py-10 text-center text-body text-text-secondary">
              No active alerts — all students are above 80%.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.activeAlerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-text-primary">
                      {a.student.fullName}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {a.courseUnit.name} &middot; {a.attendancePct}% attendance
                    </p>
                    {a.student.regNumber && (
                      <p className="text-body-sm text-text-disabled">{a.student.regNumber}</p>
                    )}
                  </div>
                  <Badge status={a.alertType} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Programme summary */}
        <Card
          title="Programmes"
          noPadding={data.programmeSummary.length > 0}
        >
          {data.programmeSummary.length === 0 ? (
            <p className="py-10 text-center text-body text-text-secondary">No programmes configured.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.programmeSummary.map((p) => (
                <li key={p.programme.id} className="px-5 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-body font-medium text-text-primary">{p.programme.name}</span>
                      <span className="ml-2 text-body-sm text-text-secondary">({p.programme.code})</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.unitsBelowThreshold > 0 && (
                        <span className="text-body-sm text-danger">
                          {p.unitsBelowThreshold} unit{p.unitsBelowThreshold > 1 ? 's' : ''} below 75%
                        </span>
                      )}
                      <span className="text-body font-semibold text-text-primary">
                        {p.avgAttendance === null ? '—' : `${p.avgAttendance}%`}
                      </span>
                    </div>
                  </div>
                  <ProgressBar percentage={p.avgAttendance ?? 0} />
                  <p className="mt-1 text-body-sm text-text-disabled">{p.students} enrolled students</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Lecturers table ── */}
      <Card title="Lecturers" noPadding={data.lecturerSummary.length > 0}>
        {data.lecturerSummary.length === 0 ? (
          <p className="py-10 text-center text-body text-text-secondary">
            No lecturers assigned to this faculty yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Lecturer
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Units
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Sessions Held
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Avg Attendance
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.lecturerSummary.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-surface-1">
                    <td className="px-5 py-3">
                      <p className="text-body font-medium text-text-primary">{l.fullName}</p>
                      <p className="text-body-sm text-text-secondary">{l.email}</p>
                    </td>
                    <td className="px-4 py-3 text-body text-text-secondary">{l.units}</td>
                    <td className="px-4 py-3 text-body text-text-secondary">{l.sessions}</td>
                    <td className="px-4 py-3">
                      {l.avgAttendance === null ? (
                        <span className="text-body text-text-disabled">—</span>
                      ) : (
                        <span
                          className={`text-body font-semibold ${
                            l.avgAttendance < 75
                              ? 'text-danger'
                              : l.avgAttendance <= 80
                              ? 'text-warning'
                              : 'text-success'
                          }`}
                        >
                          {l.avgAttendance}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/reports/lecturer/${l.id}/pdf`}
                        className="text-body-sm font-medium text-umu-red hover:underline"
                      >
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <Link
          to="/faculty-admin/reports"
          className="text-body font-medium text-umu-red hover:underline"
        >
          Reports →
        </Link>
      </div>
    </div>
  )
}
