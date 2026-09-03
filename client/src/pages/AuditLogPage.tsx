import { useEffect, useState } from 'react'
import { auditLogApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { ApiClientError } from '../api/client'

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'SESSION_OPEN', label: 'Session opened' },
  { value: 'SESSION_CLOSE', label: 'Session closed' },
  { value: 'SESSION_AUTO_CLOSE', label: 'Session closed automatically' },
  { value: 'SESSION_EXTEND', label: 'Session extended' },
  { value: 'IMPORT', label: 'CSV import' },
  { value: 'MOODLE_SYNC', label: 'Moodle sync' },
  { value: 'USER_CREATE', label: 'User created' },
  { value: 'USER_UPDATE', label: 'User updated' },
  { value: 'USER_DELETE', label: 'User deleted' },
  { value: 'RESET_DATABASE', label: 'Database reset' },
]

const PAGE_SIZE = 25

const ACTION_LABEL: Record<string, string> = {
  SESSION_OPEN:       'Session opened',
  SESSION_CLOSE:      'Session closed',
  SESSION_AUTO_CLOSE: 'Session closed automatically',
  SESSION_EXTEND:     'Session extended',
  USER_CREATE:        'User created',
  USER_UPDATE:        'User updated',
  USER_DELETE:        'User deleted',
  IMPORT:             'CSV import',
  MOODLE_SYNC:        'Moodle sync',
  RESET_DATABASE:     'Database reset',
}

export default function AuditLogPage() {
  const toast = useToast()
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof auditLogApi.list>> | null>(null)
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    auditLogApi
      .list({ page: String(page), limit: String(PAGE_SIZE), ...(action ? { action } : {}) })
      .then(setLogs)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Could not load the activity log — please refresh'))
      .finally(() => setLoading(false))
  }, [toast, page, action])

  const totalPages = logs ? Math.max(1, Math.ceil(logs.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Activity Log</h1>
        <p className="text-body-sm text-text-secondary">Every sensitive action is recorded for accountability.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Filter by action"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            options={ACTION_OPTIONS}
            className="mb-0 md:w-72"
          />
        </div>
      </Card>

      <Card>
        {loading && !logs ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">Loading…</p>
        ) : !logs || logs.logs.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">No log entries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Who</th>
                  <th className="py-2">What happened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 pr-4 whitespace-nowrap text-text-secondary">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{l.actor?.fullName ?? 'System'}</p>
                      <p className="text-xs text-text-secondary">{l.actor?.email ?? '—'}</p>
                    </td>
                    <td className="py-3">
                      <p className="text-text-primary">{l.summary}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {ACTION_LABEL[l.action] ?? l.action}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-body-sm text-text-secondary">
            Page {page} of {totalPages} · {logs?.total ?? 0} entries
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
