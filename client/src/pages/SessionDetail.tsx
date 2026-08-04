import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { sessionApi, attendanceApi, reportApi, SessionDetail as SessionDetailType } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { ApiClientError } from '../api/client'
import type { AttendanceStatus } from '../types'

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface-1 px-4 py-2">
      <span className="text-sm font-semibold text-text-primary">{value}</span>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  )
}

export default function SessionDetail() {
  const { sessionId = '' } = useParams()
  const toast = useToast()
  const [session, setSession] = useState<SessionDetailType | null>(null)
  const [editing, setEditing] = useState<{ recordId: string; studentName: string } | null>(null)
  const [status, setStatus] = useState<AttendanceStatus>('present')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    sessionApi
      .get(sessionId)
      .then(setSession)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load session'))
  }, [sessionId, toast])

  function openEdit(recordId: string, studentName: string) {
    setEditing({ recordId, studentName })
    setStatus('present')
    setReason('')
  }

  async function handleSave() {
    if (!editing) return
    if (!reason.trim()) {
      toast.error('A reason is required for any attendance change')
      return
    }
    setSaving(true)
    try {
      await attendanceApi.edit(editing.recordId, status, reason.trim())
      toast.success('Attendance updated')
      setEditing(null)
      setSession(await sessionApi.get(sessionId))
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update attendance')
    } finally {
      setSaving(false)
    }
  }

  if (!session) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      </div>
    )
  }

  const counts = session.counts ?? { present: 0, absent: 0, excused: 0 }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">{session.courseUnit.name}</h1>
          <p className="text-body-sm text-text-secondary">
            {session.courseUnit.code} · {session.academicYear} · Semester {session.semester}
            {session.venue ? ` · ${session.venue}` : ''} · {new Date(session.openedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {session.status === 'open' ? (
            <Link to={`/lecturer/sessions/${sessionId}/live`}>
              <Button variant="secondary">Live View</Button>
            </Link>
          ) : (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await sessionApi.reopen(sessionId)
                  toast.success('Session reopened with a new code')
                  setSession(await sessionApi.get(sessionId))
                } catch (e) {
                  toast.error(e instanceof ApiClientError ? e.message : 'Cannot reopen session')
                }
              }}
            >
              Reopen (same day)
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <CountPill label="Present" value={counts.present ?? 0} />
        <CountPill label="Absent" value={counts.absent ?? 0} />
        <CountPill label="Excused" value={counts.excused ?? 0} />
        <CountPill label="Total" value={(counts.present ?? 0) + (counts.absent ?? 0) + (counts.excused ?? 0)} />
      </div>

      <div>
        <a
          href={reportApi.pdfUrl('course-unit', session.courseUnitId, {
            academicYear: session.academicYear,
            semester: session.semester,
          })}
          className="text-sm font-medium text-umu-red hover:underline"
        >
          Download course-unit PDF report ↓
        </a>
      </div>

      <Card title="Attendance Records">
        {session.attendanceRecords.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">
            No attendance records. This appears after students check in and the session is closed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Reg Number</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Checked In</th>
                  <th className="py-2 pr-4">Last Edit</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {session.attendanceRecords.map((r) => {
                  const edit = r.edits?.[0]
                  return (
                    <tr key={r.id}>
                      <td className="py-3 pr-4 font-medium text-text-primary">{r.student.fullName}</td>
                      <td className="py-3 pr-4 text-text-secondary">{r.student.regNumber ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge status={r.status} />
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-text-secondary">
                        {edit
                          ? `${edit.oldStatus} → ${edit.newStatus}: ${edit.reason}`
                          : '—'}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="ghost"
                          className="min-h-[32px] px-3 py-1 text-xs"
                          onClick={() => openEdit(r.id, r.student.fullName)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit attendance — ${editing?.studentName ?? ''}`}
      >
        <Select
          label="New status"
          value={status}
          onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
          options={[
            { value: 'present', label: 'Present' },
            { value: 'absent', label: 'Absent' },
            { value: 'excused', label: 'Excused' },
          ]}
        />
        <Input
          label="Reason (required)"
          placeholder="e.g. Doctor's note provided"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={handleSave}>
            Save Change
          </Button>
        </div>
      </Modal>
    </div>
  )
}
