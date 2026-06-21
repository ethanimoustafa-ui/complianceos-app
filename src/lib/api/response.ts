// Response envelope helpers for Route Handlers.
//
// `ok()`     — wraps `{ data }` with optional `Cache-Control` header.
// `err()`    — returns a JSON error envelope `{ error: { code, message, details? } }`.
// `paginate` — assembles a paginated payload (items + page metadata).

import { NextResponse } from 'next/server'

export type CacheOpts =
  | 'no-store'
  | {
      /** Cache lifetime in seconds. For `scope:'public'` this is the CDN `s-maxage`;
       *  for `scope:'private'` it is the browser `max-age`. */
      sMaxAge: number
      /** stale-while-revalidate window in seconds. */
      staleWhileRevalidate?: number
      /**
       * Cache audience. Defaults to `'private'` (the safe choice):
       *  - `'private'` → `private, max-age=…` — browser-only; shared CDN/proxy caches
       *    MUST NOT store it. Use for any response that varies per authenticated user
       *    (their profile, permissions, personal lists, RLS-scoped data).
       *  - `'public'`  → `public, s-maxage=…` — shared CDN may cache and serve to every
       *    caller. Use ONLY for responses that are identical for everyone (org-global
       *    reference lists: categories, types, templates, frameworks, departments).
       */
      scope?: 'public' | 'private'
      /** Cache tags for Next 16 cacheTag-based revalidation (informational). */
      tags?: string[]
    }

function buildCacheControl(cache: CacheOpts | undefined): string | null {
  if (!cache) return null
  if (cache === 'no-store') return 'no-store'
  const swr = cache.staleWhileRevalidate
  const swrPart = swr ? `, stale-while-revalidate=${swr}` : ''
  // Default to 'private' so any route that forgets to declare its audience fails
  // closed (browser-only), never leaking per-user data into a shared cache.
  if (cache.scope === 'public') {
    return `public, s-maxage=${cache.sMaxAge}${swrPart}`
  }
  return `private, max-age=${cache.sMaxAge}${swrPart}`
}

/**
 * Successful JSON response.
 *   ok(data)              — 200, no cache header
 *   ok(data, { status })  — custom status (e.g. 201 on create)
 *   ok(data, { cache })   — sets Cache-Control
 */
export function ok<T>(
  data: T,
  init: { status?: number; cache?: CacheOpts; headers?: HeadersInit } = {},
): NextResponse {
  const headers = new Headers(init.headers ?? {})
  const cc = buildCacheControl(init.cache)
  if (cc) headers.set('Cache-Control', cc)
  return NextResponse.json({ data }, { status: init.status ?? 200, headers })
}

/**
 * Error JSON response.
 *   err('not_found', 'Audit not found', 404)
 */
export function err(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  const body: { error: { code: string; message: string; details?: unknown } } = {
    error: { code, message },
  }
  if (details !== undefined) body.error.details = details
  return NextResponse.json(body, { status })
}

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
  }
}
