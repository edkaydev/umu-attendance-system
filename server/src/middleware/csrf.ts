import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { securityLogger } from './securityLogger'

/**
 * CSRF Protection Middleware
 * 
 * Generates and validates CSRF tokens for state-changing operations.
 * Uses double-submit cookie pattern: token in cookie + token in header/body.
 */

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a secure random CSRF token
 */
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('base64')
}

/**
 * CSRF token validation middleware
 * Applied to state-changing routes (POST, PUT, DELETE, PATCH)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for GET requests, auth endpoints, and health check
  if (req.method === 'GET' || req.path.startsWith('/api/auth') || req.path === '/api/health') {
    return next()
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME]
  const headerToken = req.headers?.[CSRF_HEADER_NAME] as string

  // CSRF enforcement can be disabled in development/test by setting
  // CSRF_DISABLED=true, but production always enforces it regardless.
  // This keeps the middleware on the code path in dev so bugs are caught
  // before deployment, while still allowing local testing without a browser.
  if (process.env.NODE_ENV !== 'production' && process.env.CSRF_DISABLED === 'true') {
    return next()
  }

  if (!cookieToken || !headerToken) {
    securityLogger.logCsrfViolation(req)
    res.status(403).json({ 
      error: 'CSRF token missing',
      code: 'CSRF_TOKEN_MISSING'
    })
    return
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken)
    )

    if (!isValid) {
      securityLogger.logCsrfViolation(req)
      res.status(403).json({ 
        error: 'CSRF token invalid',
        code: 'CSRF_TOKEN_INVALID'
      })
      return
    }

    next()
  } catch {
    securityLogger.logCsrfViolation(req)
    res.status(403).json({ 
      error: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_ERROR'
    })
  }
}

/**
 * CSRF token generation middleware
 * Sets CSRF token in cookie (non-HttpOnly for client access)
 */
export function csrfToken(req: Request, res: Response, next: NextFunction): void {
  // Only set token if not already present
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = generateCSRFToken()
    
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Client needs to read this for the header
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
      path: '/'
    })

    // Also send token in response for client to use in headers
    res.locals.csrfToken = token
  }
  
  next()
}