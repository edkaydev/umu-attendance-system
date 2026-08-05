import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { sessionApi, attendanceApi, reportApi } from '../api/endpoints'
import type { SessionDetail as SessionDetailType } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { ApiClientError } from '../api/client'
import type { AttendanceStatus } from '../types'

// ── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: number
  variant?: 'default' | 'success' | 'danger' | 'info'
}) {
  const colours = {
    default: 'border-border bg-surface-1 text-text-primary',
    success: 'border-success-border bg-success-light text-success',
    danger:  'border-danger-border  bg-danger-light  text-danger',
    info:    'border-info-border    bg-info-light    text-info',
  }
  return (
    <div className={`flex items-center gap-2 rounded-md border px-4 py-2 ${colours[variant]}`}>
      <span className="text-h4 font-bold leading-none">{value}</span>
      <span className="text-body-sm">{label}</span>
    </div>
  )
}

export default function SessionDetail() {
  const { sessionId = '' } = useParams()
  const toast = useToast()

  const [session, setSession] = useState<SessionDetailType | null>(null)
  const [editing, setEditing] = useState<{ recordId: string; studentName: string; currentStatus: AttendanceStatus } | null>(null)
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [reopening, setReopening] = useState(false)

  async function reload() {
    const s = await sessionApi.get(sessionId)
    setSession(s)
  }

  useEffect(() => {
    sessionApi
      .get(sessionId)
      .then(setSession)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load session')
      )
  }, [sessionId, toast])

  function openEdit(recordId: string, studentName: string, currentStatus: AttendanceStatus) {
    setEditing({ recordId, studentName, currentStatus })
    setNewStatus(currentStatus)
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
      await attendanceApi.edit(editing.recordId, newStatus, reason.trim())
      toast.success('Attendance updated')
      setEditing(null)
      await reload()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update attendance')
    } finally {
      setSaving(false)
    }
  }

  async function handleReopen() {
    setReopening(true)
    try {
      await sessionApi.reopen(sessionId)
      toast.success('Session reopened — a new code has been generated')
      await reload()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Cannot reopen this session')
    } finally {
      setReopening(false)
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
  const total = (counts.present ?? 0) + (counts.absent ?? 0) + (counts.excused ?? 0)

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-h1 font-bold text-text-primary">{session.courseUnit.name}</h1>
            <Badge status={session.status} />
          </div>
          <p className="text-body text-text-secondary">
            {session.courseUnit.code}
            {' · '}
            {session.academicYear} · Semester {session.semester}
            {' · '}
            {session.mode === 'online'
              ? 'Online'
              : session.venue
                ? `Physical · ${session.venue}`
                : 'Physical'}
            {' · '}
            {new Date(session.startsAt ?? session.openedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {session.status === 'open' ? (
            <Link to={`/lecturer/sessions/${sessionId}/live`}>
              <Button variant="secondary">Live View</Button>
            </Link>
          ) : (
            <Button variant="ghost" loading={reopening} onClick={handleReopen}>
              Reopen (same day only)
            </Button>
          )}
          <a
            href={reportApi.pdfUrl('course-unit', session.courseUnitId, {
              academicYear: session.academicYear,
              semester: session.semester,
            })}
            className="inline-flex min-h-[44px] items-center rounded border border-umu-red px-5 text-body font-semibold text-umu-red transition-colors hover:bg-[#FFF4F4]"
          >
            Download PDF
          </a>
        </div>
      </div>

      {/* ── Count pills ── */}
      <div className="flex flex-wrap gap-3">
        <StatPill label="Present" value={counts.present ?? 0} variant="success" />
        <StatPill label="Absent"  value={counts.absent  ?? 0} variant="danger" />
        <StatPill label="Excused" value={counts.excused ?? 0} variant="info" />
        <StatPill label="Total"   value={total} />
      </div>

      {/* ── Attendance table ── */}
      <Card title={`Attendance Records (${session.attendanceRecords.length})`} noPadding>
        {session.attendanceRecords.length === 0 ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">
            No attendance records yet. Records appear after students check in and the session is closed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Student
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Reg Number
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Status
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Checked In
                  </th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
                    Last Edit
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {session.attendanceRecords.map((r) => {
                  const edit = r.edits?.[0]
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-surface-1">
                      <td className="px-5 py-3">
                        <p className="text-body font-medium text-text-primary">{r.student.fullName}</p>
                      </td>
                      <td className="px-4 py-3 text-body text-text-secondary">
                        {r.student.regNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-body text-text-secondary">
                        {r.checkedInAt
                          ? new Date(r.checkedInAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-body-sm text-text-secondary max-w-[200px]">
                        {edit ? (
                          <span title={edit.reason}>
                            <span className="font-medium">{edit.oldStatus}</span>
                            {' → '}
                            <span className="font-medium">{edit.newStatus}</span>
                            {': '}
                            <span className="truncate">{edit.reason}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          className="min-h-[32px] px-3 py-1 text-body-sm"
                          onClick={() => openEdit(r.id, r.student.fullName, r.status)}
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

      {/* ── Edit modal ── */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit attendance — ${editing?.studentName ?? ''}`}
      >
        <div className="space-y-4">
          {editing && (
            <p className="text-body-sm text-text-secondary">
              Current status: <Badge status={editing.currentStatus} />
            </p>
          )}
          <Select
            label="New status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}
            options={[
              { value: 'present', label: 'Present' },
              { value: 'absent',  label: 'Absent' },
              { value: 'excused', label: 'Excused' },
            ]}
          />
          <Input
            label="Reason (required)"
            placeholder="e.g. Medical note submitted, lecturer verified"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-body-sm text-text-secondary">
            This change will be recorded in the audit log.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleSave}>
              Save Change
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
