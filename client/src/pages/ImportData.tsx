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

const STAFF_TEMPLATE = 'email,role,facultyCode'
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
  { key: 'staff', label: 'Staff', needs: ['faculties'], why: 'staff rows link to faculty codes' },
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
  const [staffFile, setStaffFile] = useState<File | null>(null)
  const [studentFile, setStudentFile] = useState<File | null>(null)
  const [loading, setLoading] = useState<'structure' | 'staff' | 'students' | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [staffResult, setStaffResult] = useState<ImportResult | null>(null)
  const [studentResult, setStudentResult] = useState<ImportResult | null>(null)
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [headerWarning, setHeaderWarning] = useState<{ card: string; msg: string } | null>(null)
  const structureRef = useRef<HTMLInputElement>(null)
  const staffRef = useRef<HTMLInputElement>(null)
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

  function downloadStaffTemplate() {
    const blob = new Blob([STAFF_TEMPLATE + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'staff-template.csv'
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

  async function runStaff() {
    if (!staffFile) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('staff')
    setUploadProgress(0)
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)
      
      const res = await importApi.staff(staffFile)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      setStaffResult(res.result)
      setCompleted((c) => ({ ...c, staff: true }))
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
            <ProgressBar progress={uploadProgress} label="Uploading..." />
          )}
          {result && <ResultPanel result={result} label="Structure import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{TEMPLATES[type]}</code>
          </p>
        </Card>

        <Card title="Staff Accounts">
          <p className="mb-3 text-body-sm text-text-secondary">
            Creates or updates lecturer / faculty admin accounts and links each person to the
            faculty identified by its code. Lecturers are not assigned to course units during import.
            Each faculty can have one Faculty Admin. Emails must end in @umu.ac.ug. Leave the password
            column blank to use the system default password; users must change it on first sign-in.
          </p>
          {headerWarning?.card === 'staff' && headerWarning.msg && (
            <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
              ⚠ {headerWarning.msg}
            </div>
          )}
          <input
            ref={staffRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null
              setStaffFile(f)
              setStaffResult(null)
              setHeaderWarning(f ? { card: 'staff', msg: (await checkCsvHeader(f, STAFF_TEMPLATE)) ?? '' } : null)
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button loading={loading === 'staff'} onClick={runStaff}>
              Import Staff
            </Button>
            <Button variant="secondary" onClick={downloadStaffTemplate}>
              Download Template
            </Button>
          </div>
          {loading === 'staff' && (
            <ProgressBar progress={uploadProgress} label="Uploading..." />
          )}
          {staffResult && <ResultPanel result={staffResult} label="Staff import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{STAFF_TEMPLATE}</code>{' '}
            (role: lecturer | faculty_admin). Names come from Google at first
            sign-in; accounts start with the default password.
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
            <ProgressBar progress={uploadProgress} label="Uploading..." />
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
