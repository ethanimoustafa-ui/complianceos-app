// Shared helper for optimistic mutations across Zustand stores.
//
// The standard pattern (Wave-2 Agent E):
//
//   1. Apply the mutation to local state IMMEDIATELY (insert/update/delete the
//      row in `items`).
//   2. Fire the API call in the background.
//   3. On success: swap the optimistic placeholder for the canonical server row
//      (so subsequent PATCH/DELETE hit the correct id).
//   4. On failure: roll back the optimistic mutation and surface an error.
//
// The store-specific actions don't always have the same exact shape, so the
// helpers below are intentionally light — they generate the temp id and offer
// a primitive that some stores can use, but more bespoke flows (e.g. policy /
// calendar / training) keep their hand-rolled implementations because they
// need to thread additional state (history entries, audit logs, byId/select).

/** Returns a temporary client-side id for an optimistic row. Format
 * `temp-<uuid>` so consumers can detect "not yet persisted" rows. */
export function newTempId(prefix = 'temp'): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/** True if the id was minted by {@link newTempId} (i.e. row hasn't been
 * confirmed by the server yet). */
export function isTempId(id: string | undefined | null): boolean {
  return !!id && (id.startsWith('temp-') || id.startsWith('local-'))
}

/**
 * Drop-in optimistic-create helper for stores whose rows can be inserted into
 * a single `items` array. Callers handle their own `byId` / select bookkeeping
 * via the `applyOptimistic`/`applyReal`/`rollback` callbacks.
 *
 * Example:
 *   await runOptimistic({
 *     optimistic: { ...input, id: newTempId() },
 *     apply: (row) => set((s) => ({ items: [row, ...s.items] })),
 *     replace: (real, tempId) =>
 *       set((s) => ({ items: s.items.map((i) => i.id === tempId ? real : i) })),
 *     rollback: (tempId) =>
 *       set((s) => ({ items: s.items.filter((i) => i.id !== tempId) })),
 *     request: () => api.post('/path', payload),
 *   })
 */
export async function runOptimistic<T extends { id: string }, R extends { id: string }>({
  optimistic,
  apply,
  request,
  replace,
  rollback,
}: {
  optimistic: T
  apply: (row: T) => void
  request: () => Promise<R>
  replace: (real: R, tempId: string) => void
  rollback: (tempId: string, err: unknown) => void
}): Promise<R | null> {
  apply(optimistic)
  try {
    const real = await request()
    replace(real, optimistic.id)
    return real
  } catch (err) {
    rollback(optimistic.id, err)
    return null
  }
}

// ── GAP-14: cross-cutting optimistic-mutation lifecycle ─────────────────────
//
// `optimisticMutation` codifies the full optimistic-UI lifecycle used by every
// mutating action on the Regulatory Updates — Rules page:
//
//   1. `apply()`     — synchronously mutate the store to the optimistic END
//                      state (row removed / chip updated / temp row inserted),
//                      BEFORE any await, so the UI changes the same tick.
//   2. `request()`   — fire the background request; resolves with server data.
//   3. on 2xx  → `reconcile(result)` — optional; swap temp ids, stamp
//                server-authoritative fields (progress / status / version).
//   4. on error → `revert()` then a friendly error toast (default copy below).
//                The real error is logged to console for developers.
//
// IMPORTANT — entity-granular snapshots: the CALLER captures a snapshot of just
// the affected entity (circular / article / step / field) BEFORE calling, and
// `revert()` restores only that entity, recomputing rollups from the CURRENT
// store state. Never snapshot/restore the whole store — that would clobber
// concurrent mutations on other entities.

import { pushToast, type ToastMessage } from '@/stores/toast-store'
import { ApiClientError } from '@/lib/api-client'
import { RBACError } from '@/lib/rbac-error'

/**
 * True when an error is a permission denial — either a client-side gate
 * (RBACError, surfaced by the global RBACToastHost) or a server 403 (surfaced
 * by the api-client boundary). In BOTH cases the denial already shows its own
 * toast, so a generic "it didn't register, please try again" revert toast must
 * NOT stack on top of it. Reused everywhere a mutation-failure toast could clash
 * with the permission rollback.
 */
export function isPermissionDenied(e: unknown): boolean {
  return (
    e instanceof RBACError ||
    (e instanceof ApiClientError && (e.status === 403 || e.code === 'forbidden'))
  )
}

/**
 * RTL-8: default i18n KEY for a reverted optimistic mutation. The toast carries
 * a key (not a literal) so `<ToastHost />` translates it at render time — the
 * store lives outside React and has no `t()`.
 */
export const DEFAULT_REVERT_MESSAGE_KEY = 'regulatoryUpdates.optimisticRevert'

export interface OptimisticMutationOptions<T> {
  /** Synchronously mutate store state to the optimistic END state. */
  apply: () => void
  /** Fire the background request; resolves with the server result. */
  request: () => Promise<T>
  /**
   * Optional success step: reconcile server-authoritative fields into the
   * already-optimistic state (swap temp ids, stamp progress/status/version).
   * May be async — the lifecycle awaits it so the mutation promise does not
   * resolve until the reconcile (e.g. inserting the real row) has completed.
   */
  reconcile?: (result: T) => void | Promise<void>
  /**
   * Revert the optimistic change. Restore the affected entity from the
   * caller's snapshot and recompute rollups from the CURRENT store state.
   */
  revert: () => void
  /**
   * Friendly toast shown on failure. RTL-8: pass a `{key,params}` translation
   * spec (or a literal string) — defaults to the translatable revert key so the
   * copy is localised. Never pass a hardcoded English sentence.
   *
   * Wave-20.cleanup — accepts an `(err) => ToastMessage` function so callers
   * can switch between the generic revert key and the 412-specific conflict
   * key based on the failure. (Static value still works for the simple case.)
   */
  errorMessage?: ToastMessage | ((err: unknown) => ToastMessage)
  /** Context label for the dev console log. */
  context?: string
}

/**
 * Run an optimistic mutation through the full lifecycle. Applies the optimistic
 * state immediately, fires the request, reconciles on success, reverts + toasts
 * on failure. Re-throws the error after revert so callers can still react.
 */
export async function optimisticMutation<T>(
  opts: OptimisticMutationOptions<T>,
): Promise<T | void> {
  const { apply, request, reconcile, revert, errorMessage, context } = opts

  // 1. Optimistic end state — synchronous, before any await.
  apply()

  try {
    // 2. Background request.
    const result = await request()
    // 3. Reconcile server-authoritative fields. Awaited so an async reconcile
    //    (e.g. inserting the confirmed row) finishes before the promise resolves.
    await reconcile?.(result)
    return result
  } catch (e) {
    // 4. Revert + friendly toast. Log the real error for developers.
    revert()
    console.error(`[optimistic${context ? `:${context}` : ''}] mutation failed —`, e)
    // A permission denial (client RBACError OR server 403) already surfaces its
    // own "you don't have permission" toast — don't stack the generic "it didn't
    // register" revert toast on top of it (only ONE should show). The revert
    // itself still runs above so the optimistic change is rolled back either way.
    if (!isPermissionDenied(e)) {
      const toast =
        typeof errorMessage === 'function'
          ? errorMessage(e)
          : (errorMessage ?? { key: DEFAULT_REVERT_MESSAGE_KEY })
      pushToast(toast, 'error')
    }
    throw e
  }
}
