import { Response } from 'express'

/**
 * HTTP error with a status code, thrown by services/controllers
 * and translated to a JSON response by the error handler middleware.
 */
export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** 200 OK */
export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json(data)
}

/** 201 Created */
export function created(res: Response, data: unknown): Response {
  return res.status(201).json(data)
}

/** 204 No Content */
export function noContent(res: Response): Response {
  return res.status(204).send()
}
