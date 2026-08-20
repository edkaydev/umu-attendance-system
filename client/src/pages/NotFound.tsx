import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found | UMU Attendance'
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6">
      <h1 className="text-display font-bold text-text-primary">404</h1>
      <p className="mt-2 text-body-lg text-text-secondary">This page does not exist.</p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-[44px] items-center rounded bg-umu-red px-6 py-3 text-sm font-semibold text-white hover:bg-umu-red-dark"
      >
        Back to home
      </Link>
    </div>
  )
}
