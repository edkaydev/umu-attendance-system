import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { dashboardApi, attendanceApi } from '../api/endpoints'
import type { UnitAttendance } from '../types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-border bg-white p-4">
      <span className="text-h3 font-bold text-text-primary">{value}</span>
      <span className="mt-0.5 text-xs text-text-secondary">{label}</span>
    </div>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<Awaited<ReturnType<typeof dashboardApi.student>> | null>(null)
  const [code, setCode] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)

  useEffect(() => {
    dashboardApi
      .student()
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard'))
  }, [toast])

  async function handleCheckIn() {
    const trimmed = code.trim()
    if (!trimmed) {
      toast.info('Enter the session code shown by your lecturer')
      return
    }
    setCheckingIn(true)
    try {
      const res = await attendanceApi.checkIn(trimmed)
      toast.success(`Checked in to ${res.courseUnit.name} (${res.status})`)
      setCode('')
      dashboardApi.student().then(setData).catch(() => {})
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Check-in failed')
    } finally {
      setCheckingIn(false)
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
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

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Course Units" value={total} />
        <Stat label="At/Above 80%" value={good} />
        <Stat label="Avg Attendance" value={`${avg}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Check-in */}
        <Card title="Check In to a Session">
          <p className="mb-3 text-body-sm text-text-secondary">
            Enter the 6-character code your lecturer displayed. Codes expire after 5 minutes.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-text-secondary" htmlFor="code">
                Session Code
              </label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="A B C 1 2 3"
                className="code-font w-full rounded border-[1.5px] border-border bg-surface-1 px-4 py-3 text-xl font-bold uppercase tracking-[0.15em] text-text-primary focus:border-umu-red focus:outline-none focus:shadow-focus-red"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCheckIn()
                }}
              />
            </div>
            <Button loading={checkingIn} onClick={handleCheckIn}>
              Check In
            </Button>
          </div>
        </Card>

        {/* Weekly activity */}
        <Card title="This Week">
          {data.weeklyChart.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No sessions held yet this week.</p>
          ) : (
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
                  <Bar dataKey="attended" name="Attended" fill="#16A34A" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="absent" name="Absent" fill="#DC2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
            {data.units.map((u: UnitAttendance) => (
              <div key={u.courseUnit.id}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-text-primary">{u.courseUnit.name}</span>
                    <span className="ml-2 text-xs text-text-secondary">{u.courseUnit.code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-text-primary">{u.percentage}%</span>
                    <Badge status={u.status} />
                  </div>
                </div>
                <ProgressBar percentage={u.percentage} />
                <p className="mt-1 text-xs text-text-secondary">
                  {u.attended} of {u.sessionsHeld} sessions
                </p>
              </div>
            ))}
          </div>
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
                <div>
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

      <div className="text-right">
        <Link to="/student/attendance" className="text-sm font-medium text-umu-red hover:underline">
          View full attendance report →
        </Link>
      </div>
    </div>
  )
}
