// Zod request-body parser. Throws ApiError('validation_failed', 400) with
// the Zod `issues[]` as `details` on parse failure.

import type { ZodType } from 'zod'
import { InvalidUuid, PreconditionFailed, ValidationFailed } from './errors'

// SEC-5: canonical UUID matcher. Used to validate dynamic `[id]`-style route
// segments at the top of every handler so a malformed segment (e.g. `abc`,
// or a SQL-injection probe `' OR 1=1 --`) returns a clean 400 BEFORE any DB
// access, rather than letting Postgres raise a `22P02` and surface as a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * SEC-5: assert a dynamic route segment is a well-formed UUID.
 *
 *   const { circularId } = await params
 *   assertUuid(circularId)
 *
 * Throws `ApiError('invalid_uuid', 400)` for any malformed input — the error
 * envelope surfaces `{ error: { code: 'invalid_uuid', message } }`. Accepts
 * one or many segments.
 */
export function assertUuid(...segments: (string | undefined | null)[]): void {
  for (const seg of segments) {
    if (typeof seg !== 'string' || !UUID_RE.test(seg)) {
      throw InvalidUuid()
    }
  }
}

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

// SEC-1: optimistic-concurrency token. Routes read the client's last-known
// `updated_at` from the `If-Match` request header (carried as a weak ETag,
// e.g. `W/"2026-05-22T10:00:00.000Z"`, or the bare ISO string).
//
// `readIfMatch` extracts the ISO timestamp; `assertNotStale` compares it
// EXACTLY (string compare — NOT HTTP-date second precision) against the row's
// current `updated_at` and throws `412 Precondition Failed` on a mismatch.
//
// If the client sends no `If-Match` header the write is allowed (backward
// compatibility) — the caller decides whether to require it.

/** SEC-1: extract the ISO timestamp from an `If-Match` header, if present. */
export function readIfMatch(req: Request): string | null {
  const raw = req.headers.get('if-match')
  if (!raw) return null
  // Strip a weak-ETag prefix and surrounding quotes: `W/"…"` or `"…"`.
  const unquoted = raw.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return unquoted.length > 0 ? unquoted : null
}

/**
 * SEC-1: throw `412 Precondition Failed` when the client's `If-Match` token
 * does not match the row's current `updated_at`. A `null` token (header
 * absent) is a no-op — the write proceeds.
 */
export function assertNotStale(
  ifMatch: string | null,
  currentUpdatedAt: string | null | undefined,
): void {
  if (ifMatch == null) return
  if (ifMatch !== (currentUpdatedAt ?? '')) {
    throw PreconditionFailed(
      'This record was changed by someone else — reload to see the latest.',
    )
  }
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
