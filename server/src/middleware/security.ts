import { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'

/**
 * Security headers middleware using Helmet.js
 * Adds comprehensive security headers to all responses
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME type sniffing
  noSniff: true,
  // Prevent XSS attacks
  xssFilter: true,
  // Remove X-Powered-By header
  hidePoweredBy: true,
  // HSTS (HTTP Strict Transport Security)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
})

/**
 * Additional custom security headers
 */
export function customSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // For state-changing or authenticated data routes, prevent all caching.
  // For safe read-only routes (GET/HEAD on public/dropdown data), a short
  // private TTL is fine and reduces DB load.
  const isWriteMethod = !['GET', 'HEAD'].includes(req.method)
  const isSensitivePath =
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/dashboard') ||
    req.path.startsWith('/api/reports') ||
    req.path.startsWith('/api/audit-logs') ||
    req.path.startsWith('/api/attendance') ||
    req.path.startsWith('/api/sessions') ||
    req.path.startsWith('/api/checkin') ||
    req.path.startsWith('/api/users') ||
    req.path.startsWith('/api/profile')

  if (isWriteMethod || isSensitivePath) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  } else {
    // Read-only, non-sensitive data (academic structure, campuses, settings lookups):
    // allow a short private cache to reduce redundant requests.
    res.setHeader('Cache-Control', 'private, max-age=60')
  }

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // X-Frame-Options (backup to frameguard)
  res.setHeader('X-Frame-Options', 'DENY')

  // X-XSS-Protection (backup to xssFilter)
  res.setHeader('X-XSS-Protection', '1; mode=block')

  next()
}