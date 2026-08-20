import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'

export const DASHBOARD_BY_ROLE: Record<Role, string> = {
  student: '/student',
  lecturer: '/lecturer',
  faculty_admin: '/faculty-admin',
  system_admin: '/system-admin',
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-umu-red border-t-transparent" />
      <p className="text-body-sm text-text-secondary">Loading your account…</p>
    </div>
  )
}

/** Requires an authenticated user. If password change is pending, force it; otherwise profile setup. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  // Must change password — only the change-password screen is allowed
  if (user.mustChangePassword && location.pathname !== '/password/change') {
    return <Navigate to="/password/change" replace />
  }

  // Password is fine — leave the change-password screen, go to the right place
  if (!user.mustChangePassword && location.pathname === '/password/change') {
    const next = !user.profileComplete
      ? '/profile/setup'
      : DASHBOARD_BY_ROLE[user.role]
    return <Navigate to={next} replace />
  }

  // Profile not yet complete — only the setup screen is allowed
  if (!user.mustChangePassword && !user.profileComplete && location.pathname !== '/profile/setup') {
    return <Navigate to="/profile/setup" replace />
  }

  // Profile already complete — don't go back to setup
  if (user.profileComplete && location.pathname === '/profile/setup') {
    return <Navigate to={DASHBOARD_BY_ROLE[user.role]} replace />
  }

  return <>{children}</>
}

/** Requires the user to have one of the given roles. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/access-denied" replace />
  return <>{children}</>
}

/** Only reachable when logged out (login page). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (user) {
    const target = user.mustChangePassword
      ? '/password/change'
      : user.profileComplete
        ? DASHBOARD_BY_ROLE[user.role]
        : '/profile/setup'
    return <Navigate to={target} replace />
  }
  return <>{children}</>
}
