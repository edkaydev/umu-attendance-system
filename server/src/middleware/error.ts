import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ApiError } from '../utils/apiResponse'
import { logError } from '../utils/errors'
import { ZodError } from 'zod'

/** 404 handler for unknown routes */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
}

/** Map the Prisma error codes the API can translate into a client response. */
function prismaResponse(
  err: Prisma.PrismaClientKnownRequestError
): { status: number; error: string; code?: string } | null {
  switch (err.code) {
    case 'P2002':
      return { status: 409, error: 'A record with this value already exists' }
    case 'P2025':
      return { status: 404, error: 'Record not found' }
    case 'P2003':
      return { status: 409, error: 'This record is referenced by other records and cannot be changed' }
    case 'P2000':
      return { status: 400, error: 'A submitted value is too long for its field' }
    default:
      return null
  }
}

/** Global error handler — last middleware in the stack */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // The response is already on the wire (e.g. a stream failed mid-send).
  // Anything written now would corrupt it — hand back to Express so it can
  // destroy the socket, but make sure the error is still recorded.
  if (res.headersSent) {
    logError('error-handler:after-headers', err, { method: req.method, path: req.originalUrl })
    next(err)
    return
  }

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

  // Prisma request errors we can map to a meaningful status
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaResponse(err)
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.error, ...(mapped.code ? { code: mapped.code } : {}) })
      return
    }
    logError('prisma', err, { method: req.method, path: req.originalUrl, code: err.code })
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  // Database unreachable / connection dropped — surface as unavailable so the
  // client can distinguish infrastructure problems from bad requests.
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    logError('prisma-unavailable', err, { method: req.method, path: req.originalUrl })
    res.status(503).json({ error: 'Service temporarily unavailable', code: 'DATABASE_UNAVAILABLE' })
    return
  }

  // Unknown error
  logError('unhandled', err, { method: req.method, path: req.originalUrl })
  res.status(500).json({ error: 'Internal server error' })
}
