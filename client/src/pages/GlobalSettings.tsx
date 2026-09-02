import { useEffect, useState } from 'react'
import {
  settingsApi,
  CurrentPeriod,
  ProfileEditingScope,
  ProfileEditingSettings,
} from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { ApiClientError } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { PasswordInput } from '../components/ui/PasswordInput'

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
  const [activeTab, setActiveTab] = useState<'session' | 'access'>('session')

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
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save academic period — please try again')
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
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update setting — please try again')
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
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the default password — please try again')
    } finally { setSaving(null) }
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

      {activeTab === 'access' && <><Card title="Who can edit their profile?" noPadding>
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
    </div>
  )
}
