import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <p className="text-h3 font-bold text-text-primary">{value}</p>
      <p className="text-body-sm text-text-secondary">{label}</p>
    </Card>
  )
}

const QUICK_LINKS = [
  { to: '/system-admin/academic', label: 'Academic Setup', desc: 'Campuses, faculties, programmes, units' },
  { to: '/system-admin/users', label: 'User Management', desc: 'Deactivate accounts, change roles' },
  { to: '/system-admin/imports', label: 'CSV Imports', desc: 'Bulk-load structure and staff' },
  { to: '/system-admin/logs', label: 'System Log', desc: 'Full audit trail' },
]

export default function SystemAdminDashboard() {
  const toast = useToast()
  const [data, setData] = useState<Awaited<ReturnType<typeof dashboardApi.systemAdmin>> | null>(null)

  useEffect(() => {
    dashboardApi
      .systemAdmin()
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard'))
  }, [toast])

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">System Administration</h1>
        <p className="text-body-sm text-text-secondary">Platform-wide overview.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total Users" value={data.overview.totalUsers} />
        <StatCard label="Students" value={data.overview.students} />
        <StatCard label="Lecturers" value={data.overview.lecturers} />
        <StatCard label="Faculty Admins" value={data.overview.facultyAdmins} />
        <StatCard label="System Admins" value={data.overview.systemAdmins} />
        <StatCard label="Active Sessions Today" value={data.overview.activeSessionsToday} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to}>
            <Card interactive>
              <p className="text-sm font-semibold text-umu-red">{l.label} →</p>
              <p className="mt-1 text-body-sm text-text-secondary">{l.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent Imports">
          {data.recentImports.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentImports.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {l.user?.fullName ?? 'System'} — {l.targetId}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {new Date(l.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {l.meta && (
                    <span className="text-xs text-text-secondary">
                      {String(l.meta.imported ?? 0)} imported, {String(l.meta.failed ?? 0)} failed
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent Activity">
          {data.recentActivity.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-text-secondary">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {l.user?.fullName ?? 'System'}
                    </p>
                    <p className="text-xs text-text-secondary">{new Date(l.createdAt).toLocaleString()}</p>
                  </div>
                  <span className="rounded bg-surface-1 px-2 py-0.5 text-xs font-medium text-text-primary">
                    {l.action}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
