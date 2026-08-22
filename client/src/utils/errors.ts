/**
 * Record a failure that must not interrupt the user (background refresh,
 * optional secondary fetch). Silent `catch (() => {})` blocks make these
 * impossible to debug, so they always reach the console.
 */
export function logNonCriticalError(context: string, error: unknown): void {
  console.error(`[${context}]`, error)
}
