# Optimization Patterns

Conventions every Wave-3 store/route/page is expected to follow. One page,
five sections. If you're adding a new mutation, list page, or hard-delete
flow — skim this first.

---

## 1. Optimistic mutations (snapshot → restore)

Every user-perceptible mutation (click toggles, inline edits, drag-reorder,
field saves) applies the new state to the Zustand store *before* the network
round-trip. On failure we restore the snapshot. Pattern:

```ts
update: (id, patch) => {
  const previous = get().byId[id]            // 1. snapshot
  if (!previous) return
  const optimistic = { ...previous, ...patch }
  set((s) => ({ byId: { ...s.byId, [id]: optimistic }, isMutating: true }))
  void (async () => {
    try {
      const row = await api.patch(`/things/${id}`, patch)
      set((s) => ({ byId: { ...s.byId, [id]: mapRow(row) }, isMutating: false }))
    } catch (e) {                            // 2. restore
      set((s) => ({ byId: { ...s.byId, [id]: previous },
                    error: errorMessage(e), isMutating: false }))
    }
  })()
}
```

**Use it for:** updates, toggles, soft state changes, optimistic deletes,
reorderings. **Skip it for:** initial create when the row depends on a
server-generated id you can't fake cleanly, and bulk imports (use a
progress UI instead). Canonical example: `src/stores/policy-store.ts:516`
(update) and `src/stores/policy-store.ts:552` (delete).

## 2. Skeleton loading boundaries

Render the list/header data the instant the cheap list-row response lands —
never block on the detail GET. Detail children (sidebars, attachments,
timelines) defer to `fetchById` and show `<Skeleton>` placeholders while
they load.

Rules:
- **Modals open immediately.** They consume whatever the row already has
  and lazy-load extras inside.
- **List pages** show `<ListSkeleton rows={5} />` only when
  `isLoading && items.length === 0`. Refetches keep the stale list visible.
- **Detail panels** render the row first, then a `<Skeleton className="h-4 w-32" />`
  per pending field group.

Canonical examples: `src/components/ui/skeleton.tsx:42` (list skeleton) and
`src/app/(dashboard)/reports/[auditId]/page.tsx` (skeleton boundaries).

## 3. Button loading states

Every mutation trigger uses `<LoadingButton loading={isMutating}>`. The
`isMutating` source is **whichever store action is in flight** — not a
component-local `useState`. Two reasons: it survives route changes, and
two buttons targeting the same mutation can't desync.

```tsx
const { isMutating, update } = usePolicyStore()
<LoadingButton loading={isMutating} onClick={() => update(id, patch)}>Save</LoadingButton>
```

`LoadingButton` already disables itself while loading and renders a
`lucide:loader-2` spinner next to the label — never disable manually.
Canonical example: `src/components/ui/loading-button.tsx:26`.

## 4. Hard-delete + cascade

Domain trees (circular → articles → checklist; audit → findings → evidence;
policy → versions → activity) use real `ON DELETE CASCADE` at the FK level.
No `deleted_at` columns. Reasons:
1. Indexes stay small.
2. RLS policies stay simple (no `AND deleted_at IS NULL` everywhere).
3. The append-only audit log captures the delete event in a separate
   table, so the compliance trail is preserved even though the row is gone.

Apply via migration: `FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE`.
Canonical migration: `supabase/migrations/040_circular_hard_delete_cascade.sql`.

**Exception:** entities the regulator requires us to retain (final reports,
signed policies) keep an archive flag, not a deleted flag, and migrate to a
cold-storage table on archive.

## 5. Request budget — ≤20 requests per page load

Always pull Supabase API logs after a feature lands. The target is
**≤20 requests per page load**. Three tools to stay under budget:

1. **`apiFetch` is auto-deduped.** Concurrent identical GETs share one
   in-flight promise — don't add your own caching layer on top.
2. **Cache-tag the route response** with `next: { tags: [...] }` so
   `revalidateTag` from a mutation drops only the relevant cache entry.
3. **Avoid the `requireUser` loop.** Per HANDOFF §4, `requireUser()` is
   the dominant per-request cost. Either rely on the JWT custom-claims hook
   or the 60s per-request memo cache — don't call it twice in one handler.

Canonical examples: `src/lib/api-client.ts` (`apiFetch` dedupe) and
`src/lib/api/cache.ts` (tag registry).

---

Last updated: 2026-05-17. Owner: Wave-3 framework agent.
