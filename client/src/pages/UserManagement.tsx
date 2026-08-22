import { useEffect, useMemo, useState } from 'react'
import {
  userApi,
  academicApi,
  profileApi,
  ProfileOptions,
  AdminUserUpdateInput,
  CreateUserInput,
} from '../api/endpoints'
import { useToast } from '../context/ToastContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { ApiClientError } from '../api/client'
import type { Role, ManagedUser, Faculty } from '../types'

const PAGE_SIZE = 20

const ROLE_LABEL: Record<Role, string> = {
  student:       'Student',
  lecturer:      'Lecturer',
  faculty_admin: 'Faculty Admin',
  system_admin:  'System Admin',
}

const ROLE_OPTIONS = [
  { value: 'student',       label: 'Student' },
  { value: 'lecturer',      label: 'Lecturer' },
  { value: 'faculty_admin', label: 'Faculty Admin' },
  { value: 'system_admin',  label: 'System Admin' },
]

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()

  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [saving, setSaving] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [facultyId, setFacultyId] = useState('')

  const isStaff = role === 'lecturer' || role === 'faculty_admin'

  useEffect(() => {
    profileApi
      .options()
      .then(setOptions)
      .catch(() => setOptions(null))
  }, [])

  const staffFaculties = useMemo(() => {
    return options?.campuses.flatMap((c) => c.faculties) ?? []
  }, [options])

  async function handleCreate() {
    const payload: CreateUserInput = {
      fullName: fullName.trim(),
      email: email.trim(),
      role,
    }
    if (!payload.fullName) return toast.error('Full name is required')
    if (!payload.email) return toast.error('Email is required')

    if (isStaff) {
      if (!facultyId) return toast.error('Select a faculty')
      payload.facultyId = facultyId
    }

    setSaving(true)
    try {
      await userApi.create(payload)
      toast.success(`${fullName.trim()} created`)
      onCreated()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add User">
      <div className="space-y-4">
        <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input
          label="Email"
          type="email"
          placeholder="name@umu.ac.ug"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role)
            setFacultyId('')
          }}
          options={ROLE_OPTIONS}
        />
        <p className="rounded border border-border bg-surface-1 px-4 py-3 text-body-sm text-text-secondary">
          This account will receive the system default password and must change it on first sign-in.
          {role === 'student' && ' The student will choose their faculty, programme and year on first login.'}
        </p>

        {isStaff && (
          <>
            <Select
              label="Faculty"
              placeholder="Select faculty"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              options={[
                ...staffFaculties.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` })),
              ]}
            />
            <p className="text-body-sm text-text-secondary">
              They will only be able to manage data within this faculty.
            </p>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={handleCreate}>
            Create User
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: ManagedUser
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()

  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [saving, setSaving] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const [fullName, setFullName] = useState(user.fullName)
  const [email, setEmail] = useState(user.email)
  const [facultyId, setFacultyId] = useState('')

  const isStudent = user.role === 'student'
  const isStaff = user.role === 'lecturer' || user.role === 'faculty_admin'

  useEffect(() => {
    setFullName(user.fullName)
    setEmail(user.email)
    setFacultyId(user.facultyId ?? '')
    profileApi
      .options()
      .then((opts) => { setOptions(opts) })
      .catch(() => setOptions(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const staffFaculties = useMemo(() => {
    return options?.campuses.flatMap((c) => c.faculties) ?? []
  }, [options])

  async function handleSave() {
    const payload: AdminUserUpdateInput = {
      fullName: fullName.trim(),
      email: email.trim(),
    }
    if (!payload.fullName) return toast.error('Full name is required')
    if (!payload.email) return toast.error('Email is required')

    if (isStaff) {
      if (!facultyId) return toast.error('Select a faculty')
      payload.facultyId = facultyId
    }

    setSaving(true)
    try {
      await userApi.update(user.id, payload)
      toast.success(`${user.fullName} updated`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword() {
    setResettingPassword(true)
    try {
      const { message } = await userApi.resetPassword(user.id)
      toast.success(message)
      setShowResetConfirm(false)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to reset password')
    } finally {
      setResettingPassword(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit User — ${user.fullName}`}>
      <div className="space-y-4">
        <Input label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        {isStudent && (
          <p className="rounded border border-border bg-surface-1 px-4 py-3 text-body-sm text-text-secondary">
            This student will manage their own academic profile (faculty, programme, year) from their profile page.
          </p>
        )}

        {isStaff && (
          <>
            <Select
              label="Faculty"
              placeholder="Select faculty"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              options={[
                ...staffFaculties.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` })),
              ]}
            />
            <p className="text-body-sm text-text-secondary">
              They will only be able to manage data within this faculty.
            </p>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={resettingPassword}
            onClick={() => setShowResetConfirm(true)}
          >
            Reset Password
          </Button>
          <Button loading={saving} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={showResetConfirm}
        title="Reset Password to Default"
        message={`Reset ${user.fullName}'s password to the system default? They will be forced to change it on next login. All their data is untouched.`}
        confirmLabel="Reset Password"
        loading={resettingPassword}
        onConfirm={handleResetPassword}
        onCancel={() => !resettingPassword && setShowResetConfirm(false)}
      />
    </Modal>
  )
}

export default function UserManagement() {
  const toast = useToast()

  const [data,     setData]     = useState<{ users: ManagedUser[]; total: number } | null>(null)
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [role,     setRole]     = useState('')
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  // Confirm modal state
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    onConfirm: () => Promise<void>
  } | null>(null)

  // Assign-faculty modal state
  const [assignTarget, setAssignTarget] = useState<ManagedUser | null>(null)
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)

  // Edit-user modal state
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null)

  // Create-user modal state
  const [creating, setCreating] = useState(false)

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
    academicApi
      .faculties()
      .then(setFaculties)
      .catch((e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'Failed to load faculties')
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function toggleSelected(userId: string) {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    )
  }

  function togglePageSelection() {
    const pageIds = data?.users.map((user) => user.id) ?? []
    const everyPageUserSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id))
    setSelectedIds((current) =>
      everyPageUserSelected
        ? current.filter((id) => !pageIds.includes(id))
        : [...new Set([...current, ...pageIds])]
    )
  }

  async function handleDeleteOne(user: ManagedUser) {
    setConfirm({
      title: 'Delete User',
      message: `Permanently delete ${user.fullName}? This cannot be undone.`,
      onConfirm: async () => {
        setDeleting(true)
        try {
          await userApi.remove(user.id)
          toast.success(`${user.fullName} deleted`)
          setSelectedIds((ids) => ids.filter((id) => id !== user.id))
          await reload()
        } catch (e) {
          toast.error(e instanceof ApiClientError ? e.message : 'Could not delete user')
        } finally {
          setDeleting(false)
          setConfirm(null)
        }
      },
    })
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) return
    setConfirm({
      title: 'Delete Selected Users',
      message: `Permanently delete ${selectedIds.length} selected user(s)? This cannot be undone.`,
      onConfirm: async () => {
        setDeleting(true)
        try {
          const { result } = await userApi.removeMany({ userIds: selectedIds })
          setSelectedIds([])
          toast.success(`${result.deleted} user(s) deleted${result.skipped ? `; ${result.skipped} skipped` : ''}`)
          if (result.errors.length) toast.error(`${result.errors.length} user(s) could not be deleted because they have linked records.`)
          await reload()
        } catch (e) {
          toast.error(e instanceof ApiClientError ? e.message : 'Could not delete selected users')
        } finally {
          setDeleting(false)
          setConfirm(null)
        }
      },
    })
  }

  async function handleDeleteAllMatching() {
    const scope = role || search ? 'all users matching the current filters' : 'all users except your own account'
    setConfirm({
      title: 'Delete All Users',
      message: `Permanently delete ${scope}? This cannot be undone.`,
      onConfirm: async () => {
        setDeleting(true)
        try {
          const { result } = await userApi.removeMany({
            allMatching: true,
            ...(role ? { role: role as Role } : {}),
            ...(search ? { search } : {}),
          })
          setSelectedIds([])
          toast.success(`${result.deleted} user(s) deleted${result.skipped ? `; ${result.skipped} skipped` : ''}`)
          if (result.errors.length) toast.error(`${result.errors.length} user(s) could not be deleted because they have linked records.`)
          await reload()
        } catch (e) {
          toast.error(e instanceof ApiClientError ? e.message : 'Could not delete users')
        } finally {
          setDeleting(false)
          setConfirm(null)
        }
      },
    })
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">User Management</h1>
          <p className="mt-1 text-body text-text-secondary">
            Manage accounts, roles, and faculty assignments. Users sign in with their email
            and password (or Google).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" loading={deleting} onClick={handleDeleteAllMatching}>Delete All</Button>
          <Button onClick={() => setCreating(true)}>Add User</Button>
        </div>
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

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded border border-danger-border bg-danger-light px-4 py-3">
          <p className="text-body-sm text-text-primary">{selectedIds.length} user(s) selected</p>
          <Button variant="danger" loading={deleting} onClick={handleDeleteSelected}>Delete Selected</Button>
        </div>
      )}

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
                  <th className="w-12 px-5 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all users on this page"
                      checked={data.users.length > 0 && data.users.every((user) => selectedIds.includes(user.id))}
                      onChange={togglePageSelection}
                    />
                  </th>
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

                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${u.fullName}`}
                        checked={selectedIds.includes(u.id)}
                        onChange={() => toggleSelected(u.id)}
                      />
                    </td>

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

                    {/* Role — read-only */}
                    <td className="px-4 py-3 text-body text-text-primary">
                      {ROLE_LABEL[u.role]}
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
                        <Button
                          variant="secondary"
                          className="px-3 py-1 text-body-sm"
                          onClick={() => setEditTarget(u)}
                        >
                          Edit
                        </Button>
                        {/* Assign Faculty — only for faculty_admin and lecturer */}
                        {(u.role === 'faculty_admin' || u.role === 'lecturer') && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1 text-body-sm"
                            onClick={() => openAssign(u)}
                          >
                            {u.facultyId ? 'Change Faculty' : 'Assign Faculty'}
                          </Button>
                        )}
                        <Button
                          variant={u.isActive ? 'danger' : 'secondary'}
                          className="px-3 py-1 text-body-sm"
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="danger"
                          className="px-3 py-1 text-body-sm"
                          loading={deleting}
                          onClick={() => handleDeleteOne(u)}
                        >
                          Delete
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
              ...faculties.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` })),
            ]}
          />


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

      {/* ── Edit user modal ── */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            reload()
          }}
        />
      )}

      {/* ── Add user modal ── */}
      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      {/* ── Confirm destructive action modal ── */}
      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => !deleting && setConfirm(null)}
      />
    </div>
  )
}
