import { useEffect, useState } from 'react'
import { userApi, academicApi, PreRegisterInput } from '../api/endpoints'
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

const STAFF_ROLE_OPTIONS = [
  { value: 'lecturer',      label: 'Lecturer' },
  { value: 'faculty_admin', label: 'Faculty Admin' },
  { value: 'system_admin',  label: 'System Admin' },
]

const ALL_ROLE_OPTIONS = [
  { value: '',              label: 'All Roles' },
  { value: 'student',       label: 'Student' },
  { value: 'lecturer',      label: 'Lecturer' },
  { value: 'faculty_admin', label: 'Faculty Admin' },
  { value: 'system_admin',  label: 'System Admin' },
]

// ── Pre-Register Modal ──────────────────────────────────────────────────────
function PreRegisterModal({
  faculties,
  onClose,
  onCreated,
}: {
  faculties: Faculty[]
  onClose: () => void
  onCreated: () => void
}) {
  const toast = useToast()
  const [email,     setEmail]     = useState('')
  const [role,      setRole]      = useState<'lecturer' | 'faculty_admin' | 'system_admin'>('lecturer')
  const [facultyId, setFacultyId] = useState('')
  const [saving,    setSaving]    = useState(false)

  const needsFaculty = role === 'faculty_admin'

  async function handleCreate() {
    if (!email.trim()) return toast.error('Email is required')
    if (needsFaculty && !facultyId) return toast.error('Faculty is required for Faculty Admin')

    const payload: PreRegisterInput = {
      email: email.trim().toLowerCase(),
      role,
      ...(needsFaculty ? { facultyId } : {}),
    }

    setSaving(true)
    try {
      await userApi.create(payload)
      toast.success('Account pre-registered. They can now sign in with Google.')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to pre-register account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Pre-Register Staff Account">
      <div className="space-y-4">
        <p className="text-body-sm text-text-secondary">
          Enter the staff member's UMU email and role. They complete their profile on first Google login.
        </p>
        <Input
          label="UMU Email (@umu.ac.ug)"
          type="email"
          placeholder="name@umu.ac.ug"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => { setRole(e.target.value as typeof role); setFacultyId('') }}
          options={STAFF_ROLE_OPTIONS}
        />
        {needsFaculty && (
          <>
            <Select
              label="Faculty"
              placeholder="Select faculty"
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              options={faculties.map((f) => ({ value: f.id, label: f.name }))}
            />
            <p className="text-xs text-text-secondary">
              Faculty Admin is linked to this faculty and goes straight to dashboard on first login.
            </p>
          </>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={handleCreate}>Pre-Register</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function UserManagement() {
  const toast = useToast()

  const [users,       setUsers]       = useState<ManagedUser[]>([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [search,      setSearch]      = useState('')
  const [roleFilter,  setRoleFilter]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [faculties,   setFaculties]   = useState<Faculty[]>([])
  const [showCreate,  setShowCreate]  = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null)
  const [deleting,    setDeleting]    = useState(false)
  const [actioning,   setActioning]   = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function load() {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) }
      if (search)     params.search = search
      if (roleFilter) params.role   = roleFilter
      const res = await userApi.list(params)
      setUsers(res.users)
      setTotal(res.total)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [page, roleFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    academicApi.faculties().then(setFaculties).catch(() => setFaculties([]))
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    void load()
  }

  async function handleToggleActive(u: ManagedUser) {
    setActioning(u.id)
    try {
      await (u.isActive ? userApi.deactivate(u.id) : userApi.activate(u.id))
      toast.success(`${u.fullName || u.email} ${u.isActive ? 'deactivated' : 'activated'}`)
      void load()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Action failed')
    } finally {
      setActioning(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await userApi.remove(deleteTarget.id)
      toast.success('Account deleted')
      setDeleteTarget(null)
      void load()
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Failed to delete — deactivate instead if they have records')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">User Management</h1>
          <p className="text-body-sm text-text-secondary">Pre-register staff and manage all accounts.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Pre-Register Staff</Button>
      </div>

      {/* Filters */}
      <Card>
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <Input
            placeholder="Search name, email, reg number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[220px] flex-1"
          />
          <Select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
            options={ALL_ROLE_OPTIONS}
            className="min-w-[160px]"
          />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-text-secondary">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Faculty</th>
                  <th className="pb-3 pr-4">Profile</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        {u.photoUrl ? (
                          <img src={u.photoUrl} alt={u.fullName} className="h-8 w-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-text-secondary shrink-0">
                            {(u.fullName || u.email)[0]?.toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-text-primary truncate">
                            {u.fullName || <span className="italic text-text-disabled">Not set yet</span>}
                          </p>
                          <p className="text-xs text-text-secondary truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-secondary whitespace-nowrap">
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary text-xs">
                      {u.faculty?.name ?? <span className="text-text-disabled">—</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold ${u.profileComplete ? 'text-success' : 'text-warning'}`}>
                        {u.profileComplete ? 'Complete' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold ${u.isActive ? 'text-success' : 'text-danger'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={actioning === u.id}
                          className="text-xs font-medium text-umu-red hover:underline disabled:opacity-40"
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          className="text-xs font-medium text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
            <span>{total} total users</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <span className="px-2">Page {page} of {totalPages}</span>
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Pre-register modal */}
      {showCreate && (
        <PreRegisterModal
          faculties={faculties}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setPage(1); void load() }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete account?"
        message={`Permanently delete ${deleteTarget?.fullName || deleteTarget?.email}? If they have attendance records, deactivate instead.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
