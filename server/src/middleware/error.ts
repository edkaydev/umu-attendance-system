import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/apiResponse'
import { ZodError } from 'zod'

/** 404 handler for unknown routes */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}

/** Global error handler — last middleware in the stack */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    })
    return
  }

  // Known API errors
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    })
    return
  }

  // JWT errors (expired / invalid)
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    return
  }
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  // Prisma unique constraint violation
  const prismaErr = err as { code?: string }
  if (prismaErr.code === 'P2002') {
    res.status(409).json({ error: 'A record with this value already exists' })
    return
  }

  // Unknown error
  console.error('[Unhandled error]', err)
  res.status(500).json({ error: 'Internal server error' })
}
