import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ApiClientError } from '../api/client'

type Dashboard = Awaited<ReturnType<typeof dashboardApi.lecturer>>

export default function LecturerDashboard() {
  const toast = useToast()
  const [data, setData] = useState<Dashboard | null>(null)

  useEffect(() => {
    dashboardApi
      .lecturer()
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">Lecturer Dashboard</h1>
          <p className="text-body-sm text-text-secondary">Today's attendance at a glance.</p>
        </div>
        <Link to="/lecturer/sessions/new">
          <Button>Open Session</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-h3 font-bold text-text-primary">{data.units.length}</p>
          <p className="text-body-sm text-text-secondary">Assigned Course Units</p>
        </Card>
        <Card>
          <p className="text-h3 font-bold text-text-primary">{data.todaySessions.length}</p>
          <p className="text-body-sm text-text-secondary">Sessions Today</p>
        </Card>
        <Card>
          <p className="text-h3 font-bold text-danger">{data.atRisk.length}</p>
          <p className="text-body-sm text-text-secondary">Students At Risk</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Today's Sessions">
          {data.todaySessions.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">
              No sessions today. Open one to begin collecting attendance.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.todaySessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{s.courseUnit.name}</p>
                    <p className="text-xs text-text-secondary">
                      {new Date(s.openedAt).toLocaleTimeString()} {s.venue ? `· ${s.venue}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary">{s._count.attendanceRecords} present</span>
                    <Badge status={s.status} />
                    <Link to={s.status === 'open' ? `/lecturer/sessions/${s.id}/live` : `/lecturer/sessions/${s.id}`}>
                      <Button variant="secondary" className="min-h-[36px] px-3 py-1.5 text-xs">
                        {s.status === 'open' ? 'Live' : 'View'}
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="My Course Units">
          {data.units.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">
              No units assigned yet. Contact your Faculty Admin.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.units.map((a) => (
                <li key={a.courseUnit.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{a.courseUnit.name}</p>
                    <p className="text-xs text-text-secondary">
                      {a.courseUnit.code} · {a.academicYear} · Sem {a.semester}
                    </p>
                  </div>
                  <Link to={`/lecturer/sessions?unit=${a.courseUnit.id}`}>
                    <Button variant="ghost" className="min-h-[36px] px-3 py-1.5 text-xs">
                      Sessions
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Students At Risk">
        {data.atRisk.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-text-secondary">
            No active alerts. Alerts fire when attendance drops to or below 80%.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.atRisk.map((a) => (
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

      <div className="text-right">
        <Link to="/lecturer/sessions" className="text-sm font-medium text-umu-red hover:underline">
          View all sessions →
        </Link>
      </div>
    </div>
  )
}
