import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { profileApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import type { TourStep } from './tour/tourConfig'
import { TOUR_VERSION } from './tour/tourConfig'

/**
 * Custom onboarding tour — spotlight overlay + anchored tooltip.
 *
 * - Fires once per user: the dashboard gates on `user.hasCompletedTour`
 *   (persisted server-side); localStorage keyed by TOUR_VERSION is kept as an
 *   instant per-browser guard and offline fallback. `restart()` from the
 *   Layout help button replays it on demand.
 * - Targets are elements carrying data-tour="<target>"; steps whose element
 *   is missing are skipped automatically (empty states never break the tour).
 * - Tooltips auto-flip above/below the target near viewport edges; below
 *   640px the tooltip docks as a bottom sheet.
 * - Esc exits, clicking the backdrop skips, Tab is trapped in the tooltip,
 *   Arrow keys navigate. Respects prefers-reduced-motion.
 */

const STORAGE_PREFIX = `umu_tour_done_v${TOUR_VERSION}_`
const PAD = 8 // spotlight padding around target
const GAP = 14 // gap between spotlight and tooltip
const TIP_W = 340 // fixed tooltip width (px)
const MARGIN = 16 // min distance from viewport edge

interface TourState {
  userId: string
  steps: TourStep[]
}

interface TourApi {
  startOnce: (userId: string, steps: TourStep[]) => void
  restart: (userId: string, steps: TourStep[]) => void
}

const TourCtx = createContext<TourApi | null>(null)

export function useTour(): TourApi {
  const ctx = useContext(TourCtx)
  if (!ctx) throw new Error('useTour must be used inside OnboardingTourProvider')
  return ctx
}

function isTourDone(userId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId) === '1'
  } catch {
    return true // storage unavailable → never nag the user
  }
}

function markTourDone(userId: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Persist completion: optimistic context update + server write.
 * The API call is fire-and-forget — a failure must never trap the user in
 * the tour; the flag will reconcile on their next /auth/me fetch.
 */
function useFinishTour() {
  const { updateUser } = useAuth()
  return useCallback(
    (userId: string) => {
      markTourDone(userId)
      updateUser({ hasCompletedTour: true })
      profileApi.markTourComplete().catch(() => {})
    },
    [updateUser],
  )
}

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const [tour, setTour] = useState<TourState | null>(null)

  const begin = useCallback((userId: string, steps: TourStep[], force: boolean) => {
    if (!force && isTourDone(userId)) return
    // Only keep steps whose targets currently exist — empty states are fine.
    const valid = steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
    if (valid.length === 0) return
    setTour({ userId, steps: valid })
  }, [])

  const startOnce = useCallback(
    (userId: string, steps: TourStep[]) => begin(userId, steps, false),
    [begin],
  )
  const restart = useCallback(
    (userId: string, steps: TourStep[]) => begin(userId, steps, true),
    [begin],
  )

  const api = useMemo(() => ({ startOnce, restart }), [startOnce, restart])

  return (
    <TourCtx.Provider value={api}>
      {children}
      {tour && (
        <TourOverlay
          key={`${tour.userId}-${tour.steps.map((s) => s.target).join()}`}
          tour={tour}
          onEnd={() => setTour(null)}
        />
      )}
    </TourCtx.Provider>
  )
}

// ─── Overlay engine ──────────────────────────────────────────────────────────

function TourOverlay({ tour, onEnd }: { tour: TourState; onEnd: () => void }) {
  const { userId, steps } = tour
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const finishTour = useFinishTour()

  const [rect, setRect] = useState<DOMRect | null>(null)
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null)
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 639px)').matches,
  )
  const reduceMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const tipRef = useRef<HTMLDivElement>(null)
  const nextBtnRef = useRef<HTMLButtonElement>(null)

  /** Advance/backward, skipping steps whose element vanished mid-tour. */
  const go = useCallback(
    (dir: 1 | -1) => {
      let i = index + dir
      while (i >= 0 && i < steps.length && !document.querySelector(`[data-tour="${steps[i].target}"]`)) {
        i += dir
      }
      if (i < 0 || i >= steps.length) {
        finishTour(userId)
        onEnd()
      } else {
        setIndex(i)
      }
    },
    [index, steps, userId, onEnd, finishTour],
  )

  const skip = useCallback(() => {
    finishTour(userId)
    onEnd()
  }, [userId, onEnd, finishTour])

  // ── Measure + scroll target into view on every step change ──
  useLayoutEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (!el) {
      go(1)
      return
    }
    el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })

    let raf = 0
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    // Smooth scroll settles over time — re-measure until it does.
    const timers = [
      window.setTimeout(measure, reduceMotion ? 60 : 350),
      window.setTimeout(measure, reduceMotion ? 120 : 700),
    ]
    const onReflow = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)

    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [step.target, index, reduceMotion, go])

  // ── Position tooltip with collision flip once measured ──
  useLayoutEffect(() => {
    if (!rect) return
    if (isMobile) {
      setTipPos(null)
      return
    }
    const tipH = tipRef.current?.offsetHeight ?? 150
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - TIP_W / 2), vw - TIP_W - MARGIN)
    const fitsBelow = rect.bottom + GAP + tipH < vh - MARGIN
    const top = fitsBelow ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - tipH)
    setTipPos({ top, left })
  }, [rect, isMobile])

  // ── Mobile breakpoint listener ──
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── Keyboard: Esc exit, arrows navigate, focus primary button per step ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
      if (e.key === 'Escape') {
        e.preventDefault()
        skip()
      } else if (e.key === 'ArrowRight' && !typing) {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft' && !typing) {
        e.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [skip, go])

  useEffect(() => {
    const t = window.setTimeout(() => nextBtnRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [index])

  /** Trap Tab inside the tooltip card. */
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !tipRef.current) return
    const focusable = tipRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const isLast = index === steps.length - 1

  return (
    <>
      {/* Backdrop — click anywhere to skip */}
      <div className="fixed inset-0 z-[70]" onClick={skip} aria-hidden="true" />

      {/* Spotlight cutout (desktop only) */}
      {!isMobile && rect && (
        <div
          className="pointer-events-none fixed z-[71] rounded-lg ring-4 ring-white transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 200vmax rgba(15, 23, 42, 0.55)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Screen-reader announcement */}
      <p className="sr-only" role="status" aria-live="polite">
        {`Step ${index + 1} of ${steps.length}: ${step.title}. ${step.content}`}
      </p>

      {/* Tooltip / bottom sheet */}
      <div
        ref={tipRef}
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        onKeyDown={trapTab}
        className={
          isMobile
            ? 'fixed inset-x-2 bottom-2 z-[72] rounded-xl border border-border bg-white p-5 shadow-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))]'
            : 'fixed z-[72] rounded-md border border-border bg-white p-5 shadow-xl'
        }
        style={
          !isMobile && tipPos
            ? { top: tipPos.top, left: tipPos.left, width: TIP_W }
            : undefined
        }
      >
        {/* pointer notch toward the target (desktop) */}
        {!isMobile && rect && tipPos && (
          <span
            aria-hidden="true"
            className={`absolute h-3 w-3 rotate-45 border border-border bg-white ${
              tipPos.top > rect.bottom
                ? '-top-[7px] border-b-0 border-r-0'
                : '-bottom-[7px] border-l-0 border-t-0'
            }`}
            style={{
              left: Math.min(
                Math.max(rect.left + rect.width / 2 - tipPos.left - 6, 12),
                TIP_W - 24,
              ),
            }}
          />
        )}

        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-label font-semibold uppercase tracking-wide text-text-disabled">
            Step {index + 1} of {steps.length}
          </span>
          <button
            onClick={skip}
            className="min-h-[44px] rounded px-2 text-body-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Skip
          </button>
        </div>
        <h3 className="text-h4 font-semibold text-text-primary">{step.title}</h3>
        <p className="mt-1.5 text-body-sm text-text-secondary">{step.content}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-5 rounded-full transition-colors ${
                  i === index ? 'bg-umu-red' : i < index ? 'bg-umu-red/40' : 'bg-surface-3'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => go(-1)}
              disabled={index === 0}
              className="min-h-[44px] rounded px-4 text-body-sm font-semibold text-text-secondary hover:bg-surface-1 disabled:opacity-40"
            >
              Back
            </button>
            <button
              ref={nextBtnRef}
              onClick={() => go(1)}
              className="min-h-[44px] rounded bg-umu-red px-5 text-body-sm font-semibold text-white transition-colors hover:bg-umu-red-dark focus:outline-none focus:ring-4 focus:ring-umu-red/30"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
