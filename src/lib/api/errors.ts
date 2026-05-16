// Shared error class + handler for Route Handlers.
//
// Throw `ApiError` anywhere in a Route Handler's try-block and call `handle(e)`
// in catch to map to a JSON envelope. Unknown errors collapse to a 500 with
// `code: 'internal'` and the original error is logged (never leaked to client).

import { NextResponse } from 'next/server'
import { err } from './response'

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'internal'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ApiErrorCode, status: number, message?: string, details?: unknown) {
    super(message ?? code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

// Convenience factories — keep call sites short.
export const Unauthenticated = (message = 'Authentication required') =>
  new ApiError('unauthenticated', 401, message)
export const Forbidden = (message = 'Forbidden') => new ApiError('forbidden', 403, message)
export const NotFound = (message = 'Not found') => new ApiError('not_found', 404, message)
export const ValidationFailed = (details: unknown, message = 'Validation failed') =>
  new ApiError('validation_failed', 400, message, details)
export const Conflict = (message = 'Conflict') => new ApiError('conflict', 409, message)
export const RateLimited = (message = 'Too many requests') =>
  new ApiError('rate_limited', 429, message)

/**
 * Convert any thrown value to a JSON error response. Use as:
 *   try { ... } catch (e) { return handle(e) }
 */
export function handle(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return err(e.code, e.message, e.status, e.details)
  }

  // Log unknown errors server-side; never leak shape/stack to clients.
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error:', e)
  const message = e instanceof Error ? e.message : 'Internal server error'
  return err('internal', message, 500)
}
