// In-flight request dedupe for browser-side GETs.
//
// Phase 11 / Agent PERF: a dashboard with N widgets all calling
// `apiFetch('/api/X')` in the same tick fires N round-trips to the Route
// Handler — and each handler then re-runs the same Supabase auth + RLS
// query. The Route Handler caching layer (`Cache-Control: s-maxage=...`)
// doesn't help here because `apiFetch` defaults to `cache: 'no-store'`
// (intentional — see api-client.ts comment on stale-cache bugs).
//
// This module gives us a tiny in-memory map keyed by `<method>:<url>` that
// returns the SAME pending promise when a second caller fires the same GET
// before the first resolves. Entries are wiped on settle, so a refetch
// immediately after a settle goes to the network — no stale-response risk.
//
// Limited to GETs by design. Mutations (POST/PATCH/DELETE) MUST always go
// to the wire; coalescing them would silently drop user actions.

type Pending = Promise<unknown>

const inflight = new Map<string, Pending>()

/**
 * Build the dedupe key. Body is intentionally ignored — GETs don't have one,
 * and we only dedupe GETs.
 */
export function dedupeKey(method: string, url: string): string {
  return `${method.toUpperCase()}:${url}`
}

/**
 * Returns the existing pending promise for `key`, or null. Safe to call from
 * any tick — entries clear themselves when the wrapped promise settles.
 */
export function getInflight<T>(key: string): Promise<T> | null {
  const p = inflight.get(key)
  return (p ?? null) as Promise<T> | null
}

/**
 * Track `promise` under `key`. On settle (resolve OR reject) the entry is
 * removed so the next caller hits the network. Returns the same promise so
 * callers can chain.
 */
export function trackInflight<T>(key: string, promise: Promise<T>): Promise<T> {
  inflight.set(key, promise as Pending)
  const clear = (): void => {
    if (inflight.get(key) === (promise as Pending)) {
      inflight.delete(key)
    }
  }
  promise.then(clear, clear)
  return promise
}

/**
 * Test-only: drain the map. Used by unit tests that want a clean slate
 * between cases. NOT exported via barrel — import directly if needed.
 */
export function __resetInflightForTests(): void {
  inflight.clear()
}
