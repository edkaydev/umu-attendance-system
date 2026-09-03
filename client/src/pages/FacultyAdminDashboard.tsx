import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePeriod } from '../hooks/usePeriod'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { useTour } from '../components/OnboardingTour'
import { TOURS } from '../components/tour/tourConfig'
import { ApiClientError } from '../api/client'
import { useRealtime } from '../hooks/useRealtime'

type DashData = Awaited<ReturnType<typeof dashboardApi.facultyAdmin>>
type PeopleTab = 'students' | 'lecturers'

function Stat({
  label,
  value,
  variant = 'default',
  delay = 0,
}: {
  label: string
  value: number | string
  variant?: 'default' | 'danger' | 'warning'
  /** Stagger delay in ms — cards cascade in left-to-right */
  delay?: number
}) {
  const colour =
    variant === 'danger' ? 'text-danger' :
    variant === 'warning' ? 'text-warning' :
    'text-text-primary'
  return (
    <div
      className="flex animate-fadeIn flex-col gap-1 rounded-md border border-border bg-white p-4 opacity-0 [animation-fill-mode:both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={`text-h2 font-bold leading-none ${colour}`}>{value}</span>
      <span className="text-body-sm text-text-secondary">{label}</span>
    </div>
  )
}

export default function FacultyAdminDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const { period } = usePeriod()
  const [data, setData] = useState<DashData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [peopleTab, setPeopleTab] = useState<PeopleTab>('students')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [pdfDownloading, setPdfDownloading] = useState<string | null>(null)

  async function downloadLecturerPdf(lecturerId: string, lecturerName: string) {
    if (!period) return
    setPdfDownloading(lecturerId)
    try {
      const url = `/api/reports/lecturer/${lecturerId}/pdf?academicYear=${encodeURIComponent(period.academicYear)}&semester=${period.semester}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      const safeYear = period.academicYear.replace('/', '_')
      const safeName = lecturerName.replace(/\s+/g, '-')
      a.download = `${safeName}-report-${safeYear}-sem${period.semester}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to download PDF')
    } finally {
      setPdfDownloading(null)
    }
  }

  const load = useCallback(() => {
    dashboardApi
      .facultyAdmin()
      .then(setData)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard')
      )
      .finally(() => setLoaded(true))
  }, [toast])

  useEffect(() => { load() }, [load])

  // Refresh when sessions open/close, attendance changes, or Moodle sync runs
  useRealtime(
    ['sessions-changed', 'attendance-changed', 'users-changed', 'enrollments-changed', 'assignments-changed'],
    load
  )

  // Onboarding walkthrough — fires once per user, shortly after data lands
  const { startOnce } = useTour()
  useEffect(() => {
    if (!loaded || !data || !user || user.hasCompletedTour) return
    const t = window.setTimeout(() => startOnce(user.id, TOURS.faculty_admin), 500)
    return () => clearTimeout(t)
  }, [loaded, data, user, startOnce])

  if (!loaded) {
    return <DashboardSkeleton label="Loading faculty dashboard…" stats={5} />
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-h2 font-bold text-text-primary">Could not load dashboard</h1>
        <p className="max-w-sm text-body text-text-secondary">
          There was a problem loading your faculty data. Please refresh the page.
        </p>
        <button onClick={() => window.location.reload()} className="min-h-[44px] rounded px-4 text-body font-semibold text-umu-red hover:bg-[#FFF4F4] focus:outline-none focus:ring-4 focus:ring-umu-red/30">
          Try again
        </button>
      </div>
    )
  }

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
          Your account has not been linked to a faculty yet. Please contact the System Admin.
        </p>
      </div>
    )
  }

  const criticalAlerts = data.activeAlerts.filter((a) => a.alertType === 'critical')
  const warningAlerts  = data.activeAlerts.filter((a) => a.alertType === 'warning')

  // Filter people by search
  const q = peopleSearch.trim().toLowerCase()
  const filteredStudents = q
    ? data.studentSummary.filter(
        (s) => s.fullName.toLowerCase().includes(q) ||
               (s.regNumber ?? '').toLowerCase().includes(q) ||
               s.email.toLowerCase().includes(q)
      )
    : data.studentSummary

  const filteredLecturers = q
    ? data.lecturerSummary.filter(
        (l) => l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
      )
    : data.lecturerSummary

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">
            {user?.faculty?.name ?? 'Faculty Admin'}
          </h1>
          <p className="mt-1 text-body text-text-secondary">Attendance overview for your faculty</p>
        </div>
        <Link
          to="/faculty-admin/reports"
          className="inline-flex min-h-[44px] items-center rounded bg-umu-red px-6 text-body font-semibold text-white transition-colors hover:bg-umu-red-dark"
        >
          Generate Reports
        </Link>
      </div>

      {/* ── Stats ── */}
      <div data-tour="fa-stats" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Course Units"   value={data.overview.courseUnits} />
        <Stat label="Students"       value={data.overview.students} delay={60} />
        <Stat label="Lecturers"      value={data.overview.lecturers} delay={120} />
        <Stat label="Sessions Today" value={data.overview.sessionsToday} delay={180} />
        <Stat
          label="Active Alerts"
          value={data.overview.activeAlerts}
          variant={criticalAlerts.length > 0 ? 'danger' : warningAlerts.length > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* ── People tabs: Students / Lecturers ── */}
      <section data-tour="fa-people">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex gap-1 rounded-md border border-border bg-surface-1 p-1">
            {(['students', 'lecturers'] as PeopleTab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setPeopleTab(t); setPeopleSearch('') }}
                aria-pressed={peopleTab === t}
                className={`min-h-[44px] rounded px-5 text-body font-medium transition-colors capitalize ${
                  peopleTab === t
                    ? 'bg-white text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t}
                {t === 'students' && data.overview.activeAlerts > 0 && (
                  <span className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-bold text-white ${
                    criticalAlerts.length > 0 ? 'bg-danger' : 'bg-warning'
                  }`}>
                    {data.overview.activeAlerts}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Search */}
          <input
            placeholder={peopleTab === 'students' ? 'Search students…' : 'Search lecturers…'}
            value={peopleSearch}
            onChange={(e) => setPeopleSearch(e.target.value)}
            className="w-64 rounded border border-border bg-white px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
          />
        </div>

        {/* Students tab */}
        {peopleTab === 'students' && (
          <Card noPadding={filteredStudents.length > 0}>
            {filteredStudents.length === 0 ? (
              <p className="py-10 text-center text-body text-text-secondary">
                {q ? 'No students match your search.' : 'No students in this faculty yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left">
                  <thead>
                    <tr className="border-b border-border bg-surface-1">
                      <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Student</th>
                      <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Reg Number</th>
                      <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Status</th>
                      <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-text-secondary" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStudents.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-surface-1">
                        <td className="px-5 py-3">
                          <p className="text-body font-medium text-text-primary">{s.fullName}</p>
                          <p className="text-body-sm text-text-secondary">{s.email}</p>
                        </td>
                        <td className="px-4 py-3 text-body text-text-secondary">{s.regNumber ?? '—'}</td>
                        <td className="px-4 py-3">
                          {s.alertStatus === 'critical' ? (
                            <Badge status="critical" />
                          ) : s.alertStatus === 'warning' ? (
                            <Badge status="warning" />
                          ) : (
                            <Badge status="good" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/faculty-admin/units/${s.id}`}
                            className="text-body-sm font-medium text-umu-red hover:underline"
                          >
                            Units
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Lecturers tab */}
        {peopleTab === 'lecturers' && (
          <Card noPadding={filteredLecturers.length > 0}>
            {filteredLecturers.length === 0 ? (
              <p className="py-10 text-center text-body text-text-secondary">
                {q ? 'No lecturers match your search.' : 'No lecturers assigned to this faculty yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead>
                    <tr className="border-b border-border bg-surface-1">
                      <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Lecturer</th>
                      <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Units</th>
                      <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Sessions</th>
                      <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Avg Attendance</th>
                      <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-text-secondary" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLecturers.map((l) => (
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
                            <span className={`text-body font-semibold ${
                              l.avgAttendance < 75 ? 'text-danger' :
                              l.avgAttendance < 80 ? 'text-warning' : 'text-success'
                            }`}>
                              {l.avgAttendance}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              to={`/faculty-admin/units/${l.id}`}
                              className="text-body-sm font-medium text-umu-red hover:underline"
                            >
                              Units
                            </Link>
                            <button
                              onClick={() => downloadLecturerPdf(l.id, l.fullName)}
                              disabled={pdfDownloading === l.id}
                              className="text-body-sm font-medium text-text-secondary hover:text-umu-red hover:underline disabled:cursor-wait disabled:opacity-50"
                            >
                              {pdfDownloading === l.id ? 'Downloading…' : 'PDF'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* ── Programmes ── */}
      <Card data-tour="fa-programmes" title="Programmes" noPadding={data.programmeSummary.length > 0}>
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

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <Link to="/faculty-admin/sessions" className="text-body font-medium text-umu-red hover:underline">Sessions →</Link>
        <Link to="/faculty-admin/reports"  className="text-body font-medium text-umu-red hover:underline">Reports →</Link>
        <Link to="/faculty-admin/units"    className="text-body font-medium text-umu-red hover:underline">Units →</Link>
      </div>
    </div>
  )
}
