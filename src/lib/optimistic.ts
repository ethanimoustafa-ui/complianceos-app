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
