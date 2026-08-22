import { useEffect, useState } from 'react'
import {
  settingsApi,
  CurrentPeriod,
  ProfileEditingScope,
  ProfileEditingSettings,
} from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { errorMessage } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { PasswordInput } from '../components/ui/PasswordInput'
import { Modal } from '../components/ui/Modal'

const PROFILE_SCOPES: { scope: ProfileEditingScope; label: string; description: string }[] = [
  { scope: 'students', label: 'Students', description: 'Allow students to edit their academic profile.' },
  { scope: 'lecturers', label: 'Lecturers', description: 'Allow lecturers to edit their faculty profile.' },
  { scope: 'admins', label: 'Faculty Admins', description: 'Allow Faculty Admins to edit their assigned scope.' },
]

export default function GlobalSettings() {
  const toast = useToast()
  const [period, setPeriod] = useState<CurrentPeriod | null>(null)
  const [academicYear, setAcademicYear] = useState('')
  const [semester, setSemester] = useState('1')
  const [profileEditing, setProfileEditing] = useState<ProfileEditingSettings | null>(null)
  const [defaultPasswordConfigured, setDefaultPasswordConfigured] = useState(false)
  const [defaultPassword, setDefaultPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'session' | 'access' | 'danger'>('session')

  // Danger Zone state
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)

  useEffect(() => {
    settingsApi.currentPeriod().then((value) => {
      setPeriod(value)
      setAcademicYear(value.academicYear)
      setSemester(String(value.semester))
    }).catch(() => undefined)
    settingsApi.profileEditing().then(setProfileEditing).catch(() => undefined)
    settingsApi.defaultUserPassword().then(({ configured }) => setDefaultPasswordConfigured(configured)).catch(() => undefined)
  }, [])

  async function savePeriod() {
    setSaving('period')
    try {
      const result = await settingsApi.setCurrentPeriod({ academicYear: academicYear.trim(), semester: Number(semester) })
      setPeriod(result.period)
      toast.success(result.message)
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to save academic period'))
    } finally { setSaving(null) }
  }

  async function toggleProfile(scope: ProfileEditingScope) {
    if (!profileEditing) return
    setSaving(scope)
    try {
      const result = await settingsApi.setProfileEditing({ [scope]: !profileEditing[scope] })
      setProfileEditing(result.enabled)
      toast.success(result.message)
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to update profile setting'))
    } finally { setSaving(null) }
  }

  async function saveDefaultPassword() {
    if (defaultPassword.length < 6) return toast.error('Password must be at least 6 characters')
    if (defaultPassword !== confirmPassword) return toast.error('Passwords do not match')
    setSaving('password')
    try {
      const result = await settingsApi.setDefaultUserPassword(defaultPassword)
      setDefaultPasswordConfigured(true)
      setDefaultPassword('')
      setConfirmPassword('')
      toast.success(result.message)
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to update default password'))
    } finally { setSaving(null) }
  }

  async function handleClearCache() {
    setClearingCache(true)
    try {
      await settingsApi.clearCache()
      // Clear browser caches (PWA / service worker caches)
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      toast.success('Cache cleared — all users will get fresh data on next load.')
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to clear cache'))
    } finally {
      setClearingCache(false)
    }
  }

  async function handleReset() {
    if (resetConfirmText !== 'RESET') return
    setResetting(true)
    try {
      const { message } = await settingsApi.resetDatabase()
      toast.success(message)
      setShowResetModal(false)
      setResetConfirmText('')
    } catch (error) {
      toast.error(errorMessage(error, 'Reset failed'))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Global Settings</h1>
        <p className="mt-1 text-body text-text-secondary">Configure rules and defaults that apply across the attendance system.</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('session')}
          className={`border-b-2 px-4 py-2 text-body-sm font-semibold ${activeTab === 'session' ? 'border-umu-red text-umu-red' : 'border-transparent text-text-secondary'}`}
        >
          Global Session
        </button>
        <button
          onClick={() => setActiveTab('access')}
          className={`border-b-2 px-4 py-2 text-body-sm font-semibold ${activeTab === 'access' ? 'border-umu-red text-umu-red' : 'border-transparent text-text-secondary'}`}
        >
          Account Settings
        </button>
        <button
          onClick={() => setActiveTab('danger')}
          className={`border-b-2 px-4 py-2 text-body-sm font-semibold ${activeTab === 'danger' ? 'border-danger text-danger' : 'border-transparent text-text-secondary'}`}
        >
          Danger Zone
        </button>
      </div>

      {activeTab === 'session' && <Card title="Current Academic Session">
        <p className="mb-4 text-body-sm text-text-secondary">Used for profile setup, unit assignments and attendance check-ins.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Academic Year" placeholder="e.g. 2026/2027" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          <Select label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)} options={[{ value: '1', label: 'Semester 1' }, { value: '2', label: 'Semester 2' }]} />
        </div>
        <Button loading={saving === 'period'} onClick={savePeriod}>Save Academic Period</Button>
        {period && <p className="mt-3 text-body-sm text-text-disabled">Currently: {period.academicYear}, Semester {period.semester}</p>}
      </Card>}

      {activeTab === 'access' && <><Card title="Profile Editing Access" noPadding>
        {PROFILE_SCOPES.map(({ scope, label, description }) => {
          const enabled = profileEditing?.[scope] ?? false
          return <div key={scope} className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
            <div className="min-w-0"><p className="font-semibold text-text-primary">{label}</p><p className="text-body-sm text-text-secondary">{description}</p></div>
            <button onClick={() => toggleProfile(scope)} disabled={!profileEditing || saving !== null} aria-label={`Toggle ${label} profile editing`} aria-pressed={enabled} className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full ${enabled ? 'bg-success' : 'bg-text-disabled'} disabled:opacity-60`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[26px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
        })}
      </Card>

      <Card title="Default Password for New Users">
        <p className="mb-4 text-body-sm text-text-secondary">
          {defaultPasswordConfigured ? 'A custom default is active.' : 'The initial default is Umu@2026.'} This affects only future accounts; every new user must change it at first sign-in.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordInput label="New Default Password" autoComplete="new-password" value={defaultPassword} onChange={(e) => setDefaultPassword(e.target.value)} showStrength />
          <PasswordInput label="Confirm Default Password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <Button loading={saving === 'password'} onClick={saveDefaultPassword}>Save Default Password</Button>
      </Card></>}

      {activeTab === 'danger' && (
        <Card>
          {/* Red warning banner */}
          <div className="mb-6 flex items-start gap-3 rounded border border-danger-border bg-danger-light p-4">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="font-semibold text-danger">Danger Zone — actions here are irreversible</p>
              <p className="mt-1 text-body-sm text-text-secondary">
                These operations permanently delete data from the database. Use only at the end of an academic semester to prepare for the next one.
              </p>
            </div>
          </div>

          {/* Clear Cache card */}
          <div className="mb-4 flex flex-col gap-2 rounded border border-border bg-surface-0 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-text-primary">Clear Application Cache</p>
              <p className="mt-1 max-w-lg text-body-sm text-text-secondary">
                Clears the browser's cached assets (PWA / service worker). Use this if users are
                seeing stale pages or outdated content after a deployment. No data is deleted.
              </p>
            </div>
            <Button
              variant="secondary"
              className="mt-3 shrink-0 sm:mt-0"
              loading={clearingCache}
              onClick={handleClearCache}
            >
              Clear Cache
            </Button>
          </div>

          {/* Reset card */}
          <div className="flex flex-col gap-2 rounded border border-danger-border bg-surface-0 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-text-primary">End-of-Semester Database Reset</p>
              <p className="mt-1 max-w-lg text-body-sm text-text-secondary">
                Permanently deletes <strong>all</strong> students, lecturers, faculty admins, sessions, attendance records,
                enrollments, assignments, faculties, programmes, course units, and curriculum entries.
                System Admin accounts and system settings are kept so you can log back in and
                set up the new semester.
              </p>
            </div>
            <Button
              variant="danger"
              className="mt-3 shrink-0 sm:mt-0"
              onClick={() => { setResetConfirmText(''); setShowResetModal(true) }}
            >
              Reset Database
            </Button>
          </div>
        </Card>
      )}

      {/* ── Reset Database confirmation modal ── */}
      <Modal
        open={showResetModal}
        onClose={() => !resetting && setShowResetModal(false)}
        title="Reset Database"
      >
        <div className="space-y-5">
          {/* Big red warning */}
          <div className="flex items-start gap-3 rounded border border-danger-border bg-danger-light p-4">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="text-body-sm text-text-primary">
              <p className="font-semibold text-danger">This will permanently delete:</p>
              <ul className="mt-2 list-disc pl-4 text-text-secondary">
                <li>All students, lecturers, and faculty admins</li>
                <li>All attendance records and session history</li>
                <li>All enrollments and lecturer assignments</li>
                <li>All faculties, programmes, course units, and curriculum</li>
              </ul>
              <p className="mt-2 font-medium">System Admin accounts and system settings are kept.</p>
              <p className="mt-1 text-danger font-semibold">This cannot be undone.</p>
            </div>
          </div>

          {/* Typed confirmation */}
          <div>
            <label className="mb-1.5 block text-body-sm font-medium text-text-primary">
              Type <span className="font-mono font-bold text-danger">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET"
              disabled={resetting}
              className="w-full rounded border border-border bg-surface-0 px-3 py-2 text-body font-mono text-text-primary placeholder:text-text-disabled focus:border-danger focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => setShowResetModal(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={resetting}
              disabled={resetConfirmText !== 'RESET'}
              onClick={handleReset}
            >
              Reset Everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
