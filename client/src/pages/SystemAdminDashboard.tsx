import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi, settingsApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'

type DashData = Awaited<ReturnType<typeof dashboardApi.systemAdmin>>

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-white p-4">
      <span className="text-h2 font-bold leading-none text-text-primary">{value}</span>
      <span className="text-body-sm text-text-secondary">{label}</span>
      {sub && <span className="text-body-sm text-text-disabled">{sub}</span>}
    </div>
  )
}

// ── Quick action cards ──────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    to: '/system-admin/academic',
    label: 'Academic Setup',
    desc: 'Campuses, faculties, programmes, course units, curriculum mapping',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/><path d="M9 21V9"/>
      </svg>
    ),
  },
  {
    to: '/system-admin/users',
    label: 'User Management',
    desc: 'View all users, activate/deactivate accounts, change roles',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4"/>
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
      </svg>
    ),
  },
  {
    to: '/system-admin/imports',
    label: 'CSV Imports',
    desc: 'Bulk-load academic structure and staff accounts from CSV files',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
  {
    to: '/system-admin/logs',
    label: 'System Log',
    desc: 'Full audit trail of all user actions across the platform',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
      </svg>
    ),
  },
]

const ACTION_LABELS: Record<string, string> = {
  LOGIN:            'Login',
  SESSION_OPEN:     'Session opened',
  SESSION_CLOSE:    'Session closed',
  ATTENDANCE_EDIT:  'Attendance edited',
  PDF_DOWNLOAD:     'PDF downloaded',
  IMPORT_STRUCTURE: 'Structure imported',
  IMPORT_STAFF:     'Staff imported',
  PROFILE_COMPLETE: 'Profile completed',
  PROFILE_UPDATE:   'Profile updated',
}

export default function SystemAdminDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState<DashData | null>(null)
  const [profileEditing, setProfileEditing] = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    dashboardApi
      .systemAdmin()
      .then(setData)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard')
      )
    settingsApi
      .profileEditing()
      .then(setProfileEditing)
      .catch(() => setProfileEditing(true))
  }, [toast])

  async function toggleProfileEditing() {
    if (profileEditing === null) return
    setToggling(true)
    try {
      const res = await settingsApi.setProfileEditing(!profileEditing)
      setProfileEditing(res.enabled)
      toast.success(res.message)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update setting')
    } finally {
      setToggling(false)
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">System Administration</h1>
        <p className="mt-1 text-body text-text-secondary">
          Welcome back, {user?.fullName.split(' ')[0]}. Platform-wide overview.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total Users"      value={data.overview.totalUsers} />
        <Stat label="Students"         value={data.overview.students} />
        <Stat label="Lecturers"        value={data.overview.lecturers} />
        <Stat label="Faculty Admins"   value={data.overview.facultyAdmins} />
        <Stat label="System Admins"    value={data.overview.systemAdmins} />
        <Stat
          label="Sessions Now"
          value={data.overview.activeSessionsToday}
          sub={data.overview.activeSessionsToday > 0 ? 'Live' : 'None active'}
        />
      </div>

      {/* ── System settings ── */}
      <section>
        <h2 className="mb-3 text-h4 font-semibold text-text-primary">System Settings</h2>
        <Card noPadding>
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-body font-semibold text-text-primary">Profile editing</p>
              <p className="mt-0.5 text-body-sm text-text-secondary">
                {profileEditing
                  ? 'Users can edit their own profiles. Toggle off to freeze all profile edits (e.g. during registration).'
                  : 'Profile editing is frozen. Students and lecturers cannot change their academic details.'}
              </p>
            </div>
            <button
              onClick={toggleProfileEditing}
              disabled={profileEditing === null || toggling}
              aria-pressed={profileEditing === true}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 ${
                profileEditing === false ? 'bg-text-disabled' : 'bg-success'
              } disabled:opacity-60`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${
                  profileEditing === false ? 'translate-x-0.5' : 'translate-x-[26px]'
                }`}
              />
            </button>
          </div>
        </Card>
      </section>

      {/* ── Quick actions ── */}
      <section>
        <h2 className="mb-3 text-h4 font-semibold text-text-primary">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} className="group block">
              <div className="flex h-full flex-col gap-3 rounded-md border border-border bg-white p-5 transition-colors duration-150 group-hover:bg-surface-1">
                <span className="text-umu-red">{a.icon}</span>
                <div>
                  <p className="text-h4 font-semibold text-text-primary group-hover:text-umu-red">
                    {a.label}
                  </p>
                  <p className="mt-1 text-body-sm text-text-secondary">{a.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Recent imports + activity ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Recent imports */}
        <Card title="Recent Imports" noPadding={data.recentImports.length > 0}>
          {data.recentImports.length === 0 ? (
            <p className="py-10 text-center text-body text-text-secondary">
              No CSV imports yet.{' '}
              <Link to="/system-admin/imports" className="text-umu-red hover:underline">
                Go to Imports →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentImports.map((entry) => {
                const meta = entry.meta as { imported?: number; failed?: number } | null
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-text-primary">
                        {entry.user?.fullName ?? 'System'}
                      </p>
                      <p className="text-body-sm text-text-secondary">
                        {ACTION_LABELS[entry.action] ?? entry.action} &middot;{' '}
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {meta && (
                      <div className="shrink-0 text-right">
                        {typeof meta.imported === 'number' && (
                          <span className="text-body-sm text-success">{meta.imported} imported</span>
                        )}
                        {typeof meta.failed === 'number' && meta.failed > 0 && (
                          <span className="ml-2 text-body-sm text-danger">{meta.failed} failed</span>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card title="Recent Activity" noPadding={data.recentActivity.length > 0}>
          {data.recentActivity.length === 0 ? (
            <p className="py-10 text-center text-body text-text-secondary">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-text-primary">
                      {entry.user?.fullName ?? 'System'}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-sm border border-border bg-surface-1 px-2.5 py-1 text-body-sm font-medium text-text-secondary">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.recentActivity.length > 0 && (
            <div className="border-t border-border px-5 py-3">
              <Link
                to="/system-admin/logs"
                className="text-body-sm font-medium text-umu-red hover:underline"
              >
                View full system log →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
