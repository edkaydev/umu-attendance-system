import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { sessionApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ApiClientError } from '../api/client'
import { SkeletonTable } from '../components/ui/Skeleton'
import type { Session } from '../types'

type Tab = 'today' | 'all'

export default function SessionsList() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const unitFilter = searchParams.get('unit')
  const tabParam = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(tabParam === 'all' ? 'all' : 'today')

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  function handleTabChange(next: Tab) {
    setTab(next)
    const next_params = new URLSearchParams(searchParams)
    if (next === 'all') {
      next_params.set('tab', 'all')
    } else {
      next_params.delete('tab')
    }
    setSearchParams(next_params, { replace: true })
  }

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (tab === 'today') params.today = 'true'
    if (unitFilter) params.unit = unitFilter   // unit filter applied client-side below

    sessionApi
      .list(tab === 'today' ? { today: 'true' } : {})
      .then((all) => {
        setSessions(unitFilter ? all.filter((s) => s.courseUnitId === unitFilter) : all)
      })
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [tab, unitFilter, toast])

  const emptyMsg =
    tab === 'today'
      ? 'No sessions today yet. Open one to start collecting attendance.'
      : 'No sessions found for your assigned units.'

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">Sessions</h1>
          <p className="text-body-sm text-text-secondary">
            {unitFilter ? 'Filtered to one course unit · ' : ''}
            {tab === 'today'
              ? new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
              : 'All sessions for your assigned units'}
          </p>
        </div>
        <Link to="/lecturer/sessions/new" className="inline-flex min-h-[44px] items-center justify-center rounded bg-umu-red px-6 py-3 text-sm font-semibold text-white hover:bg-umu-red-dark">
          Open Session
        </Link>
      </div>

      {/* ── Today / All tabs ── */}
      <div className="flex gap-1 rounded-md border border-border bg-surface-1 p-1 w-fit">
        {(['today', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            aria-pressed={tab === t}
            className={`min-h-[44px] rounded px-5 text-body font-medium transition-colors capitalize ${
              tab === t
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t === 'today' ? "Today" : 'All Sessions'}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <Card noPadding={sessions.length > 0 && !loading}>
        {loading ? (
          <SkeletonTable rows={6} />
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-body text-text-secondary">{emptyMsg}</p>
            {tab === 'today' && (
              <div className="mt-4">
                <Link to="/lecturer/sessions/new" className="inline-flex min-h-[44px] items-center justify-center rounded border-[1.5px] border-umu-red bg-white px-6 py-3 text-sm font-semibold text-umu-red hover:bg-[#FFF4F4]">
                  Open First Session
                </Link>
              </div>
            )}
            {tab === 'all' && sessions.length === 0 && (
              <button
                onClick={() => handleTabChange('today')}
                className="mt-2 text-body-sm text-umu-red hover:underline"
              >
                Switch to Today's view
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Course Unit</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    {tab === 'today' ? 'Time' : 'Date'}
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Mode</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Present</th>
                  <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-text-secondary" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-surface-1">
                    <td className="px-5 py-3">
                      <p className="text-body font-medium text-text-primary">{s.courseUnit.name}</p>
                      <p className="text-body-sm text-text-secondary">
                        {s.courseUnit.code}
                        {tab === 'all' && ` · ${s.academicYear} · Sem ${s.semester}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-body text-text-secondary">
                      {tab === 'today'
                        ? new Date(s.startsAt ?? s.openedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : new Date(s.startsAt ?? s.openedAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                    </td>
                    <td className="px-4 py-3 text-body text-text-secondary capitalize">
                      {s.mode === 'online' ? 'Online' : s.venue ?? 'Physical'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-body text-text-secondary">
                      {s._count?.attendanceRecords ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={
                          s.status === 'open'
                            ? `/lecturer/sessions/${s.id}/live`
                            : `/lecturer/sessions/${s.id}`
                        }
                        className="text-body-sm font-medium text-umu-red hover:underline"
                      >
                        {s.status === 'open' ? 'Live view' : 'Details'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
