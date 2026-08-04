import { useLocation } from 'react-router-dom'

const REASON_LABELS: Record<string, string> = {
  'invalid-domain':
    'Your email domain is not allowed. Use a @stud.umu.ac.ug or @umu.ac.ug address.',
  'not-registered':
    'This email is not registered in the UMU Attendance System. Contact your Faculty Admin.',
  'account-disabled': 'Your account has been deactivated. Contact the System Administrator.',
  'no-email': 'Google did not return an email address. Try signing in again.',
}

export default function AccessDenied() {
  const params = new URLSearchParams(useLocation().search)
  const reason = params.get('reason') ?? 'error'
  const message = REASON_LABELS[reason] ?? 'Something went wrong during sign-in.'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger-light text-3xl">
        🚫
      </div>
      <h1 className="text-h1 font-bold text-text-primary">Access Denied</h1>
      <p className="mt-3 max-w-md text-center text-body-lg text-text-secondary">{message}</p>
      <a
        href="/api/auth/google"
        className="mt-8 inline-flex min-h-[44px] items-center rounded bg-umu-red px-6 py-3 text-sm font-semibold text-white hover:bg-umu-red-dark"
      >
        Try signing in again
      </a>
    </div>
  )
}
