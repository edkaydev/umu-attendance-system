import { useState } from 'react'
import { GuestOnly } from '../components/RouteGuards'
import { authApi } from '../api/endpoints'
import { ApiClientError } from '../api/client'
import { usePeriod } from '../hooks/usePeriod'
import type { Role } from '../types'

const DEV_ROLES: { role: Role; label: string }[] = [
  { role: 'student',       label: 'Student' },
  { role: 'lecturer',      label: 'Lecturer' },
  { role: 'faculty_admin', label: 'Faculty Admin' },
  { role: 'system_admin',  label: 'System Admin' },
]

export default function Login() {
  const { period } = usePeriod()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [devError, setDevError] = useState<string | null>(null)
  const [devLoggingIn, setDevLoggingIn] = useState<Role | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoggingIn(true)
    try {
      const res = await authApi.login(email.trim(), password)
      window.location.assign(res.redirect)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Login failed. Please try again.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function devLogin(role: Role) {
    setDevError(null)
    setDevLoggingIn(role)
    try {
      const res = await authApi.devLogin(role)
      window.location.assign(res.redirect)
    } catch {
      setDevError('Dev login failed. Is the server running in development mode?')
    } finally {
      setDevLoggingIn(null)
    }
  }

  return (
    <GuestOnly>
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">

        {/* Logo + wordmark */}
        <img src="/umu-logo.png" alt="Uganda Martyrs University crest" className="mb-6 h-24 w-auto" />
        <h1 className="text-h1 font-bold text-text-primary">Uganda Martyrs University</h1>
        <p className="mt-1 text-h3 text-text-secondary">Attendance System</p>

        {/* Email + password sign in */}
        <form
          onSubmit={handleLogin}
          className="mt-10 w-full max-w-sm rounded-md border border-border bg-surface-1 p-6"
        >
          <label className="mb-1 block text-label font-semibold uppercase tracking-wide text-text-secondary">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="username"
            placeholder="name@umu.ac.ug"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 min-h-[44px] w-full rounded border border-border bg-white px-3 text-body text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
          />

          <label className="mb-1 block text-label font-semibold uppercase tracking-wide text-text-secondary">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-2 min-h-[44px] w-full rounded border border-border bg-white px-3 text-body text-text-primary placeholder:text-text-disabled focus:border-umu-red focus:outline-none"
          />

          {error && <p className="mb-2 text-center text-body-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loggingIn}
            className="mt-4 min-h-[48px] w-full rounded bg-umu-red px-8 py-3 text-body-lg font-semibold text-white transition-colors duration-150 hover:bg-umu-red-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Google sign-in — no shadow, just border (Google I/O style) */}
        <a
          href="/api/auth/google"
          className="mt-4 inline-flex min-h-[48px] items-center gap-3 rounded border border-border bg-white px-8 py-3 text-body-lg font-medium text-text-primary transition-colors duration-150 hover:bg-surface-1 active:bg-surface-2"
        >
          {/* Official Google G SVG */}
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </a>

        {/* Developer bypass — only in dev mode */}
        {import.meta.env.DEV && (
          <div className="mt-10 w-full max-w-sm rounded-md border border-border bg-surface-1 p-5">
            <p className="mb-3 text-center text-label font-semibold uppercase tracking-wide text-text-secondary">
              Dev login — no Google needed
            </p>
            <div className="flex flex-col gap-2">
              {DEV_ROLES.map(({ role, label }) => (
                <button
                  key={role}
                  onClick={() => devLogin(role)}
                  disabled={devLoggingIn !== null}
                  className="min-h-[40px] rounded border border-umu-red bg-white px-4 text-body font-semibold text-umu-red transition-colors hover:bg-[#FFF4F4] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {devLoggingIn === role ? 'Signing in…' : `Login as ${label}`}
                </button>
              ))}
            </div>
            {devError && (
              <p className="mt-3 text-center text-body-sm text-danger">{devError}</p>
            )}
          </div>
        )}

        <p className="mt-10 text-body-sm text-text-disabled">
          Nkozi Campus · {period?.academicYear ?? '—'}
        </p>
      </div>
    </GuestOnly>
  )
}
