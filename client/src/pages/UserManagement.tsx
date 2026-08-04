import { useEffect, useState } from 'react'
import { userApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { ApiClientError } from '../api/client'
import type { Role, ManagedUser } from '../types'

const PAGE_SIZE = 20

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  lecturer: 'Lecturer',
  faculty_admin: 'Faculty Admin',
  system_admin: 'System Admin',
}

export default function UserManagement() {
  const toast = useToast()
  const [data, setData] = useState<{ users: ManagedUser[]; total: number } | null>(null)
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    userApi
      .list({
        page: String(page),
        limit: String(PAGE_SIZE),
        ...(role ? { role } : {}),
        ...(search ? { search } : {}),
      })
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load users'))
  }, [toast, role, search, page])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  async function toggleActive(user: ManagedUser) {
    try {
      if (user.isActive) await userApi.deactivate(user.id)
      else await userApi.activate(user.id)
      toast.success(user.isActive ? `${user.fullName} deactivated` : `${user.fullName} activated`)
      setData(null)
      const res = await userApi.list({ page: String(page), limit: String(PAGE_SIZE), ...(role ? { role } : {}), ...(search ? { search } : {}) })
      setData(res)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Operation failed')
    }
  }

  async function changeRole(user: ManagedUser, newRole: Role) {
    if (newRole === user.role) return
    try {
      await userApi.changeRole(user.id, newRole)
      toast.success(`Role changed to ${ROLE_LABEL[newRole]}`)
      const res = await userApi.list({ page: String(page), limit: String(PAGE_SIZE), ...(role ? { role } : {}), ...(search ? { search } : {}) })
      setData(res)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to change role')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold text-text-primary">User Management</h1>
        <p className="text-body-sm text-text-secondary">
          Deactivate accounts and change roles. Users sign in with Google OAuth.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Search"
            placeholder="Name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="mb-0 md:w-72"
          />
          <div className="mb-0 w-48">
            <Select
              label="Role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'All roles' },
                { value: 'student', label: 'Student' },
                { value: 'lecturer', label: 'Lecturer' },
                { value: 'faculty_admin', label: 'Faculty Admin' },
                { value: 'system_admin', label: 'System Admin' },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        {!data ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">Loading…</p>
        ) : data.users.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Reg Number</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Joined</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{u.fullName}</p>
                      <p className="text-xs text-text-secondary">{u.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{u.regNumber ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        className="rounded border-[1.5px] border-border bg-surface-1 px-2 py-1 text-xs text-text-primary focus:border-umu-red focus:outline-none"
                      >
                        <option value="student">Student</option>
                        <option value="lecturer">Lecturer</option>
                        <option value="faculty_admin">Faculty Admin</option>
                        <option value="system_admin">System Admin</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          u.isActive
                            ? 'border-success-border bg-success-light text-success'
                            : 'border-danger-border bg-danger-light text-danger'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      <Button
                        variant={u.isActive ? 'danger' : 'secondary'}
                        className="min-h-[32px] px-3 py-1 text-xs"
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-body-sm text-text-secondary">
            Page {page} of {totalPages} · {data?.total ?? 0} users
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
