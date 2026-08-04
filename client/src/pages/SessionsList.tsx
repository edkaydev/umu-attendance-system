import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { sessionApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ApiClientError } from '../api/client'

export default function SessionsList() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof sessionApi.list>>>([])

  const unitFilter = searchParams.get('unit')

  useEffect(() => {
    sessionApi
      .list()
      .then((all) => {
        setSessions(unitFilter ? all.filter((s) => s.courseUnitId === unitFilter) : all)
      })
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load sessions'))
  }, [toast, unitFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">Sessions</h1>
          <p className="text-body-sm text-text-secondary">
            {unitFilter ? 'Filtered to one course unit' : 'All sessions for your assigned units'}
          </p>
        </div>
        <Link to="/lecturer/sessions/new">
          <Button>Open Session</Button>
        </Link>
      </div>

      <Card>
        {sessions.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">
            No sessions yet. Open one to start collecting attendance.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4">Course Unit</th>
                  <th className="py-2 pr-4">Opened</th>
                  <th className="py-2 pr-4">Venue</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Present</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{s.courseUnit.name}</p>
                      <p className="text-xs text-text-secondary">
                        {s.courseUnit.code} · {s.academicYear} · Sem {s.semester}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-text-secondary">{s.venue ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <Badge status={s.status} />
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{s._count?.attendanceRecords ?? 0}</td>
                    <td className="py-3 text-right">
                      <Link
                        to={
                          s.status === 'open'
                            ? `/lecturer/sessions/${s.id}/live`
                            : `/lecturer/sessions/${s.id}`
                        }
                        className="text-sm font-medium text-umu-red hover:underline"
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
