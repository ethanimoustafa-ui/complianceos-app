# ComplianceOS Store Pattern (Phase 5 — Server-State Migration)

> **Status:** foundation laid. Shared API client (`src/lib/api-client.ts`) shipped; `useAuditStore` migrated end-to-end as the reference implementation; `npx tsc --noEmit` is clean.
>
> Parallel agents migrating the remaining ~40 stores: **read §1–§3, copy §2 skeleton, follow §4 ordering, respect §5 client-only rules, ship one of the §6 groups.**

---

## 1. Rationale & API-client contract

Stores were previously seeded with mock data and persisted to `localStorage` via `zustand/middleware → persist`. With the Phase 4 Route Handler API in place (`/api/<resource>`), the persistence layer is now **the database**, accessed exclusively through the typed client at `src/lib/api-client.ts`. Stores keep an in-memory mirror of the server response so the UI stays fast between fetches, but the server is the source of truth — no more cross-tab drift, no more migration chains, no more `seedXxx` arrays. The persist middleware and seed arrays are deleted on every migration.

The client at `src/lib/api-client.ts` exposes:

```ts
import { api, ApiClientError, type Paginated } from '@/lib/api-client'

// GET  /api/audits?page=1&pageSize=10
const list = await api.get<Paginated<AuditRow>>('/audits', { page: 1, pageSize: 10 })

// POST /api/audits           body: CreateAuditInput
const created = await api.post<AuditRow>('/audits', payload)

// PATCH /api/audits/abc      body: Partial<UpdateAuditInput>
const updated = await api.patch<AuditRow>(`/audits/${id}`, patch)

// DELETE /api/audits/abc
await api.delete(`/audits/${id}`)
```

Notes:

- Auto-prefixes `/api`; pass paths starting with `/` (e.g. `'/audits'` → `/api/audits`).
- `credentials: 'include'` is always on (cookie session for `@supabase/ssr`).
- Throws `ApiClientError` (with `.code`, `.status`, `.message`, `.details`) on any non-2xx OR any envelope with an `error` payload. Stores should catch, store the message in `error`, **and re-throw** so call sites can fire toast notifications.
- Unwraps the `{ data }` envelope automatically — your `T` is the inner payload (a single row, a `Paginated<T>` for lists, or a `{ id, deleted: true }` for soft-deletes).
- `204 No Content` returns `undefined as T`.

---

## 2. Store skeleton (copy this verbatim, adapt resource words)

```ts
import { create } from 'zustand'
import type { Widget, WidgetFilters, PaginationState } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

// API row (snake_case) — adapt columns to your resource.
interface WidgetApiRow {
  id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

function mapRow(row: WidgetApiRow, previous?: Widget): Widget {
  // Translate snake_case → the existing TS interface (camelCase). When the
  // API drops fields the legacy interface required (e.g. nested counts), fall
  // back to `previous` so already-loaded detail data isn't blown away by a
  // subsequent list refetch.
  return {
    id: row.id,
    name: row.name,
    status: row.status as Widget['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(previous ?? {}),
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface WidgetStoreState {
  // --- data ---
  widgets: Widget[]
  byId: Record<string, Widget>             // O(1) lookup; rebuilt on every list fetch
  pagination: PaginationState

  // --- status ---
  // FIRST-FETCH SKELETON RULE: render a skeleton when
  //   isLoading && widgets.length === 0
  // On a refetch (widgets already populated) UI shows a subtle indicator
  // (spinner / progress bar) while stale data stays visible.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // --- filters (UI-only; never persisted) ---
  filters: WidgetFilters

  // --- async actions ---
  fetchAll(opts?: { page?: number; pageSize?: number; filters?: Partial<WidgetFilters> }): Promise<void>
  fetchOne(id: string): Promise<Widget | null>
  create(input: CreateWidgetInput): Promise<Widget>
  update(id: string, input: Partial<UpdateWidgetInput>): Promise<Widget>
  remove(id: string): Promise<void>

  // --- UI helpers ---
  setFilter<K extends keyof WidgetFilters>(key: K, value: WidgetFilters[K]): void
  clearError(): void
}

export const useWidgetStore = create<WidgetStoreState>()((set, get) => ({
  widgets: [],
  byId: {},
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,
  filters: {},

  fetchAll: async (opts) => {
    set({ isLoading: true, error: null })
    try {
      const page = opts?.page ?? get().pagination.page
      const pageSize = opts?.pageSize ?? get().pagination.pageSize
      const filters = opts?.filters ? { ...get().filters, ...opts.filters } : get().filters

      const result = await api.get<{ items: WidgetApiRow[]; page: number; pageSize: number; total: number; totalPages: number }>(
        '/widgets',
        { page, pageSize, status: filters.status, q: filters.search }
      )
      const previousById = get().byId
      const widgets = result.items.map((r) => mapRow(r, previousById[r.id]))
      const byId: Record<string, Widget> = {}
      for (const w of widgets) byId[w.id] = w
      set({
        widgets,
        byId,
        pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
        filters,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      // Don't re-throw on list fetches — the UI renders the error banner from `error`.
      set({ error: errorMessage(e, 'Failed to fetch widgets'), isLoading: false })
    }
  },

  fetchOne: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<WidgetApiRow>(`/widgets/${id}`)
      const widget = mapRow(row, get().byId[id])
      set((s) => ({
        byId: { ...s.byId, [id]: widget },
        widgets: s.widgets.some((w) => w.id === id) ? s.widgets.map((w) => (w.id === id ? widget : w)) : s.widgets,
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return widget
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch widget'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  create: async (input) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<WidgetApiRow>('/widgets', input)
      const created = mapRow(row)
      set((s) => ({
        widgets: [created, ...s.widgets],
        byId: { ...s.byId, [created.id]: created },
        isMutating: false,
      }))
      // Pagination/sort may shift — background refetch.
      void get().fetchAll()
      return created
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create widget'), isMutating: false })
      throw e                                     // re-throw → caller can toast
    }
  },

  update: async (id, input) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<WidgetApiRow>(`/widgets/${id}`, input)
      const updated = mapRow(row, get().byId[id])
      set((s) => ({
        widgets: s.widgets.map((w) => (w.id === id ? updated : w)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
      return updated
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update widget'), isMutating: false })
      throw e
    }
  },

  remove: async (id) => {
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/widgets/${id}`)
      set((s) => {
        const { [id]: _drop, ...rest } = s.byId
        return { widgets: s.widgets.filter((w) => w.id !== id), byId: rest, isMutating: false }
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to delete widget'), isMutating: false })
      throw e
    }
  },

  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearError: () => set({ error: null }),
}))
```

### Conventions baked in

- **No `persist` middleware. No seed arrays.** Strip both. If the legacy store had `partialize` / `migrate`, delete them.
- **`byId` is the canonical detail cache.** Rebuild on every list fetch; patch on every single-item fetch / mutation. Detail pages should prefer `byId[id]` over scanning `widgets[]`.
- **Mutate-then-confirm for creates / updates / deletes.** Wait for the API to return the persisted row, then patch local state with that exact row (don't fabricate IDs / timestamps client-side). Optimistic updates are reserved for boolean toggles and progress increments — anywhere a server failure would force a confusing rollback.
- **Errors:** every mutation sets `error` to the message AND re-throws. List fetches store the error but **don't** re-throw (the page banner handles it).
- **Refetch after pagination-affecting mutations.** After `create` or `delete`, fire `void get().fetchAll()` in the background so `total`/`totalPages`/page composition stay accurate.
- **Backward-compat shims.** If the legacy store exposed names like `addAudit` / `deleteAudit`, keep them as thin wrappers (`addAudit: create`, `deleteAudit: remove`) so consumer pages keep compiling. The audit-store kept the legacy names verbatim (`create`, `update`, `delete`, `fetchAll`, `fetchById`, `addDocument`, `removeDocument`, `addTeamMember`, `removeTeamMember`, `addComment`, `editComment`, `deleteComment`, `updateStatus`).

---

## 3. Field-mapping rules

The Route Handler API returns rows in **snake_case** as they live in Postgres (`due_date`, `assignee_id`, `framework_ids`, `created_at`, `closed_overdue`). The legacy TypeScript interfaces under `src/types/index.ts` are **camelCase** with nested objects (`Audit.assignee: User`, `Audit.dueDate`, `Audit.frameworkIds`).

Migration agents face two choices: rewrite the TS interfaces (touches every consumer; out of scope for Phase 5) or **map at the store boundary**. Choose the second. Each store gets a `mapRow()` helper that converts the API row → the legacy interface:

- snake → camel for top-level scalars (`due_date` → `dueDate`).
- For required nested objects the API only returns by id (`assignee_id` only, no `User`), build a **stub object** with the id and empty strings/defaults. UI sites already read these with optional chaining (`audit.assignee?.id`, `audit.assignee?.name`) so missing fields are benign.
- For nested collections that aren't on the list endpoint (`Audit.documents[]`, `Audit.team[]`, `Audit.comments[]`), let them be `undefined` until the detail endpoint or a nested fetch hydrates them.
- Carry forward `previous` (the prior `byId[id]` value) into `mapRow` and merge: `documents`, `team`, etc. already loaded into the detail page should survive a subsequent list refetch.

For writes, build a `toUpdatePayload(patch)` / `toCreatePayload(data)` helper that strips client-only fields (`assignee` → `assignee_id`, `frameworkIds` → `framework_ids`) before calling `api.post` / `api.patch`. Never send the full nested object — the API rejects unknown fields via Zod.

---

## 4. Migration ordering (per store, in order)

1. **Identify endpoints.** Look at `BACKEND-API-MAP §4` for the resource entry; cross-check against `src/app/api/<resource>/...` files for the actual route shape. If a route doesn't exist, flag it in the PR description and ship a local-only fallback action (see audit-store's `addTeamMember` / comment helpers — they update local state and append a log entry while the backend endpoint is pending).
2. **Strip the persist middleware** and the seed array. Delete `partialize`, `migrate`, the `seedXxx` constant, and the `persist(...)` wrapper.
3. **Rewrite each action** to call `api.*`. Use the shape in §2. Preserve action names so consumer pages don't break.
4. **Add lifecycle state**: `isLoading`, `isMutating`, `error`, `lastFetched`. The skeleton-loading rule (`isLoading && audits.length === 0`) is canonical — leave the comment in the store so the next person doesn't have to re-derive it.
5. **Verify `npx tsc --noEmit` is clean.** If pages break because a method got renamed, add a thin shim wrapper (`addAudit: create`) and note it in the PR description.

---

## 5. What stays client-only

These belong in store state but **must not** be persisted, fetched, or sent to the API. They reset on a hard reload.

- `filters` — multi-select sets, text search, date ranges. Driven by the UI; not stored server-side.
- `sort` — `{ field, direction }`. Per-tab preference.
- `pagination.page` / `pagination.pageSize` — UI cursor; `total` / `totalPages` come from the server.
- `selectedXxx` — transient selection (e.g. which row is open in a side panel).
- Any "modal open / closed" boolean — keep these in component-local `useState`, never in the store.

If the legacy store had a `persist` `partialize` that included filters / sort, **drop those keys** — they are deliberately session-scoped now.

Two stores stay persisted because they have no server equivalent:

- `help-store` — onboarding tour state. Pure UI; localStorage is fine.
- `language-store` — until / unless a `profiles.preferred_language` column is added. Group 4's agent should decide: if a column exists, migrate; otherwise leave persisted with a TODO.

---

## 6. Parallel agent assignments (~40 stores in 4 groups)

Each group runs as one agent. Agent reads §1–§5, then sweeps its group bottom-up (smallest first so failures surface early). Each store ends with a `tsc --noEmit` check and a one-line entry in the group's status file under `.planning/phase-5/group-N.md`.

### Group 1 — observations / risks / policies (6 stores)
- `observation-store`
- `risk-store`
- `policy-store`
- `policy-template-store`
- `policy-category-store`
- `risk-category-store`

### Group 2 — correspondence / SAMA letters (10 stores)
- `sama-letter-store`
- `sama-template-store`
- `sama-letter-type-store`
- `sama-sub-category-store`
- `framework-sub-category-store`
- `authority-department-store`
- `correspondence-store`
- `correspondence-type-store`
- `circular-store`
- `advisory-store`

### Group 3 — calendar / training / collaboration (8 stores)
- `training-store`
- `training-category-store`
- `calendar-store`
- `calendar-event-type-store`
- `team-store`
- `message-store`
- `notification-store`
- `user-log-store`

### Group 4 — settings / config / misc (16 stores)
- `framework-config-store`
- `compliance-settings-store`
- `department-store`
- `business-unit-store`
- `audit-template-store` *(NOTE: backend routes were shipped in Phase 4 with the audits-reference family. The **store** still needs migrating — endpoints live at `/api/audit-templates`.)*
- `audit-category-store`
- `scale-labels-store`
- `compliance-evaluation-store`
- `report-store`
- `audit-log-store`
- `onboarding-industry-store`
- `onboarding-region-store`
- `onboarding-headcount-store`
- `user-preferences-store`
- `language-store` *(flag: decide whether a `profiles.preferred_language` column exists; migrate if so, otherwise keep persisted with a TODO)*
- `help-store` *(SKIP — pure UI tour state; keep persisted as-is)*

---

## 7. Reference implementation: `audit-store`

The migrated reference lives at `src/stores/audit-store.ts`. Highlights to copy:

- All API row mapping isolated to two helpers (`mapAuditRow`, `mapDocumentRow`) at the top of the file.
- Writes use `toCreatePayload` / `toUpdatePayload` helpers so the public method signatures still accept the legacy `Audit` shape.
- `start()` and `complete()` are explicit method wrappers around `/audits/[id]/start` and `/audits/[id]/complete`. The legacy `updateStatus(auditId, newStatus, user)` routes to `start` / `complete` for status transitions and falls back to a generic PATCH otherwise.
- `addDocument` calls `POST /api/audits/[id]/documents` and registers the metadata row. The frontend is responsible for uploading the bytes to Supabase Storage first and passing `storage_path` in the payload — the store derives a fallback path if the caller didn't.
- `removeDocument`, `addTeamMember`, `removeTeamMember`, `addComment`, `editComment`, `deleteComment` remain **local-only** because the corresponding DELETE / team / comment endpoints weren't shipped in Phase 4. They patch local state and append a `useAuditLogStore` entry exactly like the legacy seeded version did. A `TODO` comment marks each — Phase 6 will wire them once the routes ship.
- `fetchById` returns `null` (not throws) on `not_found` so detail pages can render a 404 view without a try/catch.

---

## 8. Definition of Done (per store)

- [ ] `persist(...)` middleware removed; no `partialize` / `migrate`; no `seedXxx` const.
- [ ] Every async action calls `api.get/post/patch/delete`.
- [ ] State has `isLoading`, `isMutating`, `error`, `lastFetched`.
- [ ] List actions don't re-throw; mutations do.
- [ ] Mutations set `error` AND re-throw so callers can toast.
- [ ] `byId` index rebuilt on every list fetch; patched on every single-item write.
- [ ] Legacy method names preserved (or shimmed) so consumer pages still compile.
- [ ] Skeleton comment near `isLoading` explains the first-fetch rule.
- [ ] `npx tsc --noEmit` is clean.
- [ ] One-line status entry added to `.planning/phase-5/group-<n>.md`.

---

## 9. File index (Phase 5 foundation deliverables)

- `src/lib/api-client.ts` — typed fetch wrapper + `api.{get,post,patch,delete}` + `ApiClientError` + `Paginated<T>`.
- `src/stores/audit-store.ts` — reference store. Persist + seeds stripped; every action routes through `api.*`.
- `.planning/09-store-pattern.md` — this file.
