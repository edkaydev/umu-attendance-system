import { Request, Response } from 'express'
import { addSseClient } from '../services/events.service'

/**
 * GET /api/events — Server-Sent Events stream of realtime change signals.
 * Authenticated via the session cookie (EventSource sends cookies same-origin).
 * Only event names travel down the wire — never payloads.
 */
export function getSseStream(req: Request, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tell nginx not to buffer this response so events arrive instantly.
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  const cleanup = addSseClient(
    req.user!.id,
    req.user!.role,
    (chunk) => res.write(chunk),
    () => res.end()
  )
  req.on('close', cleanup)
}
