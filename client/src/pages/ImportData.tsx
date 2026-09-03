import { useRef, useState } from 'react'
import { importApi, ImportResult } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ApiClientError } from '../api/client'

const FACULTY_ADMIN_TEMPLATE = 'email,facultyCode'

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
  const [adminFile, setAdminFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [adminResult, setAdminResult] = useState<ImportResult | null>(null)
  const [headerWarning, setHeaderWarning] = useState<string | null>(null)
  const adminRef = useRef<HTMLInputElement>(null)

  function downloadAdminTemplate() {
    const blob = new Blob([FACULTY_ADMIN_TEMPLATE + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'faculty-admins-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function runAdmins() {
    if (!adminFile) {
      toast.error('Choose a CSV file first')
      return
    }
    setLoading(true)
    setUploadProgress(0)
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const res = await importApi.facultyAdmins(adminFile)

      clearInterval(progressInterval)
      setUploadProgress(100)

      setAdminResult(res.result)
      toast.success('Import finished')
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Import failed')
    } finally {
      setLoading(false)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb customLabel="CSV Imports" />
      <div>
        <h1 className="text-h2 font-bold text-text-primary">CSV Imports</h1>
        <p className="text-body-sm text-text-secondary">
          Bulk-import Faculty Admin accounts. Academic structure (faculties, programmes, course
          units) is synced automatically from Moodle.
        </p>
      </div>

      <Card title="Faculty Admin Accounts">
        <p className="mb-3 text-body-sm text-text-secondary">
          Upload email + facultyCode. Each admin is bound to exactly one faculty and each faculty
          may have only one Faculty Admin. Unlike lecturers, admins do NOT choose their faculty —
          you assign it here. Emails must end in @umu.ac.ug.
        </p>
        {headerWarning && (
          <div className="mb-4 rounded-md border border-warning-border bg-warning-light px-3 py-2 text-xs text-warning">
            {headerWarning}
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
            setHeaderWarning(f ? (await checkCsvHeader(f, FACULTY_ADMIN_TEMPLATE)) ?? '' : null)
          }}
        />
        <div className="flex flex-wrap gap-3">
          <Button loading={loading} onClick={runAdmins}>
            Import Faculty Admins
          </Button>
          <Button variant="secondary" onClick={downloadAdminTemplate}>
            Download Template
          </Button>
        </div>
        {loading && (
          <ProgressBar progress={uploadProgress} label="Uploading..." tone="success" />
        )}
        {adminResult && <ResultPanel result={adminResult} label="Faculty admins import" />}
        <p className="mt-4 text-xs text-text-secondary">
          Template columns: <code className="code-font">{FACULTY_ADMIN_TEMPLATE}</code>{' '}
          (facultyCode must match a Moodle-synced faculty). Names come from Google at first sign-in.
        </p>
      </Card>
    </div>
  )
}
