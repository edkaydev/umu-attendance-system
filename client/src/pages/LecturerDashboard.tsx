import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ApiClientError } from '../api/client'

type Dashboard = Awaited<ReturnType<typeof dashboardApi.lecturer>>

function Stat({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: number | string
  variant?: 'default' | 'danger' | 'success'
}) {
  const colour =
    variant === 'danger'
      ? 'text-danger'
      : variant === 'success'
      ? 'text-success'
      : 'text-text-primary'
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-white p-4">
      <span className={`text-h2 font-bold leading-none ${colour}`}>{value}</span>
      <span className="text-body-sm text-text-secondary">{label}</span>
    </div>
  )
}

export default function LecturerDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<Dashboard | null>(null)

  useEffect(() => {
    dashboardApi
      .lecturer()
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

  const openSessions = data.todaySessions.filter((s) => s.status === 'open')

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">
            Welcome back, {user?.fullName.split(' ')[0]}
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Link to="/lecturer/sessions/new">
          <Button>Open New Session</Button>
        </Link>
      </div>

      {/* ── Active session banner ── */}
      {openSessions.length > 0 && (
        <div className="rounded-md border border-success-border bg-success-light px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body font-semibold text-success">
              {openSessions.length === 1
                ? '1 session currently open'
                : `${openSessions.length} sessions currently open`}
            </p>
          </div>
          {openSessions.length === 1 ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-body-sm text-success">
                {openSessions[0].courseUnit.name}
                {' · '}
                {openSessions[0].mode === 'online' ? 'Online' : (openSessions[0].venue ?? 'Physical')}
              </p>
              <Link to={`/lecturer/sessions/${openSessions[0].id}/live`}>
                <Button variant="secondary" className="border-success text-success hover:bg-success-light">
                  Go Live
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {openSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <p className="text-body-sm text-success">
                    {s.courseUnit.name}
                    {' · '}
                    {s.mode === 'online' ? 'Online' : (s.venue ?? 'Physical')}
                  </p>
                  <Link to={`/lecturer/sessions/${s.id}/live`}>
                    <Button variant="secondary" className="min-h-[32px] border-success px-3 py-1 text-body-sm text-success hover:bg-success-light">
                      Go Live
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Assigned Units"   value={data.units.length} />
        <Stat label="Sessions Today"   value={data.todaySessions.length} />
        <Stat
          label="Students At Risk"
          value={data.atRisk.length}
          variant={data.atRisk.length > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Today's sessions */}
        <Card title="Today's Sessions" noPadding={data.todaySessions.length > 0}>
          {data.todaySessions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-body text-text-secondary">No sessions today yet.</p>
              <p className="mt-1 text-body-sm text-text-disabled">
                Open a session to start collecting attendance.
              </p>
              <div className="mt-4">
                <Link to="/lecturer/sessions/new">
                  <Button variant="secondary">Open First Session</Button>
                </Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.todaySessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-text-primary truncate">
                      {s.courseUnit.name}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {new Date(s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {s.venue ? ` · ${s.venue}` : ''}
                      {' · '}
                      <span className="font-medium">{s._count?.attendanceRecords ?? 0}</span> checked in
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge status={s.status} />
                    <Link
                      to={
                        s.status === 'open'
                          ? `/lecturer/sessions/${s.id}/live`
                          : `/lecturer/sessions/${s.id}`
                      }
                    >
                      <Button variant="secondary" className="min-h-[34px] px-3 py-1 text-body-sm">
                        {s.status === 'open' ? 'Live' : 'View'}
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* My course units */}
        <Card title="My Course Units" noPadding={data.units.length > 0}>
          {data.units.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-body text-text-secondary">No units assigned yet.</p>
              <p className="mt-1 text-body-sm text-text-disabled">
                Contact your Faculty Admin to be assigned to course units.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.units.map((a) => (
                <li key={a.courseUnit.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-text-primary truncate">
                      {a.courseUnit.name}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {a.courseUnit.code} · {a.academicYear} · Sem {a.semester}
                    </p>
                  </div>
                  <Link to={`/lecturer/sessions?unit=${a.courseUnit.id}`}>
                    <Button variant="ghost" className="min-h-[34px] px-3 py-1 text-body-sm">
                      Sessions
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── At-risk students ── */}
      <Card
        title={`Students At Risk${data.atRisk.length > 0 ? ` (${data.atRisk.length})` : ''}`}
        noPadding={data.atRisk.length > 0}
      >
        {data.atRisk.length === 0 ? (
          <p className="py-10 text-center text-body text-text-secondary">
            No active alerts. Email alerts fire automatically when a student drops to or below 80%.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.atRisk.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-body font-medium text-text-primary">{a.student.fullName}</p>
                  <p className="text-body-sm text-text-secondary">
                    {a.courseUnit.name}
                    {a.student.regNumber ? ` · ${a.student.regNumber}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-body font-semibold text-danger">{a.attendancePct}%</span>
                  <Badge status={a.alertType} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Footer links ── */}
      <div className="flex flex-wrap gap-4 border-t border-border pt-4">
        <Link
          to="/lecturer/sessions"
          className="text-body font-medium text-umu-red hover:underline"
        >
          All sessions →
        </Link>
        <Link
          to="/lecturer/sessions/new"
          className="text-body font-medium text-text-secondary hover:text-text-primary hover:underline"
        >
          Open new session →
        </Link>
      </div>
    </div>
  )
}
