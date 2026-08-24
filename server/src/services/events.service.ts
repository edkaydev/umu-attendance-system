import { EventEmitter } from 'events'

/**
 * Lightweight real-time sync bus.
 *
 * Mutations publish coarse event names ("sessions-changed", "enrollments-changed", …).
 * Connected clients receive them over Server-Sent Events and immediately refetch
 * the affected views — no payloads travel through this channel, only signals,
 * so there is no data-leak surface here.
 */

export type RealtimeEvent =
  | 'sessions-changed'
  | 'attendance-changed'
  | 'assignments-changed'
  | 'enrollments-changed'
  | 'curriculum-changed'
  | 'users-changed'

const bus = new EventEmitter()
bus.setMaxListeners(0) // one listener per connected client

type Client = {
  id: number
  userId: string
  role: string
  write: (chunk: string) => void
}

const clients = new Map<number, Client>()
let nextClientId = 1

export function publish(event: RealtimeEvent): void {
  const frame = `event: ${event}\ndata: {}\n\n`
  for (const client of clients.values()) {
    try {
      client.write(frame)
    } catch {
      clients.delete(client.id)
    }
  }
}

export function clientCount(): number {
  return clients.size
}

/** Registers an SSE client; returns a cleanup function. */
export function addSseClient(
  userId: string,
  role: string,
  write: (chunk: string) => void,
  onClose: () => void
): () => void {
  const id = nextClientId++
  clients.set(id, { id, userId, role, write })
  write(`event: connected\ndata: {"clientId":${id}}\n\n`)
  const heartbeat = setInterval(() => {
    try {
      write(`: ping ${Date.now()}\n\n`)
    } catch {
      /* closed */
    }
  }, 25_000)
  return () => {
    clearInterval(heartbeat)
    clients.delete(id)
    onClose()
  }
}
