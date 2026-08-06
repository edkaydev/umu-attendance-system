import { useState, useEffect } from 'react'

const COOKIE_KEY = 'umu_cookie_consent'

/**
 * Cookie consent banner — shown once to every new visitor.
 * Stores acceptance in localStorage so it only appears once per browser.
 * UMU uses only strictly-necessary session cookies (auth JWT in HttpOnly cookie),
 * so there is no "decline" option — just an acknowledgement.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show only if the user hasn't consented yet
    if (!localStorage.getItem(COOKIE_KEY)) {
      // Small delay so it doesn't flash on top of the loading spinner
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  function accept() {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white px-4 py-4 shadow-lg sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Text */}
        <p className="text-body-sm text-text-secondary">
          <span className="font-semibold text-text-primary">We use cookies.</span>{' '}
          UMU Attendance System uses strictly-necessary cookies to keep you signed in securely.
          No tracking or advertising cookies are used.{' '}
          <a
            href="https://www.umu.ac.ug/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-umu-red underline hover:no-underline"
          >
            Privacy policy
          </a>
        </p>

        {/* Actions */}
        <div className="flex shrink-0 gap-2">
          <button
            onClick={accept}
            className="rounded bg-umu-red px-5 py-2 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-umu-red focus:ring-offset-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
