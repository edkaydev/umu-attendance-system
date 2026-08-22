import { useEffect, useState } from 'react'
import { dashboardApi } from '../api/endpoints'
import { errorMessage } from '../api/client'
import type { Role } from '../types'

type FacultyData = Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>
type SystemData = Awaited<ReturnType<typeof dashboardApi.systemAdmin>>

function SummaryStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' | 'danger' }) {
  const textColour = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-text-primary'
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <p className={`text-h3 font-bold ${textColour}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </div>
  )
}

export function MobileAdminSummary({ role }: { role: Extract<Role, 'faculty_admin' | 'system_admin'> }) {
  const [facultyData, setFacultyData] = useState<FacultyData | null>(null)
  const [systemData, setSystemData] = useState<SystemData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const request = role === 'faculty_admin' ? dashboardApi.facultyAdmin() : dashboardApi.systemAdmin()
    request
      .then((data) => {
        if (role === 'faculty_admin') setFacultyData(data as FacultyData)
        else setSystemData(data as SystemData)
      })
      .catch((err) => setError(errorMessage(err, 'Could not load the latest summary.')))
  }, [role])

  const dataLoaded = role === 'faculty_admin' ? facultyData !== null : systemData !== null

  return (
    <main className="min-h-screen bg-white p-5 pb-8" id="mobile-main-content" tabIndex={-1}>
      <div className="mx-auto max-w-lg space-y-5">
        <header>
          <p className="text-label font-semibold uppercase tracking-wide text-umu-red">Mobile summary</p>
          <h1 className="mt-1 text-h2 font-bold text-text-primary">
            {role === 'faculty_admin' ? 'Faculty attendance' : 'System overview'}
          </h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            View current status here. Use a laptop or desktop for administration, imports, and detailed records.
          </p>
        </header>

        {error ? (
          <div className="rounded-md border border-danger-border bg-danger-light p-4 text-body-sm text-danger" role="alert">
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="mt-3 min-h-[44px] rounded px-3 font-semibold hover:bg-white/60">
              Try again
            </button>
          </div>
        ) : !dataLoaded ? (
          <div className="rounded-md border border-border bg-surface-1 p-5" role="status" aria-live="polite">
            <p className="text-body-sm text-text-secondary">Loading current summary…</p>
          </div>
        ) : role === 'faculty_admin' && facultyData ? (
          <>
            <section className="grid grid-cols-2 gap-3" aria-label="Faculty summary">
              <SummaryStat label="Students" value={facultyData.overview.students} />
              <SummaryStat label="Lecturers" value={facultyData.overview.lecturers} />
              <SummaryStat label="Sessions today" value={facultyData.overview.sessionsToday} />
              <SummaryStat
                label="Active alerts"
                value={facultyData.overview.activeAlerts}
                tone={facultyData.activeAlerts.some((a) => a.alertType === 'critical') ? 'danger' : facultyData.overview.activeAlerts > 0 ? 'warning' : 'default'}
              />
            </section>

            <section className="rounded-md border border-border bg-white p-4" aria-labelledby="mobile-alerts-heading">
              <h2 id="mobile-alerts-heading" className="text-h4 font-semibold text-text-primary">Priority attendance alerts</h2>
              {facultyData.activeAlerts.length === 0 ? (
                <p className="mt-2 text-body-sm text-text-secondary">No active attendance alerts.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {facultyData.activeAlerts.slice(0, 3).map((alert) => (
                    <li key={alert.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-body-sm font-semibold text-text-primary">{alert.student.fullName}</p>
                      <p className="text-body-sm text-text-secondary">
                        {alert.courseUnit.code} · {alert.attendancePct}% attendance · {alert.alertType === 'critical' ? 'Critical' : 'Warning'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : systemData ? (
          <>
            <section className="grid grid-cols-2 gap-3" aria-label="System summary">
              <SummaryStat label="Total users" value={systemData.overview.totalUsers} />
              <SummaryStat label="Students" value={systemData.overview.students} />
              <SummaryStat label="Lecturers" value={systemData.overview.lecturers} />
              <SummaryStat label="Live sessions" value={systemData.overview.activeSessionsToday} tone={systemData.overview.activeSessionsToday > 0 ? 'warning' : 'default'} />
            </section>

            <section className="rounded-md border border-border bg-white p-4" aria-labelledby="mobile-activity-heading">
              <h2 id="mobile-activity-heading" className="text-h4 font-semibold text-text-primary">Recent activity</h2>
              {systemData.recentActivity.length === 0 ? (
                <p className="mt-2 text-body-sm text-text-secondary">No recent activity.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {systemData.recentActivity.slice(0, 3).map((entry) => (
                    <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-body-sm font-semibold text-text-primary">{entry.action.replace(/_/g, ' ')}</p>
                      <p className="text-body-sm text-text-secondary">
                        {entry.user.fullName} · {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
