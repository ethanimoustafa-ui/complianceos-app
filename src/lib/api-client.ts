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
// See `.planning/09-store-pattern.md` for the store migration recipe.

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
 * Typed `fetch` wrapper.
 *
 *   const data = await apiFetch<Audit>('/audits/abc', { method: 'GET' })
 *
 * Throws `ApiClientError` on non-2xx or envelope errors. Returns `T` on success.
 */
export async function apiFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
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
