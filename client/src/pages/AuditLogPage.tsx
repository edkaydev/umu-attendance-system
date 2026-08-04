import { useEffect, useState } from 'react'
import { auditLogApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ApiClientError } from '../api/client'

const PAGE_SIZE = 25

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
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load audit log'))
      .finally(() => setLoading(false))
  }, [toast, page, action])

  const totalPages = logs ? Math.max(1, Math.ceil(logs.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">Audit Log</h1>
        <p className="text-body-sm text-text-secondary">Every sensitive action is recorded for accountability.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Filter by action"
            placeholder="e.g. ATTENDANCE_EDIT, SESSION_CLOSE, IMPORT"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            className="mb-0 md:w-80"
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 pr-4 whitespace-nowrap text-text-secondary">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{l.user?.fullName ?? 'System'}</p>
                      <p className="text-xs text-text-secondary">{l.user?.email ?? '—'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded bg-surface-1 px-2 py-0.5 text-xs font-medium text-text-primary">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {l.targetType} · {l.targetId.slice(0, 8)}…
                    </td>
                    <td className="py-3 text-xs text-text-secondary">
                      {l.meta ? JSON.stringify(l.meta) : '—'}
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
