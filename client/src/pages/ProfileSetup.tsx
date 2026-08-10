import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, settingsApi } from '../api/endpoints'
import type { ProfileOptions } from '../api/endpoints'
import { usePeriod } from '../hooks/usePeriod'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { ApiClientError } from '../api/client'
import type { Gender, ProgrammeLevel } from '../types'

const YEAR_OPTIONS = [1, 2, 3, 4, 5].map((y) => ({ value: String(y), label: `Year ${y}` }))

const GENDER_OPTIONS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other' },
]

const LEVEL_OPTIONS: { value: ProgrammeLevel; label: string }[] = [
  { value: 'bachelors',   label: "Bachelor's Degree" },
  { value: 'masters',     label: "Master's Degree" },
  { value: 'phd',         label: 'PhD / Doctorate' },
  { value: 'diploma',     label: 'Diploma' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other',       label: 'Other' },
]

export default function ProfileSetup({ edit = false }: { edit?: boolean }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const { period: globalPeriod } = usePeriod()

  const [options, setOptions]               = useState<ProfileOptions | null>(null)
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [editingDisabled, setEditingDisabled] = useState(false)

  // ── Student fields ─────────────────────────────────────────────────────────
  const [campusCode,   setCampusCode]   = useState('')
  const [facultyId,    setFacultyId]    = useState('')
  const [level,        setLevel]        = useState<ProgrammeLevel | ''>('')
  const [programmeId,  setProgrammeId]  = useState('')
  const [year,         setYear]         = useState('')
  const [regNumber,    setRegNumber]    = useState('')
  const [whatsapp,     setWhatsapp]     = useState('')
  const [gender,       setGender]       = useState<Gender | ''>('')

  // ── Lecturer fields ────────────────────────────────────────────────────────
  const [lecturerFacultyId,      setLecturerFacultyId]      = useState('')
  const [additionalFacultyIds,   setAdditionalFacultyIds]   = useState<string[]>([])
  const [lecturerWhatsapp,       setLecturerWhatsapp]       = useState('')
  const [lecturerGender,         setLecturerGender]         = useState<Gender | ''>('')

  const isStudent  = user?.role === 'student'
  const isLecturer = user?.role === 'lecturer'

  // Check if editing is disabled for this scope
  useEffect(() => {
    if (edit && user) {
      const scope = user.role === 'student' ? 'students' : 'lecturers'
      settingsApi
        .profileEditing()
        .then((s) => setEditingDisabled(!s[scope]))
        .catch(() => setEditingDisabled(false))
    }
  }, [edit, user])

  // Load profile options and pre-fill on edit
  useEffect(() => {
    profileApi
      .options()
      .then((opts) => {
        setOptions(opts)
        if (edit && user) {
          if (isStudent) {
            setFacultyId(user.facultyId ?? '')
            setProgrammeId(user.programmeId ?? '')
            setYear(user.year ? String(user.year) : '')
            setRegNumber(user.regNumber ?? '')
            setWhatsapp(user.whatsapp ?? '')
            setGender((user.gender as Gender) ?? '')
            // Derive campusCode from the stored facultyId
            if (user.facultyId) {
              for (const c of opts.campuses) {
                if (c.faculties.some((f) => f.id === user.facultyId)) {
                  setCampusCode(c.code)
                  break
                }
              }
            }
            // Derive level from programme
            if (user.programmeId) {
              for (const c of opts.campuses) {
                for (const f of c.faculties) {
                  const prog = f.programmes.find((p) => p.id === user.programmeId)
                  if (prog?.level) { setLevel(prog.level as ProgrammeLevel); break }
                }
              }
            }
          } else if (isLecturer) {
            setLecturerFacultyId(user.facultyId ?? '')
            setAdditionalFacultyIds(user.additionalFaculties?.map((f) => f.id) ?? [])
            setLecturerWhatsapp(user.whatsapp ?? '')
            setLecturerGender((user.gender as Gender) ?? '')
          }
        }
      })
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load profile options.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit])

  // ── Derived dropdown options ───────────────────────────────────────────────
  const faculties = useMemo(() => {
    if (!options) return []
    return options.campuses.find((c) => c.code === campusCode)?.faculties ?? []
  }, [options, campusCode])

  const programmesForFaculty = useMemo(() => {
    if (!options || !facultyId) return []
    for (const c of options.campuses)
      for (const f of c.faculties)
        if (f.id === facultyId) return f.programmes
    return []
  }, [options, facultyId])

  const filteredProgrammes = useMemo(() => {
    if (!level) return programmesForFaculty
    return programmesForFaculty.filter((p) => p.level === level)
  }, [programmesForFaculty, level])

  const allFaculties = useMemo(
    () => (options?.campuses ?? []).flatMap((c) => c.faculties),
    [options]
  )

  // ── Submit handlers ────────────────────────────────────────────────────────
  async function handleStudentSubmit() {
    if (editingDisabled) { toast.error('Profile editing is currently disabled by the System Admin'); return }
    if (!campusCode || !facultyId || !programmeId || !year || !regNumber.trim() || !whatsapp.trim() || !gender) {
      toast.error('Please complete all fields')
      return
    }
    if (!globalPeriod) { toast.error('System period not loaded yet, please wait'); return }

    setSaving(true)
    try {
      const data = {
        campusCode,
        facultyId,
        programmeId,
        year:         Number(year),
        semester:     globalPeriod.semester,
        regNumber:    regNumber.trim(),
        academicYear: globalPeriod.academicYear,
        whatsapp:     whatsapp.trim(),
        gender:       gender as Gender,
      }
      await (edit ? profileApi.update(data) : profileApi.complete(data))
      await refresh()
      toast.success('Profile saved')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleLecturerSubmit() {
    if (editingDisabled) { toast.error('Profile editing is currently disabled by the System Admin'); return }
    if (!lecturerFacultyId || !lecturerWhatsapp.trim() || !lecturerGender) {
      toast.error('Please complete all required fields')
      return
    }
    setSaving(true)
    try {
      const data = {
        facultyId:            lecturerFacultyId,
        additionalFacultyIds,
        whatsapp:             lecturerWhatsapp.trim(),
        gender:               lecturerGender as Gender,
      }
      await (edit ? profileApi.update(data) : profileApi.complete(data))
      await refresh()
      toast.success('Profile saved')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  function toggleAdditionalFaculty(id: string) {
    setAdditionalFacultyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <div className="w-full max-w-lg">

        {/* Profile photo + name (from Google, read-only) */}
        <div className="mb-6 flex items-center gap-4">
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.fullName} className="h-16 w-16 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-umu-red text-xl font-bold text-white">
              {user?.fullName?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <p className="text-h3 font-bold text-text-primary">{user?.fullName || 'Welcome!'}</p>
            <p className="text-body-sm text-text-secondary">{user?.email}</p>
          </div>
        </div>

        <h1 className="text-h2 font-bold text-text-primary mb-1">
          {edit ? 'Edit Profile' : 'Complete Your Profile'}
        </h1>
        <p className="mb-6 text-body-sm text-text-secondary">
          {edit
            ? 'Update your details — enrolled units will be recalculated.'
            : 'Fill in your details to continue.'}
        </p>

        <Card>
          {editingDisabled && (
            <div className="mb-4 rounded border border-warning-border bg-warning-light px-4 py-3 text-body-sm text-warning">
              Profile editing is currently disabled by the System Admin.
            </div>
          )}

          {/* ── STUDENT FORM ─────────────────────────────────────────── */}
          {isStudent && (
            <>
              {globalPeriod && (
                <div className="mb-4 rounded border border-border bg-surface-1 px-4 py-3 text-body-sm text-text-secondary">
                  Academic period:{' '}
                  <span className="font-semibold text-text-primary">
                    {globalPeriod.academicYear} · Semester {globalPeriod.semester}
                  </span>
                  <span className="ml-1 text-text-disabled">(set by System Admin)</span>
                </div>
              )}

              <Select
                label="Campus"
                placeholder="Select campus"
                value={campusCode}
                onChange={(e) => { setCampusCode(e.target.value); setFacultyId(''); setLevel(''); setProgrammeId('') }}
                options={(options?.campuses ?? []).map((c) => ({ value: c.code, label: c.name }))}
              />
              <Select
                label="Faculty"
                placeholder="Select faculty"
                value={facultyId}
                onChange={(e) => { setFacultyId(e.target.value); setLevel(''); setProgrammeId('') }}
                options={faculties.map((f) => ({ value: f.id, label: f.name }))}
              />
              <Select
                label="Level"
                placeholder="Select level"
                value={level}
                onChange={(e) => { setLevel(e.target.value as ProgrammeLevel); setProgrammeId('') }}
                options={LEVEL_OPTIONS}
              />
              <Select
                label="Programme"
                placeholder={!facultyId ? 'Select faculty first' : !level ? 'Select level first' : 'Select programme'}
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
                options={filteredProgrammes.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                label="Year of Study"
                placeholder="Select year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                options={YEAR_OPTIONS}
              />
              <Input
                label="Registration Number"
                placeholder="e.g. 2024-B291-11005"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value)}
              />
              <Input
                label="WhatsApp Number"
                placeholder="e.g. +256 700 123456"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              <Select
                label="Gender"
                placeholder="Select gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                options={GENDER_OPTIONS}
              />

              <Button fullWidth loading={saving} disabled={editingDisabled} onClick={handleStudentSubmit}>
                Save &amp; Continue
              </Button>
            </>
          )}

          {/* ── LECTURER FORM ────────────────────────────────────────── */}
          {isLecturer && (
            <>
              <Select
                label="Primary Faculty"
                placeholder="Select your primary faculty"
                value={lecturerFacultyId}
                onChange={(e) => {
                  setLecturerFacultyId(e.target.value)
                  // Remove from additional if selected as primary
                  setAdditionalFacultyIds((prev) => prev.filter((id) => id !== e.target.value))
                }}
                options={allFaculties.map((f) => ({ value: f.id, label: f.name }))}
              />

              {/* Additional faculties — multi-select checkboxes */}
              {allFaculties.filter((f) => f.id !== lecturerFacultyId).length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 block text-xs font-medium text-text-secondary">
                    Additional Faculties <span className="text-text-disabled">(optional)</span>
                  </p>
                  <div className="rounded border border-border bg-surface-1 p-3 space-y-2 max-h-48 overflow-y-auto">
                    {allFaculties
                      .filter((f) => f.id !== lecturerFacultyId)
                      .map((f) => (
                        <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={additionalFacultyIds.includes(f.id)}
                            onChange={() => toggleAdditionalFaculty(f.id)}
                            className="h-4 w-4 rounded border-border text-umu-red focus:ring-umu-red"
                          />
                          <span className="text-sm text-text-primary">{f.name}</span>
                        </label>
                      ))}
                  </div>
                  <p className="mt-1 text-xs text-text-disabled">
                    Select faculties whose courses you also teach.
                  </p>
                </div>
              )}

              <Input
                label="WhatsApp Number"
                placeholder="e.g. +256 700 123456"
                value={lecturerWhatsapp}
                onChange={(e) => setLecturerWhatsapp(e.target.value)}
              />
              <Select
                label="Gender"
                placeholder="Select gender"
                value={lecturerGender}
                onChange={(e) => setLecturerGender(e.target.value as Gender)}
                options={GENDER_OPTIONS}
              />

              <Button fullWidth loading={saving} disabled={editingDisabled} onClick={handleLecturerSubmit}>
                Save &amp; Continue
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
