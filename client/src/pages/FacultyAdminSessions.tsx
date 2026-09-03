import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { sessionApi } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { ApiClientError } from '../api/client'
import { SkeletonTable } from '../components/ui/Skeleton'
import type { Session, SessionStatus } from '../types'
import { useRealtime } from '../hooks/useRealtime'

type FacultySession = Session & {
  lecturer: { id: string; fullName: string }
}

export default function FacultyAdminSessions() {
  const toast = useToast()
  const { period: globalPeriod } = usePeriod()

  const [sessions, setSessions] = useState<FacultySession[]>([])
  const [loading, setLoading] = useState(true)
  const [todayOnly, setTodayOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'' | 'open' | 'closed'>('')

  const load = useCallback(() => {
    if (!globalPeriod) return
    setLoading(true)
    const params: Record<string, string> = {
      academicYear: globalPeriod.academicYear,
      semester: String(globalPeriod.semester),
    }
    if (statusFilter) params.status = statusFilter
    if (todayOnly) params.today = 'true'

    sessionApi
      .facultySessions(params)
      .then(setSessions)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [globalPeriod, statusFilter, todayOnly, toast])

  useEffect(() => { load() }, [load])

  useRealtime(['sessions-changed'], load)

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">Sessions</h1>
          <p className="text-body-sm text-text-secondary">
            {globalPeriod
              ? `${globalPeriod.academicYear} · Semester ${globalPeriod.semester}`
              : 'All sessions in your faculty'}
            {todayOnly && ` · ${todayLabel}`}
          </p>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Today toggle */}
          <button
            type="button"
            onClick={() => setTodayOnly((v) => !v)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded border px-4 text-body font-medium transition-colors ${
              todayOnly
                ? 'border-umu-red bg-[#FFF4F4] text-umu-red'
                : 'border-border bg-white text-text-secondary hover:bg-surface-1'
            }`}
          >
            {/* Calendar icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Today
          </button>

          {/* Status filter */}
          <Select
            label=""
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | 'open' | 'closed')}
            options={[
              { value: '', label: 'All sessions' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <Card noPadding={sessions.length > 0 && !loading}>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : sessions.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">
            {todayOnly
              ? 'No sessions today for the current period.'
              : 'No sessions found for the current period.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Course Unit</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Lecturer</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    {todayOnly ? 'Time' : 'Date'}
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Mode</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Present</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-text-secondary" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => {
                  const presentCount = (s as unknown as { _count?: { attendanceRecords?: number } })._count?.attendanceRecords ?? 0
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-surface-1">
                      <td className="px-5 py-3">
                        <p className="text-body font-medium text-text-primary">{s.courseUnit?.name ?? '—'}</p>
                        <p className="text-body-sm text-text-secondary">{s.courseUnit?.code ?? ''}</p>
                      </td>
                      <td className="px-4 py-3 text-body text-text-secondary">{s.lecturer?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 text-body text-text-secondary">
                        {todayOnly
                          ? new Date(s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : (
                            <>
                              {new Date(s.openedAt).toLocaleDateString()}{' '}
                              <span className="text-xs text-text-disabled">
                                {new Date(s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          )}
                      </td>
                      <td className="px-4 py-3 text-body text-text-secondary capitalize">{s.mode}</td>
                      <td className="px-4 py-3 text-body text-text-secondary">{presentCount}</td>
                      <td className="px-4 py-3">
                        <Badge status={s.status as SessionStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/faculty-admin/sessions/${s.id}`}
                          className="text-body-sm font-medium text-umu-red hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
