/**
 * Auto-close scheduler (FR-05.x classDuration).
 *
 * Every minute this scheduler queries for open sessions whose
 * classDuration has elapsed (openedAt + classDuration minutes ≤ now)
 * and closes them, auto-marking absentees exactly like the manual
 * close path.
 *
 * Design notes:
 * - Single-process safe: the session.update uses a WHERE status='open'
 *   filter so two overlapping ticks can't double-close the same session.
 * - Uses the shared closeSession() logic so audit logs and absent records
 *   are written consistently.
 * - The interval is 60 s; sessions may close up to ~60 s late, which is
 *   acceptable for a class-attendance scenario.
 */

import { prisma } from '../config/db'
import { SessionStatus } from '@prisma/client'
import { writeAuditLog } from './audit'
import { markAbsentees } from './sessionClose'
import { tryRedis } from '../config/redis'
import { randomUUID } from 'crypto'

const TICK_MS = 60_000 // 1 minute
const LEADER_LOCK_KEY = 'scheduler:leader'
const LEADER_LOCK_TTL_MS = 90_000
const INSTANCE_ID = `${process.pid}-${randomUUID().slice(0, 8)}`

async function closeSingleSession(sessionId: string): Promise<void> {
  // Atomically mark the session closed only if it is still open.
  // If another tick or a manual close already changed the status this
  // update returns count=0 and we skip the absent-record creation.
  const result = await prisma.session.updateMany({
    where: { id: sessionId, status: SessionStatus.open },
    data: { status: SessionStatus.closed, closedAt: new Date() },
  })

  if (result.count === 0) return // already closed by someone else

  // Fetch the session details needed to build absent records.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { courseUnitId: true, academicYear: true, semester: true, lecturerId: true },
  })
  if (!session) return

  const absenteesAutoMarked = await markAbsentees(sessionId, session)

  await writeAuditLog(
    session.lecturerId,
    'SESSION_AUTO_CLOSE',
    'session',
    sessionId,
    { absenteesAutoMarked, reason: 'classDuration elapsed' }
  )

  console.log(`[scheduler] auto-closed session ${sessionId} (${absenteesAutoMarked} absent records created)`)
}

async function tick(): Promise<void> {
  try {
    const now = new Date()

    // Find all open sessions where classDuration is set and has elapsed.
    // elapsed condition: openedAt + classDuration minutes <= now
    // Prisma doesn't support computed columns in WHERE, so we compute the
    // cutoff timestamp in application code and compare against openedAt.
    // We fetch candidates conservatively (openedAt + any classDuration <= now
    // expressed as openedAt <= now - 1 min as an outer bound) then filter
    // precisely in JS to avoid time-zone arithmetic issues in raw SQL.
    const candidateSessions = await prisma.session.findMany({
      where: {
        status: SessionStatus.open,
        classDuration: { not: null },
        // openedAt must be at least 1 minute ago (minimum classDuration)
        openedAt: { lte: new Date(now.getTime() - 60_000) },
      },
      select: { id: true, openedAt: true, classDuration: true },
    })

    for (const s of candidateSessions) {
      const autoCloseAt = new Date(s.openedAt.getTime() + s.classDuration! * 60_000)
      if (autoCloseAt <= now) {
        await closeSingleSession(s.id)
      }
    }
  } catch (err) {
    // Log but never crash the process — a missed tick is better than a
    // server restart taking down the entire app.
    console.error('[scheduler] tick error:', err)
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Leader election: when multiple app replicas run, only the lock holder
 * ticks. Correctness never depends on this — closeSingleSession() is
 * idempotent via its status-guarded updateMany — it just avoids
 * duplicated queries and log noise.
 */
function isLeader(): Promise<boolean> {
  return tryRedis(
    (r) =>
      r.set(LEADER_LOCK_KEY, INSTANCE_ID, 'PX', LEADER_LOCK_TTL_MS, 'NX').then((ok) => {
        if (ok) return true
        return r.get(LEADER_LOCK_KEY).then((holder) => holder === INSTANCE_ID)
      }),
    true // no Redis → every process runs (single-node default)
  )
}

/** Start the auto-close scheduler.  Safe to call multiple times — only one interval runs. */
export function startSessionScheduler(): void {
  if (intervalHandle !== null) return
  intervalHandle = setInterval(() => {
    void isLeader().then((leader) => {
      if (leader) void tick()
    })
  }, TICK_MS)
  // Run once immediately so sessions overdue at startup are handled right away.
  void tick()
  console.log(`[scheduler] started on ${INSTANCE_ID} (tick every 60 s, Redis leader election ${process.env.REDIS_URL ? 'enabled' : 'off'})`)
}

/** Stop the scheduler (used in tests). */
export function stopSessionScheduler(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
