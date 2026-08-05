import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

// ─── SVG icon components ─────────────────────────────────────────────────────
// All 20×20, strokeWidth 1.75, rounded line caps — Google I/O / Material Symbols style

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconClipboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1"/>
      <path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/>
      <line x1="9" y1="10" x2="15" y2="10"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function IconBarChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="12" width="4" height="9" rx="1"/>
      <rect x="10" y="7" width="4" height="14" rx="1"/>
      <rect x="17" y="3" width="4" height="18" rx="1"/>
    </svg>
  )
}


function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="4"/>
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      <path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"/>
    </svg>
  )
}

function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18"/>
      <path d="M9 21V9"/>
    </svg>
  )
}

function IconUpload() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

function IconScroll() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="13" y2="17"/>
    </svg>
  )
}

function IconLogOut() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

// ─── Nav config ──────────────────────────────────────────────────────────────

type NavItem = { to: string; label: string; Icon: () => JSX.Element }

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  student: [
    { to: '/student',            label: 'Dashboard',    Icon: IconHome },
    { to: '/student/attendance', label: 'My Attendance', Icon: IconClipboard },
    { to: '/student/profile',    label: 'My Profile',   Icon: IconUser },
  ],
  lecturer: [
    { to: '/lecturer',          label: 'Dashboard', Icon: IconHome },
    { to: '/lecturer/sessions', label: 'Sessions',  Icon: IconCalendar },
    { to: '/lecturer/profile',  label: 'My Profile', Icon: IconUser },
  ],
  faculty_admin: [
    { to: '/faculty-admin',         label: 'Dashboard', Icon: IconHome },
    { to: '/faculty-admin/units',   label: 'Units',     Icon: IconClipboard },
    { to: '/faculty-admin/reports', label: 'Reports',   Icon: IconBarChart },
  ],
  system_admin: [
    { to: '/system-admin',           label: 'Dashboard',      Icon: IconHome },
    { to: '/system-admin/academic',  label: 'Academic Setup', Icon: IconBuilding },
    { to: '/system-admin/users',     label: 'Users',          Icon: IconUsers },
    { to: '/system-admin/imports',   label: 'Imports',        Icon: IconUpload },
    { to: '/system-admin/logs',      label: 'System Log',     Icon: IconScroll },
  ],
}

const ROLE_LABEL: Record<Role, string> = {
  student:       'Student',
  lecturer:      'Lecturer',
  faculty_admin: 'Faculty Admin',
  system_admin:  'System Admin',
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const nav = NAV_BY_ROLE[user.role] ?? []

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden w-[240px] shrink-0 border-r border-border bg-white md:flex md:flex-col">
        {/* Logo area */}
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <img src="/umu-logo.png" alt="UMU logo" className="h-8 w-auto" />
          <span className="text-h4 font-bold text-text-primary leading-tight">UMU Attendance</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 p-3" aria-label="Main navigation">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === `/${user.role.replace('_', '-')}`}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded px-3 text-body font-medium transition-colors duration-100 ${
                  isActive
                    ? 'bg-[#FFF4F4] text-umu-red'
                    : 'text-text-primary hover:bg-surface-1'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-umu-red' : 'text-text-secondary'}>
                    <Icon />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer: user info */}
        <div className="border-t border-border px-4 py-3">
          <p className="text-body-sm font-medium text-text-primary truncate">{user.fullName}</p>
          <p className="text-body-sm text-text-secondary truncate">{ROLE_LABEL[user.role]}</p>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Top header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-5 md:px-6">
          {/* Left: title (mobile shows UMU wordmark, desktop shows faculty/role) */}
          <div className="flex items-center gap-2">
            <img src="/umu-logo.png" alt="UMU" className="h-7 w-auto md:hidden" />
            <span className="text-body font-semibold text-text-secondary md:block hidden">
              {user.faculty?.name ?? ROLE_LABEL[user.role]}
            </span>
          </div>

          {/* Right: user + logout */}
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-body font-medium text-text-primary leading-tight">{user.fullName}</p>
              <p className="text-body-sm text-text-secondary">{user.email}</p>
            </div>
            <span className="hidden rounded-sm bg-surface-2 px-2.5 py-1 text-label font-medium text-text-secondary sm:inline">
              {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={logout}
              aria-label="Log out"
              className="flex min-h-[36px] items-center gap-1.5 rounded px-3 text-body font-medium text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary"
            >
              <IconLogOut />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>

      {/* ── Mobile bottom nav (student & lecturer only) ── */}
      {(user.role === 'student' || user.role === 'lecturer') && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-white md:hidden"
          aria-label="Mobile navigation"
        >
          {nav.map(({ to, label, Icon }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-secondary transition-colors active:bg-surface-1"
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
