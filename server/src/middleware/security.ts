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
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  
  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff')
  
  // X-Frame-Options (backup to frameguard)
  res.setHeader('X-Frame-Options', 'DENY')
  
  // X-XSS-Protection (backup to xssFilter)
  res.setHeader('X-XSS-Protection', '1; mode=block')
  
  next()
}