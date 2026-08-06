import { useEffect, useState } from 'react'
import { userApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { ApiClientError } from '../api/client'
import type { ManagedUser } from '../types'

const ROLE_LABEL: Record<string, string> = {
  student:       'Student',
  lecturer:      'Lecturer',
  faculty_admin: 'Faculty Admin',
  system_admin:  'System Admin',
}

export default function ResetPasswordPage() {
  const toast = useToast()

  const [search, setSearch]   = useState('')
  const [users, setUsers]     = useState<ManagedUser[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(false)

  // Which user is pending confirmation
  const [target, setTarget]       = useState<ManagedUser | null>(null)
  const [resetting, setResetting] = useState(false)

  // Load on mount and whenever search changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => fetchUsers(), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function fetchUsers() {
    setLoading(true)
    try {
      const params: Record<string, string> = { limit: '50' }
      if (search.trim()) params.search = search.trim()
      const res = await userApi.list(params)
      setUsers(res.users)
      setTotal(res.total)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!target) return
    setResetting(true)
    try {
      const { message } = await userApi.resetPassword(target.id)
      toast.success(message)
      setTarget(null)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Reset User Password</h1>
        <p className="mt-1 text-body text-text-secondary">
          Find a user and reset their password to the system default. They will be forced to
          choose a new password on next login. All their data stays untouched.
        </p>
      </div>

      {/* ── How it works ── */}
      <div className="rounded border border-border bg-surface-1 px-5 py-4 text-body-sm text-text-secondary">
        <p className="font-semibold text-text-primary mb-1">How it works</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Admin clicks <strong>Reset Password</strong> next to a user and confirms.</li>
          <li>Password is instantly set back to the system default.</li>
          <li>User logs in with the default password → immediately prompted to set a new one.</li>
          <li>All attendance records, sessions, and enrollments are completely untouched.</li>
        </ol>
      </div>

      {/* ── Search ── */}
      <Card>
        <Input
          label="Search users"
          placeholder="Name, email or reg number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!loading && (
          <p className="mt-1 text-body-sm text-text-disabled">
            {total} user{total !== 1 ? 's' : ''} found
            {total > 50 ? ' — showing first 50, refine your search to narrow down' : ''}
          </p>
        )}
      </Card>

      {/* ── User list ── */}
      <Card noPadding>
        {loading ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">Loading…</p>
        ) : users.length === 0 ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">
            No users found{search ? ' for that search' : ''}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-1"
              >
                {/* User info */}
                <div className="min-w-0">
                  <p className="text-body font-medium text-text-primary truncate">{u.fullName}</p>
                  <p className="text-body-sm text-text-secondary truncate">{u.email}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-body-sm text-text-disabled">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                    {u.faculty && (
                      <span className="text-body-sm text-text-disabled">· {u.faculty.name}</span>
                    )}
                    {u.regNumber && (
                      <span className="text-body-sm text-text-disabled">· {u.regNumber}</span>
                    )}
                    <span
                      className={`inline-flex rounded-full border px-2 py-0 text-[11px] font-medium ${
                        u.isActive
                          ? 'border-success-border bg-success-light text-success'
                          : 'border-danger-border bg-danger-light text-danger'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setTarget(u)}
                >
                  Reset Password
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Confirmation modal ── */}
      <ConfirmModal
        open={Boolean(target)}
        title="Reset Password to Default"
        message={
          target
            ? `Reset ${target.fullName}'s password to the system default?\n\nThey will be forced to choose a new password on next login. All their data is untouched.`
            : ''
        }
        confirmLabel="Reset Password"
        loading={resetting}
        onConfirm={handleReset}
        onCancel={() => !resetting && setTarget(null)}
      />
    </div>
  )
}
