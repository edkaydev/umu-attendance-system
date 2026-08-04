import crypto from 'crypto'

/**
 * Safe character pool — excludes O/0, I/1, B/8, S/5 to avoid confusion
 * when reading codes aloud or off a projector (FR-05.3).
 */
const CODE_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

/** Generate a single 6-character session code. */
export function generateSessionCode(): string {
  let code = ''
  const bytes = crypto.randomBytes(CODE_LENGTH)
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_POOL[bytes[i] % CODE_POOL.length]
  }
  return code
}

/**
 * Generate a session code that does not collide with any currently
 * active session code. Retries with fresh randomness on collision.
 */
export async function generateUniqueSessionCode(
  isTaken: (code: string) => Promise<boolean>
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSessionCode()
    if (!(await isTaken(code))) {
      return code
    }
  }
  throw new Error('Could not generate a unique session code')
}
