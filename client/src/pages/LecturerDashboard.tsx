import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ApiClientError } from '../api/client'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { useTour } from '../components/OnboardingTour'
import { TOURS } from '../components/tour/tourConfig'

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
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    dashboardApi
      .lecturer()
      .then(setData)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard')
      )
      .finally(() => setLoaded(true))
  }, [toast])

  // Realtime: lecturers see roster/session changes the moment they happen.
  useRealtime(['sessions-changed', 'attendance-changed', 'assignments-changed', 'enrollments-changed'], () => {
    dashboardApi.lecturer().then(setData).catch(() => {})
  })

  // Onboarding walkthrough — fires once per user, shortly after data lands
  const { startOnce } = useTour()
  useEffect(() => {
    if (!loaded || !data || !user || user.hasCompletedTour) return
    const t = window.setTimeout(() => startOnce(user.id, TOURS.lecturer), 500)
    return () => clearTimeout(t)
  }, [loaded, data, user, startOnce])

  if (!loaded) {
    return <DashboardSkeleton label="Loading dashboard…" stats={3} />
  }

  // Data failed to load — show safe empty state
  if (!data) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">Welcome back, {user?.fullName.split(' ')[0]}</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Assigned Units"   value={0} />
          <Stat label="Sessions Today"   value={0} />
          <Stat label="Students At Risk" value={0} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Today's Sessions">
            <p className="py-8 text-center text-body text-text-secondary">No sessions today yet.</p>
          </Card>
          <Card title="My Course Units">
            <p className="py-8 text-center text-body text-text-secondary">No units assigned yet. Contact your Faculty Admin.</p>
            <button onClick={() => window.location.reload()} className="mx-auto block min-h-[44px] rounded px-4 text-body-sm font-semibold text-umu-red hover:bg-[#FFF4F4]">
              Try again
            </button>
          </Card>
        </div>
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
        <Link to="/lecturer/sessions/new" data-tour="lecturer-new-session" className="inline-flex min-h-[44px] items-center justify-center rounded bg-umu-red px-6 py-3 text-sm font-semibold text-white hover:bg-umu-red-dark">
          Start Session
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
              <p className="min-w-0 text-body-sm text-success">
                {openSessions[0].courseUnit.name}
                {' · '}
                {openSessions[0].mode === 'online' ? 'Online' : (openSessions[0].venue ?? 'Physical')}
              </p>
              <Link to={`/lecturer/sessions/${openSessions[0].id}/live`} className="inline-flex min-h-[44px] items-center justify-center rounded border-[1.5px] border-success bg-white px-6 py-3 text-sm font-semibold text-success hover:bg-success-light">
                Go Live
              </Link>
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {openSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-body-sm text-success">
                    {s.courseUnit.name}
                    {' · '}
                    {s.mode === 'online' ? 'Online' : (s.venue ?? 'Physical')}
                  </p>
                  <Link to={`/lecturer/sessions/${s.id}/live`} className="inline-flex min-h-[44px] items-center justify-center rounded border-[1.5px] border-success bg-white px-3 py-1 text-body-sm font-semibold text-success hover:bg-success-light">
                    Go Live
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
        <Card data-tour="lecturer-today" title="Today's Sessions" noPadding={data.todaySessions.length > 0}>
          {data.todaySessions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-body text-text-secondary">No sessions today yet.</p>
              <p className="mt-1 text-body-sm text-text-disabled">
                Open a session to start collecting attendance.
              </p>
              <div className="mt-4">
                <Link to="/lecturer/sessions/new" className="inline-flex min-h-[44px] items-center justify-center rounded border-[1.5px] border-umu-red bg-white px-6 py-3 text-sm font-semibold text-umu-red hover:bg-[#FFF4F4]">
                  Start First Session
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
                      className="inline-flex min-h-[44px] items-center justify-center rounded border-[1.5px] border-umu-red bg-white px-3 py-1 text-body-sm font-semibold text-umu-red hover:bg-[#FFF4F4]"
                    >
                      {s.status === 'open' ? 'Live' : 'View'}
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
                <li
                  key={a.courseUnit.id}
                  className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[#FFF4F4]"
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium text-text-primary truncate">
                      {a.courseUnit.name}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {a.courseUnit.code} · {a.academicYear} · Sem {a.semester}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Start Session — appears on hover, links pre-selecting this unit */}
                    <Link
                      to={`/lecturer/sessions/new?unit=${a.courseUnit.id}`}
                      className="inline-flex min-h-[44px] items-center justify-center rounded bg-umu-red px-4 py-1 text-body-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Start session for ${a.courseUnit.name}`}
                    >
                      Start Session
                    </Link>
                    <Link
                      to={`/lecturer/sessions?unit=${a.courseUnit.id}`}
                      className="inline-flex min-h-[44px] items-center justify-center rounded px-3 py-1 text-body-sm font-semibold text-umu-red hover:bg-[#FFECEC]"
                    >
                      Sessions
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── At-risk students ── */}
      <Card
        data-tour="lecturer-at-risk"
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
          Start new session →
        </Link>
      </div>
    </div>
  )
}
