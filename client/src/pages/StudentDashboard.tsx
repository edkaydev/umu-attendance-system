import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { dashboardApi, attendanceApi, checkinApi } from '../api/endpoints'
import type { LiveSessionForStudent } from '../api/endpoints'
import type { UnitAttendance } from '../types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Modal } from '../components/ui/Modal'
import { errorMessage } from '../api/client'
import { getCurrentPosition, GeoError } from '../utils/geo'
import { LoadingState } from '../components/ui/Spinner'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-border bg-white p-4">
      <span className="text-h3 font-bold text-text-primary">{value}</span>
      <span className="mt-0.5 text-xs text-text-secondary">{label}</span>
    </div>
  )
}

function ExpiryText({ expiresAt, now }: { expiresAt: string; now: number }) {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
  if (seconds === 0) {
    return <span className="text-danger">Code expired</span>
  }
  return (
    <span className={seconds <= 30 ? 'text-danger' : 'text-text-secondary'}>
      Expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  )
}

// Live countdown for the remaining class time (openedAt + classDuration).
// `now` ticks every second from the dashboard state, so this updates in place.
function ClassCountdown({
  openedAt,
  classDuration,
  now,
}: {
  openedAt: string
  classDuration: number | null
  now: number
}) {
  if (!classDuration) return null
  const end = new Date(openedAt).getTime() + classDuration * 60_000
  const seconds = Math.max(0, Math.floor((end - now) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const time =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const tone = seconds === 0 ? 'text-danger' : seconds <= 300 ? 'text-warning' : 'text-text-primary'
  return (
    <p className={`mt-0.5 text-xs font-medium ${tone}`}>
      Class time remaining {time}
    </p>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<Awaited<ReturnType<typeof dashboardApi.student>> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [live, setLive] = useState<LiveSessionForStudent[]>([])
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState<LiveSessionForStudent | null>(null)
  const [modalCode, setModalCode] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  useEffect(() => {
    dashboardApi
      .student()
      .then(setData)
      .catch((e) => toast.error(errorMessage(e, 'Failed to load dashboard')))
      .finally(() => setLoaded(true))
  }, [toast])

  // Live session discovery — polls every 5s to stay in sync with the lecturer.
  useEffect(() => {
    let cancelled = false
    async function loadLive() {
      try {
        const sessions = await checkinApi.live()
        if (!cancelled) setLive(sessions)
      } catch (e) {
        if (!cancelled) toast.error(errorMessage(e, 'Failed to load live sessions'))
      }
    }
    loadLive()
    const id = setInterval(loadLive, 5000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      cancelled = true
      clearInterval(id)
      clearInterval(tick)
    }
  }, [toast])

  async function handleCheckIn() {
    if (!selected) return
    const trimmed = modalCode.trim()
    if (!trimmed) {
      toast.info('Enter the session code shown by your lecturer')
      return
    }

    // Physical sessions require the student to be within the campus geo-fence.
    // Online sessions skip the location check entirely.
    let location: { lat: number; lng: number } | undefined

    if (selected.mode === 'physical') {
      setGettingLocation(true)
      try {
        location = await getCurrentPosition()
      } catch (e) {
        setGettingLocation(false)
        if (e instanceof GeoError) {
          toast.error(e.message)
        } else {
          toast.error('Could not get your location. Please try again.')
        }
        return
      }
      setGettingLocation(false)
    }

    setCheckingIn(true)
    try {
      const res = await attendanceApi.checkIn(trimmed, location)
      toast.success(`Checked in to ${res.courseUnit.name} (${res.status})`)
      setModalCode('')
      setSelected(null)
      checkinApi.live().then(setLive).catch(() => {})
      dashboardApi.student().then(setData).catch(() => {})
    } catch (e) {
      toast.error(errorMessage(e, 'Check-in failed'))
      checkinApi.live().then(setLive).catch(() => {})
    } finally {
      setCheckingIn(false)
    }
  }

  if (!loaded) {
    return (
      <LoadingState label="Loading dashboard…" />
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-h2 font-bold text-text-primary">Could not load dashboard</h1>
        <p className="max-w-sm text-body text-text-secondary">
          There was a problem loading your dashboard. Please refresh the page.
        </p>
        <button onClick={() => window.location.reload()} className="min-h-[44px] rounded px-4 text-body font-semibold text-umu-red hover:bg-[#FFF4F4] focus:outline-none focus:ring-4 focus:ring-umu-red/30">
          Try again
        </button>
      </div>
    )
  }

  const good = data.units.filter((u) => u.status === 'good').length
  const total = data.units.length
  const avg =
    total > 0
      ? (data.units.reduce((acc, u) => acc + u.percentage, 0) / total).toFixed(1)
      : '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Welcome back, {user?.fullName.split(' ')[0]}</h1>
        <p className="text-body-sm text-text-secondary">
          {data.period
            ? `Academic Year ${data.period.academicYear} · Semester ${data.period.semester}`
            : 'No enrollments found yet'}
        </p>
      </div>

      {/* Live now */}
      <Card title="Live Now">
        {live.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-text-secondary">
            No live sessions right now. When your lecturer opens a session for one of your units, it appears here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {live.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{s.courseUnit.name}</p>
                  <p className="text-xs text-text-secondary">
                    {s.courseUnit.code} · {s.mode === 'online' ? 'Online' : `Physical${s.venue ? ` · ${s.venue}` : ''}`}
                    {s.startsAt ? ` · ${new Date(s.startsAt).toLocaleTimeString()}` : ''} · {s.lecturer.fullName}
                  </p>
                  <ClassCountdown openedAt={s.openedAt} classDuration={s.classDuration} now={now} />
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs">
                    <ExpiryText expiresAt={s.codeExpiresAt} now={now} />
                  </p>
                  {s.checkedIn ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-light px-3 py-1 text-xs font-semibold text-success">
                      ✓ Checked in
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-body-sm"
                      disabled={new Date(s.codeExpiresAt).getTime() <= now}
                      onClick={() => {
                        setSelected(s)
                        setModalCode('')
                      }}
                    >
                      Check In
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Course Units" value={total} />
        <Stat label="At/Above 80%" value={good} />
        <Stat label="Avg Attendance" value={`${avg}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly activity */}
        <Card title="This Week">
          {data.weeklyChart.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No sessions held yet this week.</p>
          ) : (
            <>
              <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyChart} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => {
                      const date = new Date(d + 'T00:00:00')
                      return date.toLocaleDateString(undefined, { weekday: 'short' })
                    }}
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="attended" name="Attended" fill="#16A34A" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="absent" name="Absent" fill="#DC2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
              <details className="mt-3 text-body-sm text-text-secondary">
              <summary className="cursor-pointer font-medium text-umu-red">View weekly attendance data as a table</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-1 pr-3 font-semibold">Date</th>
                      <th className="py-1 pr-3 font-semibold">Attended</th>
                      <th className="py-1 font-semibold">Absent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeklyChart.map((day) => (
                      <tr key={day.date} className="border-b border-border last:border-0">
                        <td className="py-1 pr-3">{new Date(day.date + 'T00:00:00').toLocaleDateString()}</td>
                        <td className="py-1 pr-3">{day.attended}</td>
                        <td className="py-1">{day.absent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </details>
            </>
          )}
        </Card>

        {/* Recent check-ins */}
        <Card title="Recent Check-ins">
          {data.recentCheckIns.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No check-ins yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentCheckIns.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{r.session.courseUnit.name}</p>
                    <p className="text-xs text-text-secondary">
                      {r.checkedInAt
                        ? new Date(r.checkedInAt).toLocaleString()
                        : new Date(r.session.openedAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Unit attendance */}
      <Card title="Attendance by Course Unit">
        {data.units.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-text-secondary">
            No closed sessions yet. Attendance appears after your lecturer closes a session.
          </p>
        ) : (
          <div className="space-y-4">
            {data.units.map((u: UnitAttendance) => {
              // If there's a live open session for this unit where the student already checked in,
              // the current percentage is provisional — mark it pending.
              const liveForUnit = live.find(
                (s) => s.courseUnit.id === u.courseUnit.id && s.checkedIn
              )
              return (
                <div key={u.courseUnit.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-primary">{u.courseUnit.name}</span>
                      <span className="ml-2 text-xs text-text-secondary">{u.courseUnit.code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {liveForUnit && (
                        <span className="inline-flex items-center rounded-full border border-warning-border bg-warning-light px-2.5 py-0.5 text-xs font-medium text-warning">
                          Session in progress
                        </span>
                      )}
                      <span className="text-sm font-semibold text-text-primary">{u.percentage}%</span>
                      <Badge status={u.status} />
                    </div>
                  </div>
                  <ProgressBar percentage={u.percentage} />
                  <p className="mt-1 text-xs text-text-secondary">
                    {u.attended} of {u.sessionsHeld} closed sessions
                    {liveForUnit && ' · attendance updates when lecturer closes the session'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="text-right">
        <Link to="/student/attendance" className="inline-flex min-h-[44px] items-center text-sm font-medium text-umu-red hover:underline">
          View full attendance report →
        </Link>
      </div>

      {/* Check-in modal */}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Check in — ${selected.courseUnit.name}` : ''}>
      {selected && (
          <div className="space-y-4">
            <p className="text-body-sm text-text-secondary">
              {selected.courseUnit.code} · {selected.mode === 'online' ? 'Online' : `Physical${selected.venue ? ` · ${selected.venue}` : ''}`} ·{' '}
              <ExpiryText expiresAt={selected.codeExpiresAt} now={now} />
            </p>
            {selected.mode === 'physical' && (
              <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-light px-3 py-2">
                <span className="mt-0.5 text-sm">📍</span>
                <p className="text-xs text-warning">
                  Your location will be checked. Make sure you are on campus and have allowed location access in your browser.
                </p>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary" htmlFor="live-code">
                Session Code
              </label>
              <input
                id="live-code"
                value={modalCode}
                onChange={(e) => setModalCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="A B C 1 2 3"
                autoFocus
                className="code-font w-full rounded border-[1.5px] border-border bg-surface-1 px-4 py-3 text-xl font-bold uppercase tracking-[0.15em] text-text-primary focus:border-umu-red focus:outline-none focus:shadow-focus-red"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCheckIn()
                }}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" disabled={checkingIn || gettingLocation} onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button loading={checkingIn || gettingLocation} onClick={handleCheckIn}>
                {gettingLocation ? 'Getting location…' : 'Check In'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
