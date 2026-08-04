import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'

type Sources = 'body' | 'query' | 'params'

/**
 * Validates a request source against a zod schema.
 * Throws a ZodError (handled by the global error handler) on failure.
 */
export function validate(schema: ZodSchema, source: Sources = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse(req[source])
      next()
    } catch (error) {
      next(error as ZodError)
    }
  }
}
