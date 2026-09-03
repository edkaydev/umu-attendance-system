/**
 * Centralised Moodle REST API client.
 *
 * All Moodle HTTP communication goes through callMoodle(). Features:
 *   - Token injected server-side on every request (never exposed to callers)
 *   - AbortController timeout (default 30 s from config)
 *   - Exponential-backoff retry for network errors and HTTP 5xx only
 *   - No retry on 4xx (including Moodle's own access-denied responses)
 *   - Detection of Moodle's "HTTP 200 + exception body" failure pattern
 *   - Safe logging: function name and error code logged, token never logged
 *   - Errors normalised to ApiError so the global error handler handles them
 *
 * Usage:
 *   import { callMoodle } from '../integrations/moodle/moodle.client'
 *   const info = await callMoodle<MoodleSiteInfo>('core_webservice_get_site_info')
 */

import { getMoodleConfig } from '../../config/moodle'
import { ApiError } from '../../utils/apiResponse'
import { isMoodleException } from './moodle.types'

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Base delay (ms) for the first retry. Subsequent retries double this.
 * Values: attempt 1 → 500 ms, attempt 2 → 1 000 ms.
 */
const RETRY_BASE_DELAY_MS = 500

/** HTTP status codes that are safe to retry. */
function isRetryableStatus(status: number): boolean {
  return status >= 500
}

/** True for network-level errors that are worth retrying. */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // AbortError means our own timeout fired — do not retry, it will time out again.
  if (err.name === 'AbortError') return false
  // TypeError is thrown by fetch for DNS/connection failures.
  return err.name === 'TypeError' || err.name === 'FetchError'
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call a Moodle web service function and return the parsed response body
 * typed as T.
 *
 * @param wsfunction  The Moodle function name, e.g. 'core_webservice_get_site_info'
 * @param params      Key/value pairs appended to the POST body (optional)
 *
 * Throws ApiError on:
 *   - Moodle not configured (503)
 *   - Timeout (504)
 *   - HTTP 4xx (401/403/400 depending on Moodle error code)
 *   - HTTP 5xx after exhausting retries (502)
 *   - Moodle HTTP-200 exception body (401/403/400 depending on error code)
 *   - Unexpected / unparseable response (502)
 */
export async function callMoodle<T>(
  wsfunction: string,
  params: Record<string, string | number | boolean> = {}
): Promise<T> {
  const config = getMoodleConfig()
  const endpoint = `${config.baseUrl}/webservice/rest/server.php`
  const { maxAttempts, timeoutMs } = config

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      // Build POST body manually — avoids http_build_query-style serialization
      // issues and keeps the token out of query strings (logs, proxies).
      const bodyParts: string[] = [
        `wstoken=${encodeURIComponent(config.wsToken)}`,
        `wsfunction=${encodeURIComponent(wsfunction)}`,
        `moodlewsrestformat=json`,
      ]
      for (const [key, value] of Object.entries(params)) {
        bodyParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      }
      const body = bodyParts.join('&')

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      })

      clearTimeout(timer)

      // ── HTTP-level failure ─────────────────────────────────────────────────
      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
          console.error(
            `[moodle] ${wsfunction} HTTP ${response.status} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`
          )
          lastError = new ApiError(
            `Moodle API returned HTTP ${response.status}`,
            502,
            'MOODLE_HTTP_ERROR'
          )
          await sleep(delay)
          continue
        }

        const status = response.status
        const code = status === 401 || status === 403 ? status : 502
        throw new ApiError(
          `Moodle API error: HTTP ${status} calling ${wsfunction}`,
          code,
          'MOODLE_HTTP_ERROR'
        )
      }

      // ── Parse JSON ────────────────────────────────────────────────────────
      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ApiError(
          `Moodle returned a non-JSON response for ${wsfunction}`,
          502,
          'MOODLE_INVALID_RESPONSE'
        )
      }

      // ── Moodle HTTP-200 exception ─────────────────────────────────────────
      // Moodle returns HTTP 200 even for token errors, permission errors, etc.
      // Detect the exception shape and translate to a typed error.
      if (isMoodleException(data)) {
        const errCode = data.errorcode
        const errMsg = data.message  // not forwarded to the client

        // Log the error code (safe). Never log the message verbatim — it may
        // reference internal details. We log it only at non-production level
        // for developer debugging.
        console.error(`[moodle] ${wsfunction} returned exception: ${errCode}`)
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[moodle] exception detail (dev only): ${errMsg}`)
        }

        // Map common Moodle error codes to appropriate HTTP status codes.
        const httpStatus =
          errCode === 'invalidtoken' || errCode === 'accessdenied' ? 401
          : errCode === 'nopermissions' ? 403
          : errCode === 'invalidparameter' || errCode === 'missingparam' ? 400
          : 502

        // Do NOT include the Moodle message in the ApiError — it may leak
        // internal server paths, usernames, or configuration details.
        throw new ApiError(
          `Moodle API refused the request (${errCode}) for ${wsfunction}`,
          httpStatus,
          `MOODLE_EXCEPTION_${errCode.toUpperCase()}`
        )
      }

      // ── Success ───────────────────────────────────────────────────────────
      return data as T

    } catch (err) {
      clearTimeout(timer)

      // Already an ApiError — re-throw immediately (don't retry our own errors).
      if (err instanceof ApiError) throw err

      // Timeout
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(
          `Moodle API timed out after ${timeoutMs / 1000}s calling ${wsfunction}`,
          504,
          'MOODLE_TIMEOUT'
        )
      }

      // Retryable network error
      if (isRetryableError(err) && attempt < maxAttempts) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
        console.error(
          `[moodle] ${wsfunction} network error on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms:`,
          (err as Error).message
        )
        lastError = err
        await sleep(delay)
        continue
      }

      // Non-retryable or exhausted retries
      console.error(`[moodle] ${wsfunction} failed after ${attempt} attempt(s):`, (err as Error).message)
      throw new ApiError(
        `Moodle API call failed for ${wsfunction}`,
        502,
        'MOODLE_REQUEST_FAILED'
      )
    }
  }

  // Should only reach here if maxAttempts == 0 (never in practice).
  console.error(`[moodle] ${wsfunction} exhausted all ${maxAttempts} attempts`, lastError)
  throw new ApiError(
    `Moodle API unavailable after ${maxAttempts} attempts for ${wsfunction}`,
    502,
    'MOODLE_UNAVAILABLE'
  )
}
