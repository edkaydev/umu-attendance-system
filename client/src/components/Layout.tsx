import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

const NAV_BY_ROLE: Record<Role, { to: string; label: string; icon: string }[]> = {
  student: [
    { to: '/student', label: 'Dashboard', icon: '🏠' },
    { to: '/student/attendance', label: 'My Attendance', icon: '📋' },
  ],
  lecturer: [
    { to: '/lecturer', label: 'Dashboard', icon: '🏠' },
    { to: '/lecturer/sessions', label: 'Sessions', icon: '📅' },
  ],
  faculty_admin: [
    { to: '/faculty-admin', label: 'Dashboard', icon: '🏠' },
    { to: '/faculty-admin/reports', label: 'Reports', icon: '📊' },
    { to: '/faculty-admin/audit', label: 'Audit Log', icon: '🧾' },
  ],
  system_admin: [
    { to: '/system-admin', label: 'Dashboard', icon: '🏠' },
    { to: '/system-admin/academic', label: 'Academic Setup', icon: '🏫' },
    { to: '/system-admin/users', label: 'Users', icon: '👥' },
    { to: '/system-admin/imports', label: 'Imports', icon: '📥' },
    { to: '/system-admin/logs', label: 'System Log', icon: '🧾' },
  ],
}

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  lecturer: 'Lecturer',
  faculty_admin: 'Faculty Admin',
  system_admin: 'System Admin',
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const nav = NAV_BY_ROLE[user.role] ?? []

  return (
    <div className="flex min-h-screen bg-white">
      {/* Desktop sidebar */}
      <aside className="hidden w-[240px] shrink-0 border-r border-border bg-white shadow-[2px_0_8px_rgba(0,0,0,0.04)] md:block">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-umu-red font-display-bold text-sm text-white">
            U
          </span>
          <span className="text-base font-bold text-text-primary">UMU Attendance</span>
        </div>
        <nav className="space-y-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${user.role}`}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded px-4 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-l-[3px] border-umu-red bg-[#FFF4F4] text-umu-red'
                    : 'text-text-primary hover:bg-surface-1'
                }`
              }
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-umu-red md:hidden">UMU</span>
            <span className="hidden text-sm text-text-secondary md:block">
              {user.faculty?.name ?? ROLE_LABEL[user.role]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-text-primary">{user.fullName}</p>
              <p className="text-xs text-text-secondary">{user.email}</p>
            </div>
            <span className="rounded-full bg-surface-1 px-3 py-1 text-xs font-medium text-text-secondary">
              {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={logout}
              className="min-h-[36px] rounded px-3 text-sm font-medium text-umu-red hover:bg-[#FFF4F4]"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav (student & lecturer) */}
      {(user.role === 'student' || user.role === 'lecturer') && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-white md:hidden">
          {nav.map((item) => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-text-secondary"
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
