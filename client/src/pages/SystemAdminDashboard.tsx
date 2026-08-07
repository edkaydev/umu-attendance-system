import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  dashboardApi,
  settingsApi,
  ProfileEditingScope,
  ProfileEditingSettings,
  CurrentPeriod,
} from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { PasswordInput } from '../components/ui/PasswordInput'
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
  const [loaded, setLoaded] = useState(false)
  const [profileEditing, setProfileEditing] = useState<ProfileEditingSettings | null>(null)
  const [toggling, setToggling] = useState<ProfileEditingScope | null>(null)

  // Current period state
  const [currentPeriod, setCurrentPeriod] = useState<CurrentPeriod | null>(null)
  const [periodModalOpen, setPeriodModalOpen] = useState(false)
  const [periodYear, setPeriodYear] = useState('')
  const [periodSemester, setPeriodSemester] = useState('1')
  const [savingPeriod, setSavingPeriod] = useState(false)
  const [defaultPasswordConfigured, setDefaultPasswordConfigured] = useState(false)
  const [defaultPasswordModalOpen, setDefaultPasswordModalOpen] = useState(false)
  const [defaultPassword, setDefaultPassword] = useState('')
  const [defaultPasswordConfirm, setDefaultPasswordConfirm] = useState('')
  const [savingDefaultPassword, setSavingDefaultPassword] = useState(false)

  useEffect(() => {
    dashboardApi
      .systemAdmin()
      .then(setData)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load dashboard')
      )
      .finally(() => setLoaded(true))
    settingsApi
      .profileEditing()
      .then(setProfileEditing)
      .catch(() => setProfileEditing(null))
    settingsApi
      .currentPeriod()
      .then(setCurrentPeriod)
      .catch(() => setCurrentPeriod(null))
    settingsApi
      .defaultUserPassword()
      .then(({ configured }) => setDefaultPasswordConfigured(configured))
      .catch(() => setDefaultPasswordConfigured(false))
  }, [toast])

  async function toggleProfileEditing(scope: ProfileEditingScope) {
    if (!profileEditing) return
    setToggling(scope)
    try {
      const res = await settingsApi.setProfileEditing({ [scope]: !profileEditing[scope] })
      setProfileEditing(res.enabled)
      toast.success(res.message)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update setting')
    } finally {
      setToggling(null)
    }
  }

  function openPeriodModal() {
    setPeriodYear(currentPeriod?.academicYear ?? '')
    setPeriodSemester(String(currentPeriod?.semester ?? 1))
    setPeriodModalOpen(true)
  }

  async function handleSetPeriod() {
    if (!periodYear.trim()) return toast.error('Academic year is required (e.g. 2025/2026)')
    setSavingPeriod(true)
    try {
      const res = await settingsApi.setCurrentPeriod({
        academicYear: periodYear.trim(),
        semester: Number(periodSemester),
      })
      setCurrentPeriod(res.period)
      toast.success(res.message)
      setPeriodModalOpen(false)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to set period')
    } finally {
      setSavingPeriod(false)
    }
  }

  function openDefaultPasswordModal() {
    setDefaultPassword('')
    setDefaultPasswordConfirm('')
    setDefaultPasswordModalOpen(true)
  }

  async function handleSetDefaultPassword() {
    if (defaultPassword.length < 6) return toast.error('Password must be at least 6 characters')
    if (defaultPassword !== defaultPasswordConfirm) return toast.error('Passwords do not match')
    setSavingDefaultPassword(true)
    try {
      const res = await settingsApi.setDefaultUserPassword(defaultPassword)
      setDefaultPasswordConfigured(true)
      toast.success(res.message)
      setDefaultPasswordModalOpen(false)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update default password')
    } finally {
      setSavingDefaultPassword(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-h2 font-bold text-text-primary">Could not load dashboard</h1>
        <p className="max-w-sm text-body text-text-secondary">
          There was a problem loading the platform data. Please refresh the page.
        </p>
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

      {/* ── Current Period ── */}
      <section>
        <h2 className="mb-3 text-h4 font-semibold text-text-primary">Current Academic Period</h2>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {currentPeriod ? (
                <>
                  <p className="text-h3 font-bold text-text-primary">
                    {currentPeriod.academicYear} &middot; Semester {currentPeriod.semester}
                  </p>
                  <p className="mt-0.5 text-body-sm text-text-secondary">
                    This is the active academic period used across the platform — for check-ins,
                    unit assignments, and profile setup.
                  </p>
                </>
              ) : (
                <p className="text-body text-warning font-medium">
                  No period set yet. Set one so students and lecturers can be assigned correctly.
                </p>
              )}
            </div>
            <Button onClick={openPeriodModal}>
              {currentPeriod ? 'Change Period' : 'Set Period'}
            </Button>
          </div>
        </Card>
      </section>

      {/* ── System settings ── */}
      <section>
        <h2 className="mb-3 text-h4 font-semibold text-text-primary">System Settings</h2>
        <Card noPadding>
          {(
            [
              {
                scope: 'students' as ProfileEditingScope,
                label: 'Students',
                desc: 'Students can choose/change their campus, programme and academic path.',
              },
              {
                scope: 'lecturers' as ProfileEditingScope,
                label: 'Lecturers',
                desc: 'Lecturers can choose/change their faculty.',
              },
              {
                scope: 'admins' as ProfileEditingScope,
                label: 'Faculty Admins',
                desc: 'Faculty Admins can assign and edit units for students and lecturers in their faculty.',
              },
            ]
          ).map(({ scope, label, desc }) => {
            const enabled = profileEditing?.[scope] ?? false
            return (
              <div
                key={scope}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-body font-semibold text-text-primary">{label} — edit access</p>
                  <p className="mt-0.5 text-body-sm text-text-secondary">{desc}</p>
                  <p className="mt-0.5 text-body-sm text-text-disabled">
                    {enabled ? 'Currently enabled' : 'Currently frozen'}
                  </p>
                </div>
                <button
                  onClick={() => toggleProfileEditing(scope)}
                  disabled={profileEditing === null || toggling !== null}
                  aria-pressed={enabled}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 ${
                    enabled ? 'bg-success' : 'bg-text-disabled'
                  } disabled:opacity-60`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${
                      enabled ? 'translate-x-[26px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            )
          })}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-body font-semibold text-text-primary">Default password for new users</p>
              <p className="mt-0.5 text-body-sm text-text-secondary">
                {defaultPasswordConfigured
                  ? 'A custom default is active for accounts created from now on.'
                  : 'Using the initial default: Umu@2026.'}{' '}
                Every new user must change it at their first password sign-in.
              </p>
            </div>
            <Button variant="secondary" onClick={openDefaultPasswordModal}>
              {defaultPasswordConfigured ? 'Change Default' : 'Set Default'}
            </Button>
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

      {/* ── Change period modal ── */}
      <Modal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} title="Set Current Academic Period">
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            This sets the active academic period used platform-wide for student check-ins,
            unit assignments, and profile setup. It does not modify historical records.
          </p>
          <Input
            label="Academic Year"
            placeholder="e.g. 2025/2026"
            value={periodYear}
            onChange={(e) => setPeriodYear(e.target.value)}
          />
          <Select
            label="Semester"
            value={periodSemester}
            onChange={(e) => setPeriodSemester(e.target.value)}
            options={[
              { value: '1', label: 'Semester 1' },
              { value: '2', label: 'Semester 2' },
            ]}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setPeriodModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={savingPeriod} onClick={handleSetPeriod}>
              Save Period
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={defaultPasswordModalOpen}
        onClose={() => setDefaultPasswordModalOpen(false)}
        title="Set Default Password for New Users"
      >
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            This applies only to accounts created after you save it. Existing users keep their current passwords.
            New users must change this password at their first sign-in.
          </p>
          <PasswordInput
            label="New Default Password"
            autoComplete="new-password"
            value={defaultPassword}
            onChange={(e) => setDefaultPassword(e.target.value)}
            showStrength
          />
          <PasswordInput
            label="Confirm Default Password"
            autoComplete="new-password"
            value={defaultPasswordConfirm}
            onChange={(e) => setDefaultPasswordConfirm(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDefaultPasswordModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={savingDefaultPassword} onClick={handleSetDefaultPassword}>
              Save Default Password
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
