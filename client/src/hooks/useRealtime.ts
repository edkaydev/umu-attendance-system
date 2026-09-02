import { useEffect, useRef } from 'react'

/**
 * Realtime sync — one shared EventSource per browser session.
 *
 * The server broadcasts coarse change signals ("sessions-changed",
 * "enrollments-changed", …) over /api/events. Subscribing components refetch
 * immediately instead of waiting for the next poll, so every user sees
 * each other's changes within a second.
 */
export type RealtimeEvent =
  | 'connected'
  | 'sessions-changed'
  | 'attendance-changed'
  | 'assignments-changed'
  | 'enrollments-changed'
  | 'curriculum-changed'
  | 'users-changed'
  | 'excuse-changed'

type Listener = (event: RealtimeEvent) => void

let source: EventSource | null = null
const listeners = new Set<Listener>()

function ensureSource(): void {
  if (source || typeof window === 'undefined') return
  source = new EventSource('/api/events')
  const forward = (e: MessageEvent) => {
    for (const l of listeners) l(e.type as RealtimeEvent)
  }
  for (const name of [
    'connected',
    'sessions-changed',
    'attendance-changed',
    'assignments-changed',
    'enrollments-changed',
    'curriculum-changed',
    'users-changed',
    'excuse-changed',
  ]) {
    source.addEventListener(name, forward as EventListener)
  }
  // Browser auto-reconnects on drop; recreate the source if it gave up.
  source.onerror = () => {
    source?.close()
    source = null
    window.setTimeout(ensureSource, 3000)
  }
}

/** Subscribe to realtime events. Re-runs `cb` whenever any listed event fires. */
export function useRealtime(events: RealtimeEvent[], cb: () => void): void {
  const cbRef = useRef(cb)
  cbRef.current = cb
  const key = events.join(',')
  useEffect(() => {
    ensureSource()
    const listener: Listener = (e) => {
      if (key.split(',').includes(e)) cbRef.current()
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
