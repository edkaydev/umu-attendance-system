import { useState } from 'react'
import { GuestOnly } from '../components/RouteGuards'
import { authApi } from '../api/endpoints'
import type { Role } from '../types'

const DEV_ROLES: { role: Role; label: string }[] = [
  { role: 'student', label: 'Student' },
  { role: 'lecturer', label: 'Lecturer' },
  { role: 'faculty_admin', label: 'Faculty Admin' },
  { role: 'system_admin', label: 'System Admin' },
]

export default function Login() {
  const [devError, setDevError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState<Role | null>(null)

  async function devLogin(role: Role) {
    setDevError(null)
    setLoggingIn(role)
    try {
      const res = await authApi.devLogin(role)
      window.location.assign(res.redirect)
    } catch {
      setDevError('Dev login failed. Is the server running in development mode?')
    } finally {
      setLoggingIn(null)
    }
  }

  return (
    <GuestOnly>
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
        <img src="/umu-logo.png" alt="UMU logo" className="mb-4 h-20 w-20 rounded-full object-cover shadow" />
        <h1 className="text-h1 font-bold text-text-primary">Uganda Martyrs University</h1>
        <p className="mt-1 text-h3 text-text-secondary">Attendance System</p>

        <a
          href="/api/auth/google"
          className="mt-10 inline-flex min-h-[48px] items-center gap-3 rounded border-[1.5px] border-border bg-white px-8 py-3 text-body-lg font-medium text-text-primary shadow-sm transition-shadow hover:shadow"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          Sign in with Google
        </a>

        {import.meta.env.DEV && (
          <div className="mt-10 w-full max-w-sm rounded-lg border border-border bg-surface-1 p-5">
            <p className="mb-3 text-center text-body-sm font-semibold text-text-secondary">
              Dev login (no Google)
            </p>
            <div className="flex flex-col gap-2">
              {DEV_ROLES.map(({ role, label }) => (
                <button
                  key={role}
                  onClick={() => devLogin(role)}
                  disabled={loggingIn !== null}
                  className="min-h-[40px] rounded bg-umu-red px-4 text-body-sm font-semibold text-white hover:bg-umu-red-dark disabled:opacity-60"
                >
                  {loggingIn === role ? 'Signing in…' : `Login as ${label}`}
                </button>
              ))}
            </div>
            {devError && <p className="mt-3 text-center text-body-sm text-red-600">{devError}</p>}
          </div>
        )}

        <p className="mt-10 text-body-sm text-text-disabled">Nkozi Campus · 2025/2026</p>
      </div>
    </GuestOnly>
  )
}
