import { useRef, useState } from 'react'
import { importApi, ImportResult } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

const STRUCTURE_TYPES = [
  { value: 'faculties', label: 'Faculties' },
  { value: 'programmes', label: 'Programmes' },
  { value: 'course_units', label: 'Course Units' },
  { value: 'curriculum', label: 'Curriculum' },
]

const TEMPLATES: Record<string, string> = {
  faculties: 'name,code,campusCode',
  programmes: 'name,code,facultyCode',
  course_units: 'name,code,facultyCode',
  curriculum: 'courseUnitCode,programmeCode,year,semester',
}

const LECTURER_TEMPLATE = 'email'
const FACULTY_ADMIN_TEMPLATE = 'email,facultyCode'
const STUDENT_TEMPLATE = 'email'

const IMPORT_ORDER: Array<{ key: string; label: string; needs?: string[]; why?: string }> = [
  { key: 'faculties', label: 'Faculties' },
  {
    key: 'programmes',
    label: 'Programmes',
    needs: ['faculties'],
    why: 'each programme row needs a facultyCode from step 1',
  },
  {
    key: 'course_units',
    label: 'Course Units',
    needs: ['faculties'],
    why: 'each unit row needs a facultyCode from step 1',
  },
  {
    key: 'curriculum',
    label: 'Curriculum',
    needs: ['course_units', 'programmes'],
    why: 'each row maps a unit code (step 3) to a programme code (step 2)',
  },
  { key: 'lecturers', label: 'Lecturers', needs: [], why: '' },
  { key: 'faculty_admins', label: 'Faculty Admins', needs: ['faculties'], why: 'each admin is bound to a faculty code' },
  { key: 'students', label: 'Students', needs: [], why: '' },
]

function OrderGuide({
  completed,
  onPick,
}: {
  completed: Record<string, boolean>
  onPick: (key: string) => void
}) {
  const nextStep = IMPORT_ORDER.find((s) => !completed[s.key])
  return (
    <Card title="Suggested Import Order">
      <p className="mb-3 text-body-sm text-text-secondary">
        Follow the numbered steps top to bottom — later files reference codes created by earlier
        ones. Green ticks mark what you have already imported on this visit.
      </p>
      <ol className="space-y-2">
        {IMPORT_ORDER.map((step, i) => {
          const done = Boolean(completed[step.key])
          const isNext = nextStep?.key === step.key
          const isStructureStep = step.key in TEMPLATES
          const missingPrereq =
            !done && (step.needs ?? []).some((dep) => !completed[dep])
          return (
            <li key={step.key}>
              <button
                type="button"
                disabled={!isStructureStep}
                onClick={() => isStructureStep && onPick(step.key)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-body-sm transition-colors ${
                  done
                    ? 'border-success-border bg-success-light text-success'
                    : isNext
                      ? 'border-umu-red bg-[#FFF4F4] font-semibold text-umu-red'
                      : missingPrereq
                        ? 'border-border bg-surface-1 text-text-disabled'
                        : 'border-border bg-white text-text-primary hover:bg-surface-1'
                } ${!isStructureStep ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? 'bg-success text-white'
                      : isNext
                        ? 'bg-umu-red text-white'
                        : 'bg-surface-2 text-text-secondary'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {step.label}
                  {isNext && <span className="ml-2 text-xs font-normal">← do this next</span>}
                  {missingPrereq && (
                    <span className="block text-xs font-normal text-warning">
                      Needs {(step.needs ?? []).join(' + ')} first ({step.why})
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

async function checkCsvHeader(file: File, expected: string): Promise<string | null> {
  const text = await file.slice(0, 4096).text()
  const header = text.split(/\r?\n/)[0]?.trim().toLowerCase()
  if (!header) return 'This file looks empty.'
  const cols = header.split(',').map((c) => c.trim())
  const missing = expected.split(',').filter((c) => !cols.includes(c))
  if (missing.length > 0) {
    return `Header mismatch — missing: ${missing.join(', ')}. Download the template to compare.`
  }
  return null
}

function ResultPanel({ result, label }: { result: ImportResult; label: string }) {
  return (
    <div className="mt-4 rounded bg-surface-1 p-4">
      <p className="text-sm font-medium text-text-primary">
        {label}: {result.imported} imported, {result.failed} failed
      </p>
      {result.errors.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {result.errors.map((e, i) => (
            <li key={i} className="text-xs text-danger">
              Row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ImportData() {
  const toast = useToast()
  const [type, setType] = useState('faculties')
  const [file, setFile] = useState<File | null>(null)
  const [lecturerFile, setLecturerFile] = useState<File | null>(null)
  const [adminFile, setAdminFile] = useState<File | null>(null)
  const [studentFile, setStudentFile] = useState<File | null>(null)
  const [loading, setLoading] = useState<'structure' | 'lecturers' | 'admins' | 'students' | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [lecturerResult, setLecturerResult] = useState<ImportResult | null>(null)
  const [adminResult, setAdminResult] = useState<ImportResult | null>(null)
  const [studentResult, setStudentResult] = useState<ImportResult | null>(null)
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [headerWarning, setHeaderWarning] = useState<{ card: string; msg: string } | null>(null)
  const structureRef = useRef<HTMLInputElement>(null)
  const lecturerRef = useRef<HTMLInputElement>(null)
  const adminRef = useRef<HTMLInputElement>(null)
  const studentRef = useRef<HTMLInputElement>(null)

  const activeStep = IMPORT_ORDER.find((s) => s.key === type)
  const prereqWarning =
    activeStep?.needs?.some((dep) => !completed[dep])
      ? `Heads-up: ${activeStep.label} rows reference ${(activeStep.needs ?? []).join(' and ')} codes. If those imports haven't been done yet (on this visit or before), most rows will fail. Recommended order: Faculties → Programmes → Course Units → Curriculum.`
      : null

  function downloadTemplate() {
    const blob = new Blob([TEMPLATES[type] + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadLecturerTemplate() {
    const blob = new Blob([LECTURER_TEMPLATE + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lecturers-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAdminTemplate() {
    const blob = new Blob([FACULTY_ADMIN_TEMPLATE + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'faculty-admins-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadStudentTemplate() {
    const blob = new Blob([STUDENT_TEMPLATE + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function runStructure() {
    if (!file) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('structure')
    setUploadProgress(0)
    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)
      
      const res = await importApi.structure(type, file)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      setResult(res.result)
      setCompleted((c) => ({ ...c, [type]: true }))
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(null)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  async function runLecturers() {
    if (!lecturerFile) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('lecturers')
    setUploadProgress(0)
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const res = await importApi.lecturers(lecturerFile)

      clearInterval(progressInterval)
      setUploadProgress(100)

      setLecturerResult(res.result)
      setCompleted((c) => ({ ...c, lecturers: true }))
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(null)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  async function runAdmins() {
    if (!adminFile) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('admins')
    setUploadProgress(0)
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const res = await importApi.facultyAdmins(adminFile)

      clearInterval(progressInterval)
      setUploadProgress(100)

      setAdminResult(res.result)
      setCompleted((c) => ({ ...c, faculty_admins: true }))
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(null)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  async function runStudents() {
    if (!studentFile) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('students')
    setUploadProgress(0)
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)
      
      const res = await importApi.students(studentFile)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      setStudentResult(res.result)
      setCompleted((c) => ({ ...c, students: true }))
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(null)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb customLabel="CSV Imports" />
      <div>
        <h1 className="text-h2 font-bold text-text-primary">CSV Imports</h1>
        <p className="text-body-sm text-text-secondary">Bulk-load academic structure and staff accounts.</p>
      </div>

      <OrderGuide
        completed={completed}
        onPick={(key) => {
          setType(key)
          setResult(null)
          setFile(null)
          setHeaderWarning(null)
          if (structureRef.current) structureRef.current.value = ''
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Academic Structure">
          <Select
            label="Structure type"
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setResult(null)
            }}
            options={STRUCTURE_TYPES}
          />
          {prereqWarning && (
            <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
              {prereqWarning}
            </div>
          )}
          {headerWarning?.card === 'structure' && headerWarning.msg && (
            <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
              ⚠ {headerWarning.msg}
            </div>
          )}
          <input
            ref={structureRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              setResult(null)
              setHeaderWarning(f ? { card: 'structure', msg: (await checkCsvHeader(f, TEMPLATES[type])) ?? '' } : null)
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={loading === 'structure'} onClick={runStructure}>
              Import
            </Button>
            <Button variant="secondary" onClick={downloadTemplate}>
              Download Template
            </Button>
          </div>
          {loading === 'structure' && (
            <ProgressBar progress={uploadProgress} label="Uploading..." tone="success" />
          )}
          {result && <ResultPanel result={result} label="Structure import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{TEMPLATES[type]}</code>
          </p>
        </Card>

        <Card title="Lecturer Accounts">
          <p className="mb-3 text-body-sm text-text-secondary">
            Upload emails only — one lecturer email per row. Each imported staff member becomes a
            lecturer with no faculty attached: at first sign-in they choose their own primary
            faculty plus up to two additional ones (max 3). Emails must end in @umu.ac.ug.
            Accounts start with the system default password and must change it at first login.
          </p>
          {headerWarning?.card === 'lecturers' && headerWarning.msg && (
            <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
              ⚠ {headerWarning.msg}
            </div>
          )}
          <input
            ref={lecturerRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null
              setLecturerFile(f)
              setLecturerResult(null)
              setHeaderWarning(f ? { card: 'lecturers', msg: (await checkCsvHeader(f, LECTURER_TEMPLATE)) ?? '' } : null)
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={loading === 'lecturers'} onClick={runLecturers}>
              Import Lecturers
            </Button>
            <Button variant="secondary" onClick={downloadLecturerTemplate}>
              Download Template
            </Button>
          </div>
          {loading === 'lecturers' && (
            <ProgressBar progress={uploadProgress} label="Uploading..." tone="success" />
          )}
          {lecturerResult && <ResultPanel result={lecturerResult} label="Lecturers import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{LECTURER_TEMPLATE}</code>{' '}
            — one @umu.ac.ug email per row. Names come from Google at first
            sign-in; lecturers pick their faculties on first login.
          </p>
        </Card>

        <Card title="Faculty Admin Accounts">
          <p className="mb-3 text-body-sm text-text-secondary">
            Upload email + facultyCode. Each admin is bound to exactly one faculty and each faculty
            may have only one Faculty Admin. Unlike lecturers, admins do NOT choose their faculty —
            you assign it here.
          </p>
          {headerWarning?.card === 'admins' && headerWarning.msg && (
            <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
              ⚠ {headerWarning.msg}
            </div>
          )}
          <input
            ref={adminRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null
              setAdminFile(f)
              setAdminResult(null)
              setHeaderWarning(f ? { card: 'admins', msg: (await checkCsvHeader(f, FACULTY_ADMIN_TEMPLATE)) ?? '' } : null)
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={loading === 'admins'} onClick={runAdmins}>
              Import Faculty Admins
            </Button>
            <Button variant="secondary" onClick={downloadAdminTemplate}>
              Download Template
            </Button>
          </div>
          {loading === 'admins' && (
            <ProgressBar progress={uploadProgress} label="Uploading..." tone="success" />
          )}
          {adminResult && <ResultPanel result={adminResult} label="Faculty admins import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{FACULTY_ADMIN_TEMPLATE}</code>{' '}
            (facultyCode from step 1). Names come from Google at first sign-in.
          </p>
        </Card>

        <Card title="Student Accounts">
          <p className="mb-3 text-body-sm text-text-secondary">
            Creates student accounts in bulk from their UMU student email addresses. Students
            complete their faculty, programme, year, registration number and student number at
            first sign-in; the system then enrols them in the appropriate course units.
            Emails must end in @stud.umu.ac.ug. Accounts start with the system default password
            and students change it on first sign-in.
          </p>
          {headerWarning?.card === 'students' && headerWarning.msg && (
            <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
              ⚠ {headerWarning.msg}
            </div>
          )}
          <input
            ref={studentRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null
              setStudentFile(f)
              setStudentResult(null)
              setHeaderWarning(f ? { card: 'students', msg: (await checkCsvHeader(f, STUDENT_TEMPLATE)) ?? '' } : null)
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={loading === 'students'} onClick={runStudents}>
              Import Students
            </Button>
            <Button variant="secondary" onClick={downloadStudentTemplate}>
              Download Template
            </Button>
          </div>
          {loading === 'students' && (
            <ProgressBar progress={uploadProgress} label="Uploading..." tone="success" />
          )}
          {studentResult && <ResultPanel result={studentResult} label="Students import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{STUDENT_TEMPLATE}</code>{' '}
            — one student email per row (@stud.umu.ac.ug). Names come from
            Google at first sign-in; students pick their faculty, programme,
            year and enter their reg/student numbers at first login, which
            enrolls them in their units.
          </p>
        </Card>
      </div>
    </div>
  )
}
