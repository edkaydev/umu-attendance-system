import { useEffect, useState } from 'react'
import { userApi, academicApi } from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { ApiClientError } from '../api/client'
import type { Role, ManagedUser, Faculty } from '../types'

const PAGE_SIZE = 20

const ROLE_LABEL: Record<Role, string> = {
  student:       'Student',
  lecturer:      'Lecturer',
  faculty_admin: 'Faculty Admin',
  system_admin:  'System Admin',
}

export default function UserManagement() {
  const toast = useToast()

  const [data,     setData]     = useState<{ users: ManagedUser[]; total: number } | null>(null)
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [role,     setRole]     = useState('')
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)

  // Assign-faculty modal state
  const [assignTarget, setAssignTarget] = useState<ManagedUser | null>(null)
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  // Build query params from current filter state
  function buildParams() {
    return {
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(role   ? { role }   : {}),
      ...(search ? { search } : {}),
    }
  }

  async function reload() {
    const res = await userApi.list(buildParams())
    setData(res)
  }

  // Load users whenever filters change
  useEffect(() => {
    userApi
      .list(buildParams())
      .then(setData)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : 'Failed to load users'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, search, page])

  // Load faculties once for the assign modal
  useEffect(() => {
    academicApi.faculties().then(setFaculties).catch(() => {})
  }, [])

  async function toggleActive(user: ManagedUser) {
    try {
      if (user.isActive) await userApi.deactivate(user.id)
      else               await userApi.activate(user.id)
      toast.success(user.isActive ? `${user.fullName} deactivated` : `${user.fullName} activated`)
      await reload()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Operation failed')
    }
  }

  async function changeRole(user: ManagedUser, newRole: Role) {
    if (newRole === user.role) return
    try {
      await userApi.changeRole(user.id, newRole)
      toast.success(`${user.fullName} → ${ROLE_LABEL[newRole]}`)
      await reload()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to change role')
    }
  }

  function openAssign(user: ManagedUser) {
    setAssignTarget(user)
    setSelectedFacultyId(user.facultyId ?? '')
  }

  async function handleAssignFaculty() {
    if (!assignTarget) return
    setAssigning(true)
    try {
      await userApi.assignFaculty(
        assignTarget.id,
        selectedFacultyId || null
      )
      const facultyName = faculties.find((f) => f.id === selectedFacultyId)?.name ?? 'None'
      toast.success(`Faculty set to "${facultyName}" for ${assignTarget.fullName}`)
      setAssignTarget(null)
      await reload()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to assign faculty')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary">User Management</h1>
        <p className="mt-1 text-body text-text-secondary">
          Manage accounts, roles, and faculty assignments. Users sign in with Google OAuth.
        </p>
      </div>

      {/* ── Filters ── */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Search"
            placeholder="Name or email"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="mb-0 md:w-72"
          />
          <div className="mb-0 w-48">
            <Select
              label="Role"
              value={role}
              onChange={(e) => { setRole(e.target.value); setPage(1) }}
              options={[
                { value: '',               label: 'All roles' },
                { value: 'student',        label: 'Student' },
                { value: 'lecturer',       label: 'Lecturer' },
                { value: 'faculty_admin',  label: 'Faculty Admin' },
                { value: 'system_admin',   label: 'System Admin' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* ── Users table ── */}
      <Card noPadding>
        {!data ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">Loading…</p>
        ) : data.users.length === 0 ? (
          <p className="px-5 py-12 text-center text-body text-text-secondary">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-5 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">User</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Faculty</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Role</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Status</th>
                  <th className="px-4 py-3 text-label font-semibold uppercase tracking-wide text-text-secondary">Joined</th>
                  <th className="px-4 py-3 text-right text-label font-semibold uppercase tracking-wide text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface-1">

                    {/* User */}
                    <td className="px-5 py-3">
                      <p className="text-body font-medium text-text-primary">{u.fullName}</p>
                      <p className="text-body-sm text-text-secondary">{u.email}</p>
                      {u.regNumber && (
                        <p className="text-body-sm text-text-disabled">{u.regNumber}</p>
                      )}
                    </td>

                    {/* Faculty */}
                    <td className="px-4 py-3">
                      {(u.role === 'faculty_admin' || u.role === 'lecturer') ? (
                          u.facultyId ? (
                            <span className="text-body text-text-primary">
                              {u.faculty?.name ?? '—'}
                            </span>
                          ) : (
                          <span className="text-body-sm text-warning font-medium">Not assigned</span>
                        )
                      ) : (
                        <span className="text-body-sm text-text-disabled">—</span>
                      )}
                    </td>

                    {/* Role inline selector */}
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        className="rounded border border-border bg-surface-1 px-2 py-1.5 text-body-sm text-text-primary focus:border-umu-red focus:outline-none"
                      >
                        <option value="student">Student</option>
                        <option value="lecturer">Lecturer</option>
                        <option value="faculty_admin">Faculty Admin</option>
                        <option value="system_admin">System Admin</option>
                      </select>
                    </td>

                    {/* Active status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-body-sm font-medium ${
                        u.isActive
                          ? 'border-success-border bg-success-light text-success'
                          : 'border-danger-border bg-danger-light text-danger'
                      }`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3 text-body text-text-secondary">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Assign Faculty — only for faculty_admin and lecturer */}
                        {(u.role === 'faculty_admin' || u.role === 'lecturer') && (
                          <Button
                            variant="secondary"
                            className="min-h-[32px] px-3 py-1 text-body-sm"
                            onClick={() => openAssign(u)}
                          >
                            {u.facultyId ? 'Change Faculty' : 'Assign Faculty'}
                          </Button>
                        )}
                        <Button
                          variant={u.isActive ? 'danger' : 'secondary'}
                          className="min-h-[32px] px-3 py-1 text-body-sm"
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-body-sm text-text-secondary">
            Page {page} of {totalPages} · {data?.total ?? 0} users
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1}           onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= totalPages}  onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      {/* ── Assign Faculty modal ── */}
      <Modal
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title={`Assign Faculty — ${assignTarget?.fullName ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-body text-text-secondary">
            Select the faculty this {assignTarget?.role === 'faculty_admin' ? 'Faculty Admin' : 'Lecturer'} belongs to.
            They will only be able to manage data within this faculty.
          </p>

          <Select
            label="Faculty"
            value={selectedFacultyId}
            onChange={(e) => setSelectedFacultyId(e.target.value)}
            options={[
              { value: '', label: 'No faculty (unassign)' },
              ...faculties.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` })),
            ]}
          />

          {!selectedFacultyId && (
            <p className="text-body-sm text-warning">
              Leaving this unassigned means the user cannot access their dashboard.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button loading={assigning} onClick={handleAssignFaculty}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
