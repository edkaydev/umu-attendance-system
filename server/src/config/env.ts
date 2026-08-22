/**
 * Startup checks for security-critical configuration.
 *
 * Missing token secrets are fatal: without them the API cannot sign or verify
 * sessions, and a silent fallback would be worse than refusing to boot.
 */

const MIN_SECRET_LENGTH = 32

const REQUIRED_SECRETS = ['JWT_ACCESS_SECRET'] as const

export function assertSecureConfig(): void {
  const problems: string[] = []

  for (const key of REQUIRED_SECRETS) {
    const value = process.env[key]
    if (!value) {
      problems.push(`${key} is not set`)
    } else if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters`)
    }
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
    problems.push('CLIENT_URL is not set (required for CORS and OAuth redirects)')
  }

  if (problems.length > 0) {
    throw new Error(`Insecure configuration:\n  - ${problems.join('\n  - ')}`)
  }
}
