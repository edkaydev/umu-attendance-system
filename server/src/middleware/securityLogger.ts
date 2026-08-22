import { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import { tryRedis } from '../config/redis'

const REDIS_EVENT_KEY = 'security:events'
const REDIS_EVENT_LIMIT = 10_000

/**
 * Security Event Logger
 * Logs important security events for monitoring and incident response
 */

type SecurityEventType = 
  | 'AUTH_FAILURE'
  | 'AUTH_SUCCESS'
  | 'CSRF_VIOLATION'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_BANNED'
  | 'PERMISSION_DENIED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'DATA_ACCESS'
  | 'CONFIG_CHANGE'

interface SecurityEvent {
  timestamp: string
  type: SecurityEventType
  userId?: string
  ip?: string
  userAgent?: string
  path: string
  method: string
  details?: Record<string, unknown>
  severity: 'low' | 'medium' | 'high' | 'critical'
}

class SecurityLogger {
  private logFile: string
  private isEnabled: boolean

  constructor() {
    this.logFile = path.join(process.cwd(), 'logs', 'security.log')
    this.isEnabled = process.env.NODE_ENV !== 'test'
    
    // Ensure logs directory exists
    const logsDir = path.dirname(this.logFile)
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
  }

  private log(event: SecurityEvent): void {
    if (!this.isEnabled) return

    const logEntry = JSON.stringify(event) + '\n'

    try {
      fs.appendFileSync(this.logFile, logEntry)

      // Mirror to Redis so events from every replica land in one place.
      void tryRedis(
        async (r) => {
          await r.rpush(REDIS_EVENT_KEY, JSON.stringify(event))
          await r.ltrim(REDIS_EVENT_KEY, -REDIS_EVENT_LIMIT, -1)
        },
        null as void | null
      )

      // Also log to console for immediate visibility
      const consolePrefix = {
        critical: '🚨 CRITICAL',
        high: '⚠️  HIGH',
        medium: '⚡ MEDIUM',
        low: 'ℹ️  LOW'
      }[event.severity]

      console.log(`${consolePrefix}: ${event.type} - ${event.path}`)
    } catch (error) {
      console.error('Failed to write security log:', error)
    }
  }

  public logAuthFailure(req: Request, reason: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'AUTH_FAILURE',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { reason },
      severity: 'high'
    })
  }

  public logAuthSuccess(req: Request, userId: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'AUTH_SUCCESS',
      userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      severity: 'low'
    })
  }

  public logCsrfViolation(req: Request): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'CSRF_VIOLATION',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      severity: 'high'
    })
  }

  public logRateLimitExceeded(req: Request, key: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'RATE_LIMIT_EXCEEDED',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { rateLimitKey: key },
      severity: 'medium'
    })
  }

  public logRateLimitBanned(req: Request, key: string, duration: number): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'RATE_LIMIT_BANNED',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { rateLimitKey: key, banDuration: duration },
      severity: 'high'
    })
  }

  public logPermissionDenied(req: Request, requiredRole?: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'PERMISSION_DENIED',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { requiredRole, userRole: req.user?.role },
      severity: 'medium'
    })
  }

  public logSuspiciousActivity(req: Request, activity: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'SUSPICIOUS_ACTIVITY',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { activity },
      severity: 'high'
    })
  }

  public logDataAccess(req: Request, resource: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'DATA_ACCESS',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { resource },
      severity: 'low'
    })
  }

  public logConfigChange(req: Request, config: string): void {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'CONFIG_CHANGE',
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      details: { config },
      severity: 'high'
    })
  }
}

export const securityLogger = new SecurityLogger()

/**
 * Middleware to log security events automatically
 */
export function securityEventLogger(req: Request, res: Response, next: NextFunction): void {
  // Log permission denied responses based on response data
  const originalJson = res.json.bind(res)
  res.json = function(data: unknown) {
    if (typeof data === 'object' && data !== null) {
      const responseData = data as Record<string, unknown>
      
      if (responseData.code === 'PERMISSION_DENIED' || responseData.code === 'CSRF_TOKEN_MISSING' || responseData.code === 'CSRF_TOKEN_INVALID') {
        securityLogger.logPermissionDenied(req)
      }
    }
    return originalJson(data)
  }
  
  next()
}