// Zod request-body parser. Throws ApiError('validation_failed', 400) with
// the Zod `issues[]` as `details` on parse failure.

import type { ZodType } from 'zod'
import { ValidationFailed } from './errors'

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw ValidationFailed([{ path: [], message: 'Invalid JSON body' }], 'Invalid JSON body')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw ValidationFailed(result.error.issues, 'Validation failed')
  }
  return result.data
}

/**
 * Parses `URLSearchParams` against a Zod schema. Use for `GET` query parsing
 * when you want type-safe filters.
 */
export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodType<T>): T {
  const obj: Record<string, string | string[]> = {}
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key)
    obj[key] = all.length > 1 ? all : (all[0] ?? '')
  }
  const result = schema.safeParse(obj)
  if (!result.success) {
    throw ValidationFailed(result.error.issues, 'Invalid query parameters')
  }
  return result.data
}
