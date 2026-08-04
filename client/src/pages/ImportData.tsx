import { useRef, useState } from 'react'
import { importApi, ImportResult } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
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
  curriculum: 'courseUnitCode,programmeCode,year,semester,academicYear',
}

function ResultPanel({ result, label }: { result: ImportResult; label: string }) {
  return (
    <div className="mt-4 rounded border border-border bg-surface-1 p-4">
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
  const [loading, setLoading] = useState<'structure' | 'staff' | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [staffResult, setStaffResult] = useState<ImportResult | null>(null)
  const structureRef = useRef<HTMLInputElement>(null)
  const staffRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const blob = new Blob([TEMPLATES[type] + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function runStructure() {
    if (!file) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('structure')
    try {
      const res = await importApi.structure(type, file)
      setResult(res.result)
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(null)
    }
  }

  async function runStaff() {
    if (!staffFile) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading('staff')
    try {
      const res = await importApi.staff(staffFile)
      setStaffResult(res.result)
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">CSV Imports</h1>
        <p className="text-body-sm text-text-secondary">Bulk-load academic structure and staff accounts.</p>
      </div>

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
          <input
            ref={structureRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setResult(null)
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
          {result && <ResultPanel result={result} label="Structure import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">{TEMPLATES[type]}</code>
          </p>
        </Card>

        <Card title="Staff Accounts">
          <p className="mb-3 text-body-sm text-text-secondary">
            Creates or updates lecturer / faculty admin accounts (name, email, role). Emails must
            end in @umu.ac.ug.
          </p>
          <input
            ref={staffRef}
            type="file"
            accept=".csv,text/csv"
            className="mb-4 block w-full text-sm text-text-secondary file:mr-4 file:rounded file:border-0 file:bg-umu-red file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-umu-red-dark"
            onChange={(e) => {
              setStaffFile(e.target.files?.[0] ?? null)
              setStaffResult(null)
            }}
          />
          <Button loading={loading === 'staff'} onClick={runStaff}>
            Import Staff
          </Button>
          {staffResult && <ResultPanel result={staffResult} label="Staff import" />}
          <p className="mt-4 text-xs text-text-secondary">
            Template columns: <code className="code-font">name,email,role</code> (role: lecturer | faculty_admin)
          </p>
        </Card>
      </div>
    </div>
  )
}
