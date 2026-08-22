import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { ZodError, z } from 'zod'
import { validate } from './validate'

const schema = z.object({ code: z.string().length(6) })

function run(req: Partial<Request>, source?: 'body' | 'query' | 'params') {
  const next = vi.fn() as unknown as NextFunction
  validate(schema, source)(req as Request, {} as Response, next)
  return next as unknown as ReturnType<typeof vi.fn>
}

describe('validate', () => {
  it('calls next() with no argument when the body is valid', () => {
    const next = run({ body: { code: 'AB3D7F' } })
    expect(next).toHaveBeenCalledWith()
  })

  it('forwards a ZodError to next() when the body is invalid', () => {
    const next = run({ body: { code: 'short' } })
    expect(next).toHaveBeenCalledOnce()
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError)
  })

  it('validates params when that source is chosen', () => {
    const next = run({ params: { code: 'AB3D7F' }, body: {} }, 'params')
    expect(next).toHaveBeenCalledWith()
  })

  it('validates query when that source is chosen', () => {
    const next = run({ query: { code: 'nope' }, body: { code: 'AB3D7F' } }, 'query')
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError)
  })
})
