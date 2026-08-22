import Redis from 'ioredis'

/**
 * Shared Redis connection for cross-instance state (rate limits,
 * security events, scheduler leadership).
 *
 * Design contract:
 * - REDIS_URL unset      → redis === null, app runs fully in-memory (dev/single-node)
 * - Redis unreachable    → consumers MUST degrade to their in-memory fallback
 * - Nothing here throws  → Redis is an accelerator, never a hard dependency
 */

let redis: Redis | null = null

declare global {
  // eslint-disable-next-line no-var
  var __umuRedis: Redis | null | undefined
}

if (process.env.REDIS_URL && !global.__umuRedis) {
  const client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  })

  client.on('error', (err) => {
    console.error('[redis] connection error:', err.message)
  })

  client.connect().catch((err) => {
    console.error('[redis] initial connect failed, running without Redis:', err.message)
  })

  global.__umuRedis = client
}

redis = global.__umuRedis ?? null

export function getRedis(): Redis | null {
  if (!redis || redis.status !== 'ready') return null
  return redis
}

/** Run an operation against Redis; resolve with fallback value on any failure. */
export async function tryRedis<T>(op: (r: Redis) => Promise<T>, fallback: T): Promise<T> {
  const r = getRedis()
  if (!r) return fallback
  try {
    return await op(r)
  } catch (err) {
    console.error('[redis] operation failed, using fallback:', (err as Error).message)
    return fallback
  }
}
