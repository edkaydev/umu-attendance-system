import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

function StatCard({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <Card>
      <p className={`text-h3 font-bold ${danger ? 'text-danger' : 'text-text-primary'}`}>{value}</p>
      <p className="text-body-sm text-text-secondary">{label}</p>
    </Card>
  )
}

export default function FacultyAdminDashboard() {
  const toast = useToast()
  const [data, setData] = useState<Awaited<ReturnType<typeof dashboardApi.facultyAdmin>> | null>(null)

  useEffect(() => {
    dashboardApi
      .facultyAdmin()
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard'))
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
        <h1 className="text-h2 font-bold text-text-primary">Faculty Dashboard</h1>
        <p className="text-body-sm text-text-secondary">Overview of your faculty's attendance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Course Units" value={data.overview.courseUnits} />
        <StatCard label="Students" value={data.overview.students} />
        <StatCard label="Lecturers" value={data.overview.lecturers} />
        <StatCard label="Sessions Today" value={data.overview.sessionsToday} />
        <StatCard label="Active Alerts" value={data.overview.activeAlerts} danger={data.overview.activeAlerts > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Active Alerts">
          {data.activeAlerts.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No active alerts.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.activeAlerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{a.student.fullName}</p>
                    <p className="text-xs text-text-secondary">
                      {a.courseUnit.name} · {a.attendancePct}%
                    </p>
                  </div>
                  <Badge status={a.alertType} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Programme Summary">
          {data.programmeSummary.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No programmes yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.programmeSummary.map((p) => (
                <li key={p.programme.id} className="py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">{p.programme.name}</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {p.avgAttendance === null ? '—' : `${p.avgAttendance}%`}
                    </span>
                  </div>
                  <ProgressBar percentage={p.avgAttendance ?? 0} />
                  <p className="mt-1 text-xs text-text-secondary">
                    {p.students} students · {p.unitsBelowThreshold} unit(s) below 75%
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Lecturer Summary">
        {data.lecturerSummary.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-text-secondary">No lecturers in this faculty.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4">Lecturer</th>
                  <th className="py-2 pr-4">Units</th>
                  <th className="py-2 pr-4">Sessions</th>
                  <th className="py-2">Avg Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.lecturerSummary.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{l.fullName}</p>
                      <p className="text-xs text-text-secondary">{l.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{l.units}</td>
                    <td className="py-3 pr-4 text-text-secondary">{l.sessions}</td>
                    <td className="py-3 text-text-secondary">{l.avgAttendance === null ? '—' : `${l.avgAttendance}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="text-right">
        <Link to="/faculty-admin/reports" className="text-sm font-medium text-umu-red hover:underline">
          Generate reports →
        </Link>
      </div>
    </div>
  )
}
