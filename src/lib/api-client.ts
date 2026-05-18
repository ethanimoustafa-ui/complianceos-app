// Typed browser-side API client for the Route Handler API in `src/app/api/*`.
//
// All handlers respond with the envelope shape defined in `src/lib/api/response.ts`:
//   success: { data: T }
//   error:   { error: { code, message, details? } }
//
// `apiFetch` auto-prefixes `/api`, attaches credentials, throws an
// `ApiClientError` on any non-2xx response (or when the envelope contains an
// `error` payload), and unwraps `data` on success so callers receive `T`
// directly. The four method helpers (`get`, `post`, `patch`, `delete`) are the
// canonical entrypoints for every Zustand store migrated in Phase 5.
//
// 401 recovery: when a /api/* call returns 401 the client transparently
// attempts ONE session refresh via supabase-js, then retries the request.
// If the refresh also fails the caller is redirected to /sign-in. This
// prevents the "Authentication required" unhandled rejection users see when
// their access token expires while the tab is open or after a Supabase
// session is force-invalidated.
//
// See `.planning/09-store-pattern.md` for the store migration recipe.

import { dedupeKey, getInflight, trackInflight } from '@/lib/api/dedupe'

export type ApiSuccess<T> = { data: T }
export type ApiErrorEnvelope = {
  error: { code: string; message: string; details?: unknown }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiErrorEnvelope

/** Shape returned by every paginated list endpoint (mirrors `Paginated<T>` in `src/lib/api/response.ts`). */
export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Thrown by `apiFetch` on any non-2xx response or envelope `error` payload. */
export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
  }
}

type QueryParams = Record<string, string | number | boolean | undefined | null>

function buildQuery(params: QueryParams | undefined): string {
  if (!params) return ''
  const entries: [string, string][] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    entries.push([k, String(v)])
  }
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries).toString()
}

interface FetchInit extends Omit<RequestInit, 'body'> {
  /** Query string params. Undefined / null entries are stripped. */
  params?: QueryParams
  /** Optional JSON-serialisable body. */
  body?: unknown
}

/**
 * Attempt a single Supabase session refresh from the browser. Returns true
 * if the refresh succeeded and a fresh session is now available. We import
 * lazily to keep apiFetch usable from non-React contexts (and to avoid
 * pulling supabase-js into early bundles).
 */
async function tryRefreshSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data, error } = await supabase.auth.refreshSession()
    return !error && !!data.session
  } catch {
    return false
  }
}

/**
 * Hard sign-out helper. Clears any in-memory session and bounces the user
 * to `/sign-in?next=<current-path>` so they can re-authenticate. We do NOT
 * call this from server-side callers — only from the browser.
 */
async function forceReauth(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch {
    // Ignore — we're redirecting anyway.
  }
  const next = window.location.pathname + window.location.search
  // Avoid a redirect loop if we're already on /sign-in.
  if (window.location.pathname.startsWith('/sign-in')) return
  window.location.replace(`/sign-in?next=${encodeURIComponent(next)}`)
}

interface FetchAttemptOptions {
  /** When true, skip the 401 refresh-and-retry recovery (set by the retry call). */
  isRetry?: boolean
}

/**
 * Typed `fetch` wrapper.
 *
 *   const data = await apiFetch<Audit>('/audits/abc', { method: 'GET' })
 *
 * Throws `ApiClientError` on non-2xx or envelope errors. Returns `T` on success.
 *
 * On a 401 the wrapper transparently attempts a session refresh and retries
 * the request ONCE. If the refresh fails, the user is redirected to /sign-in.
 */
export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  // In-flight GET dedupe: when multiple callers fire the same GET in the same
  // tick (typical dashboard fan-out: 6 widgets, 6 identical /api/lookups
  // calls), we hand them all the same pending promise so only one round-trip
  // hits the network. Entries are wiped on settle in `trackInflight`, so a
  // refetch-after-mutation still goes to the wire.
  //
  // Only applies to GETs from the browser. Mutations MUST always go to the
  // wire (coalescing them would silently drop user actions). Server-side
  // callers skip dedupe too — each request has its own React `cache()` scope
  // and a process-global map would leak across users.
  const method = (init.method ?? 'GET').toUpperCase()
  if (method === 'GET' && typeof window !== 'undefined') {
    const url = `/api${path}${buildQuery(init.params)}`
    const key = dedupeKey(method, url)
    const existing = getInflight<T>(key)
    if (existing) return existing
    return trackInflight(key, apiFetchInternal<T>(path, init, {}))
  }
  return apiFetchInternal<T>(path, init, {})
}

async function apiFetchInternal<T>(
  path: string,
  init: FetchInit,
  attempt: FetchAttemptOptions,
): Promise<T> {
  const { params, body, headers, method = 'GET', ...rest } = init

  const url = `/api${path}${buildQuery(params)}`
  const hasBody = body !== undefined && body !== null
  const finalHeaders: HeadersInit = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(headers ?? {}),
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      method,
      headers: finalHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
      credentials: 'include',
    })
  } catch (e) {
    throw new ApiClientError(
      'network_error',
      e instanceof Error ? e.message : 'Network request failed',
      0,
    )
  }

  // 401 recovery — try refreshing the session and replay the request once.
  // Skip server-side contexts where there's no browser to redirect.
  if (res.status === 401 && typeof window !== 'undefined') {
    if (!attempt.isRetry) {
      const refreshed = await tryRefreshSession()
      if (refreshed) {
        return apiFetchInternal<T>(path, init, { isRetry: true })
      }
    }
    // Either the refresh failed, or we already retried and got 401 again
    // (cached stale session in supabase-js memory). Either way the user has
    // to re-authenticate. forceReauth() redirects in the background; we still
    // throw below so any awaiting caller fails fast.
    void forceReauth()
  }

  // 204 No Content has no body to parse.
  if (res.status === 204) return undefined as T

  let parsed: ApiResponse<T> | unknown
  try {
    parsed = (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiClientError(
      'parse_error',
      `Invalid JSON response from ${url}`,
      res.status,
    )
  }

  if (!res.ok || (parsed && typeof parsed === 'object' && 'error' in parsed)) {
    const e = (parsed as ApiErrorEnvelope).error
    throw new ApiClientError(
      e?.code ?? 'unknown',
      e?.message ?? res.statusText ?? 'Request failed',
      res.status,
      e?.details,
    )
  }

  return (parsed as ApiSuccess<T>).data
}

/**
 * Convenience methods. Use these from stores rather than calling `apiFetch`
 * directly so the call shape stays consistent across the codebase.
 */
export const api = {
  get: <T>(path: string, params?: QueryParams) =>
    apiFetch<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body }),
  delete: <T = { id: string; deleted: true }>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
}

/** Narrow check for stores that want to special-case validation errors. */
export function isApiClientError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError
}
