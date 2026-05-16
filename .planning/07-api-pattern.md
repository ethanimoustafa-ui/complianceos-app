# ComplianceOS API Pattern (Phase 4 — Reference Implementation)

> **Status:** shared service layer + audits reference family complete. `npx tsc --noEmit` is clean.
> **Stack reminder:** Next.js 16 App Router Route Handlers, `@supabase/ssr`, Zod, RLS at every table.
>
> Stage B agents implementing the other 14 resource families: **read §2 + §6, then copy §5 verbatim** for each route file.

---

## 1. Shared service layer — `src/lib/api/*`

All Route Handlers compose from these eight modules. Do not bypass them.

| File | Exports | Purpose |
|---|---|---|
| `response.ts` | `ok(data, { status?, cache?, headers? })` | Wrap `{ data }` with optional `Cache-Control`. |
| | `err(code, message, status, details?)` | Wrap `{ error: { code, message, details? } }`. Error codes: `unauthenticated, forbidden, not_found, validation_failed, conflict, rate_limited, internal`. |
| | `paginate(items, page, pageSize, total)` | Returns `{ items, page, pageSize, total, totalPages }`. |
| | `Paginated<T>`, `CacheOpts` | Types. |
| `errors.ts` | `ApiError`, `ApiErrorCode` | Throwable error class with `code`, `status`, `details`. |
| | `Unauthenticated()`, `Forbidden()`, `NotFound()`, `ValidationFailed(details)`, `Conflict()`, `RateLimited()` | Factory helpers. |
| | `handle(e: unknown)` | Catch-all: maps `ApiError` → `err()`, anything else → 500 `internal`. Logs unknowns. |
| `auth.ts` | `requireUser()` | Per-request memoized (`react.cache`). Returns `{ supabase, user, profile, permissions }`. Throws `unauthenticated` (401). |
| | `requirePerm(perm)`, `requireAllPerms([...])` | Adds a 403 check. |
| | `AuthedRequest`, `Profile` | Types. |
| `validate.ts` | `parseJson(req, schema)`, `parseQuery(searchParams, schema)` | Zod parsing → throws `validation_failed` (400) with `issues[]` as `details`. |
| `pagination.ts` | `parsePagination(searchParams)` | Returns `{ page, pageSize, offset }`. Defaults `page=1, pageSize=10`, clamped to `MAX_PAGE_SIZE = 100`. |
| | `rangeFor(page, pageSize)` | Inclusive `[from, to]` tuple for Supabase `.range()`. |
| | `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` | Constants. |
| `cache.ts` | `cacheTags.<resource>(id?)` | Tag factories (`audits`, `auditTasks`, `auditLogs`, `auditDocuments`, `auditTemplates`, `auditCategories`, plus stubs for `observations`/`risks`/`policies`/`circulars`/`samaLetters`/`correspondence`/`advisory`/`calendar`/`training`/`team`/`reports`/`notifications`/`messages`/`frameworks`/`compliance`/`me`). |
| | `revalidate(tag, profile?)` | Wraps Next 16 `revalidateTag(tag, profile = 'max')`. Safe no-op on failure. |
| | `revalidateAll(tags[])` | Batch. |
| `audit.ts` | `writeAudit({ actor_id, action, entity_type, entity_id, metadata, ... })` | Inserts a row into the tamper-proof global `audit_logs`. Fire-and-forget; never throws. |
| | `writeAuditActivity({ audit_id, action, description, ... })` | Inserts a row into per-audit `audit_activity_logs` timeline. Same semantics. |
| `admin.ts` | `getAdminClient()`, `hasServiceRole()` | Service-role Supabase singleton. Reads `SUPABASE_SERVICE_ROLE_KEY`. Used by `audit.ts` for log writes; never expose to browser. |

### Schemas & service helpers

- `src/lib/api/schemas/<resource>.ts` — Zod schemas (Create/Update/Query). One file per resource family.
- `src/lib/api/services/<resource>.ts` — multi-step DB queries / shared `select` columns / shared assertions used by more than one route handler. Single-call queries stay inline in `route.ts`.

---

## 2. File / folder convention

```
src/app/api/
  <resource>/
    route.ts                       // collection: GET (list), POST (create)
    [resourceId]/
      route.ts                     // item: GET (detail), PATCH, DELETE
      <action>/
        route.ts                   // transition or non-id sub-action (e.g. /start, /complete)
      <nested>/
        route.ts                   // nested collection (e.g. /tasks, /documents)
        [nestedId]/
          route.ts                 // nested item (PATCH, DELETE)
```

Every `route.ts` exports any subset of: `GET`, `POST`, `PATCH`, `DELETE`.
Every `route.ts` exports the runtime config:

```ts
export const runtime = 'nodejs'           // never 'edge'
export const dynamic = 'force-dynamic'    // we cache via Cache-Control + cacheTags, not segment config
```

The route segment `revalidate` export is **not** used — caching is per-response via `ok(..., { cache: { sMaxAge, staleWhileRevalidate, tags } })`, with mutations driving invalidation through `revalidate(tag, 'max')` from `src/lib/api/cache.ts`.

---

## 3. Audits reference family — endpoint inventory

| Method | Path | Permission | Cache (response) | Audit-log events |
|---|---|---|---|---|
| GET    | `/api/audits` | `audit:view` (RLS) | `s-maxage=60, swr=300`; tag `audits:list` | — |
| POST   | `/api/audits` | `audit:create` | no-store | `audit_logs: 'audit.create'` + `audit_activity_logs: 'created'` |
| GET    | `/api/audits/[auditId]` | `audit:view` | `s-maxage=60, swr=300`; tag `audits:<id>` | — |
| PATCH  | `/api/audits/[auditId]` | `audit:edit` | no-store | `audit.update` + `updated` (with `fields[]`) |
| DELETE | `/api/audits/[auditId]` | `audit:delete` | no-store | `audit.delete` (soft-delete via `deleted_at`) |
| POST   | `/api/audits/[auditId]/start` | `audit:edit` | no-store | `audit.start` + `started`. Status `pending|overdue` → `in_progress`. |
| POST   | `/api/audits/[auditId]/complete` | `audit:edit` | no-store | `audit.complete` + `completed`. Sets `progress=100, completed_at=now()`. |
| GET    | `/api/audits/[auditId]/tasks` | `audit:view` | `s-maxage=60`; tag `audits:<id>:tasks` | — |
| POST   | `/api/audits/[auditId]/tasks` | `audit:edit` | no-store | `audit.task.create` + `task.created` |
| PATCH  | `/api/audits/[auditId]/tasks/[taskId]` | `audit:edit` | no-store | `audit.task.update` + `task.updated`. Auto-sets `completed_at` if `completed=true`. |
| DELETE | `/api/audits/[auditId]/tasks/[taskId]` | `audit:edit` | no-store | `audit.task.delete` + `task.deleted` (soft-delete). |
| GET    | `/api/audits/[auditId]/documents` | `audit:view` | `s-maxage=60`; tag `audits:<id>:documents` | — |
| POST   | `/api/audits/[auditId]/documents` | `audit:edit` | no-store | `audit.document.register` + `document.added`. **Note:** body is JSON `{ name, type, storage_path }` — file bytes upload directly to Supabase Storage from the client; this endpoint only records the metadata row. |
| GET    | `/api/audit-templates` | authenticated | `s-maxage=300, swr=600`; tag `audit-templates:list` | — |
| POST   | `/api/audit-templates` | `settings:edit` | no-store | `audit_template.create` |
| PATCH  | `/api/audit-templates/[templateId]` | `settings:edit` | no-store | `audit_template.update` |
| DELETE | `/api/audit-templates/[templateId]` | `settings:edit` | no-store | `audit_template.delete` |
| GET    | `/api/audit-categories` | authenticated | `s-maxage=3600, swr=7200`; tag `audit-categories:list` | — |
| POST   | `/api/audit-categories` | `settings:edit` | no-store | `audit_category.create` |
| PATCH  | `/api/audit-categories/[categoryId]` | `settings:edit` | no-store | `audit_category.update` |
| DELETE | `/api/audit-categories/[categoryId]` | `settings:edit` | no-store | `audit_category.delete`. DB DELETE filters `is_default = false` (system defaults are undeletable). |

**Cache invalidation** for every audit-family mutation: `revalidate(cacheTags.audits())` + `revalidate(cacheTags.audits(id))`. Status/progress-changing transitions also call `revalidate(cacheTags.compliance())`.

---

## 4. Permission mapping

The seeded RBAC matrix (migration `018_seed_data.sql`) defines the source-of-truth keys:

| Backend perm | viewer | auditor | compliance_officer | org_admin |
|---|:---:|:---:|:---:|:---:|
| `audit:view` | yes | yes | yes | yes |
| `audit:comment` | — | — | yes | yes |
| `audit:create` | — | — | yes | yes |
| `audit:edit` | — | — | yes | yes |
| `audit:delete` | — | — | — | yes |
| `settings:edit` | — | — | — | yes |

`audit:view` is enforced via RLS — Route Handlers don't gate reads (any authenticated request hits the rows it's allowed to see). Mutations gate via `requirePerm('audit:create' | 'audit:edit' | 'audit:delete' | 'settings:edit')` before the DB call.

For templates, BACKEND-API-MAP §4.24 mentions a logical permission `templates:manage:audits` — that key does **not** exist in the seed. We resolved to the canonical seeded key `settings:edit` (which maps to the frontend label `"Manage Audit Templates"` per BACKEND-API-MAP §3.3). Stage B should follow the same rule: prefer seeded keys over speculative ones.

---

## 5. Copy-paste-able route skeleton (Stage B)

Adapt this for any new resource — replace `Widget` / `widget` / `widget:*` and swap the schemas + columns.

### 5.1 Collection — `src/app/api/widgets/route.ts`

```ts
import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateWidgetSchema, ListWidgetsQuerySchema } from '@/lib/api/schemas/widgets'
import { WIDGET_LIST_COLUMNS } from '@/lib/api/services/widgets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListWidgetsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))

    let query = supabase
      .from('widgets')
      .select(WIDGET_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
    if (q.status) query = query.eq('status', q.status)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.widgets()] },
    })
  } catch (e) { return handle(e) }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('widget:create')
    const input = await parseJson(req, CreateWidgetSchema)

    const { data, error } = await supabase
      .from('widgets')
      .insert({ /* map input fields */ })
      .select(WIDGET_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'widget.create',
      entity_type: 'widget',
      entity_id: (data as { id: string }).id,
      metadata: { /* small relevant subset */ },
      supabase,
    })
    revalidate(cacheTags.widgets())
    return ok(data, { status: 201 })
  } catch (e) { return handle(e) }
}
```

### 5.2 Item — `src/app/api/widgets/[widgetId]/route.ts`

```ts
import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateWidgetSchema } from '@/lib/api/schemas/widgets'
import { WIDGET_DETAIL_COLUMNS, assertWidgetExists } from '@/lib/api/services/widgets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ widgetId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { widgetId } = await params
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('widgets')
      .select(WIDGET_DETAIL_COLUMNS)
      .eq('id', widgetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Widget ${widgetId} not found`)
    return ok(data, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.widgets(widgetId)] },
    })
  } catch (e) { return handle(e) }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { widgetId } = await params
    const { supabase, user, profile } = await requirePerm('widget:edit')
    await assertWidgetExists(supabase, widgetId)
    const patch = await parseJson(req, UpdateWidgetSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('widgets')
      .update(update)
      .eq('id', widgetId)
      .is('deleted_at', null)
      .select(WIDGET_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'widget.update',
      entity_type: 'widget',
      entity_id: widgetId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidateAll([cacheTags.widgets(), cacheTags.widgets(widgetId)])
    return ok(data)
  } catch (e) { return handle(e) }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { widgetId } = await params
    const { supabase, user, profile } = await requirePerm('widget:delete')
    await assertWidgetExists(supabase, widgetId)
    const { error } = await supabase
      .from('widgets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', widgetId)
      .is('deleted_at', null)
    if (error) throw error
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'widget.delete',
      entity_type: 'widget',
      entity_id: widgetId,
      supabase,
    })
    revalidateAll([cacheTags.widgets(), cacheTags.widgets(widgetId)])
    return ok({ id: widgetId, deleted: true })
  } catch (e) { return handle(e) }
}
```

### 5.3 Sub-action — `src/app/api/widgets/[widgetId]/approve/route.ts`

Same shape as `audits/[auditId]/start/route.ts`. Read the current row, validate the transition, update, audit-log, revalidate. See `src/app/api/audits/[auditId]/start/route.ts` for the canonical example.

---

## 6. Definition of Done — checklist for every resource

Tick all of these per resource. PRs that skip any line will be sent back.

- [ ] Files at `src/app/api/<resource>/...` follow the layout in §2.
- [ ] Every `route.ts` exports `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.
- [ ] Zod schemas live in `src/lib/api/schemas/<resource>.ts`. List/Create/Update/Query each have a dedicated schema. No `z.any()` in production paths.
- [ ] Shared `select` strings + multi-step queries live in `src/lib/api/services/<resource>.ts`. **No `select('*')` on list endpoints.**
- [ ] `requireUser()` runs at the top of every handler. Mutating handlers gate via `requirePerm()`/`requireAllPerms()` using the seeded permission keys from migration 018.
- [ ] Request bodies parsed via `parseJson(req, Schema)`. Query strings via the resource's `ListQuerySchema` or `parseQuery()`.
- [ ] List endpoints accept `?page&pageSize` (default 10, max 100) via `rangeFor(page, pageSize)` and return `ok(paginate(items, page, pageSize, total))`.
- [ ] Read responses set `Cache-Control` via `ok(..., { cache })` and tag with `cacheTags.<resource>(id?)`.
- [ ] Every mutation:
  - [ ] Validates the row exists (`assert<Resource>Exists`) before update/delete.
  - [ ] Calls `writeAudit({ ... })` on success (action key namespaced — `widget.create`, `widget.update`, `widget.delete`, etc.).
  - [ ] Writes any per-entity timeline (where one exists — observations/policies/risks/circulars/sama-letters/audits all have them).
  - [ ] Calls `revalidate(cacheTags.<resource>())` and `revalidate(cacheTags.<resource>(id))`.
  - [ ] Calls `revalidate(cacheTags.compliance())` if the table feeds the scoring engine (audits, observations, risks, policies, circulars, sama-letters, training).
- [ ] Delete is soft (`deleted_at = now()`) on every top-level entity table; selects always filter `.is('deleted_at', null)`.
- [ ] Error path: every handler is wrapped in `try { ... } catch (e) { return handle(e) }`. No raw `NextResponse.json({ error: ... })` constructions outside `response.ts`.
- [ ] `npx tsc --noEmit` is clean.
- [ ] No `console.log` left in the route handlers (errors logged via `handle()` and `writeAudit()` only).

---

## 7. Discrepancies discovered while building audits

Documented for the orchestrator. None block Stage B; all are deferrable.

1. **`audits` table has no `department_id` column** (per migration `008_audits_observations.sql`). BACKEND-API-MAP §4.audits implies a department filter is supported on list. Current behaviour: `?department_id=<uuid>` filters via `profiles.department_id = audits.assignee_id` (i.e. through the assignee). Stage B / a future migration should add a denormalized `department_id` column on `audits` if the product needs department-of-record decoupled from assignee.
2. **Observations have no direct FK to audits** (`observation_id ↔ audit_id`). BACKEND-API-MAP §4.2 mentions "nested counts of observations". `getAuditDetail()` currently returns `counts.observations = 0`. To enable real counts a junction table or denormalized column is needed. Out of scope for Phase 4.
3. **`templates:manage:audits` perm key referenced in BACKEND-API-MAP §4.24** is not seeded. We resolved templates CRUD against `settings:edit` (seeded, mapped to "Manage Audit Templates" in BACKEND-API-MAP §3.3). Stage B should use the same rule.
4. **`audit-tasks/...` top-level paths in BACKEND-API-MAP §4.3** (`/api/audit-tasks/:id`) are **not** implemented. We used the nested route `/api/audits/:auditId/tasks/:taskId` instead — it preserves the audit context that downstream audit-log writes need. Stage B's other resources should default to nested routes for sub-entities unless the BACKEND-API-MAP explicitly demands a flat collection.
5. **Audit-log feed endpoints** (`GET /api/audits/:auditId/logs`, `GET /api/audit-logs`, BACKEND-API-MAP §4.4) are **not** implemented in Phase 4. Stage B will own the read endpoints for `audit_logs` + per-audit `audit_activity_logs`.
6. **`audit:comment` perm** is gated by the seeded matrix (compliance_officer + org_admin only). The `POST /api/audits/[auditId]/comments` endpoint listed in BACKEND-API-MAP §4.2 was **not** implemented in Phase 4 — the audits comment system has its own table (`audit_comments`) but the spec says "out of MVP" for the comments UI on audits. Stage B can add the endpoint trivially using the route skeleton.
7. **`revalidateTag` signature changed in Next 16.** The deprecated single-arg form prints a console warning; `src/lib/api/cache.ts#revalidate()` passes `'max'` as the second argument (immediate purge, matches the old behaviour). Stage B should use `revalidate(tag)` from the helper — never call `revalidateTag` directly.

---

## 8. File index (Phase 4 deliverables)

Shared service layer:
- `src/lib/api/response.ts`
- `src/lib/api/errors.ts`
- `src/lib/api/auth.ts`
- `src/lib/api/validate.ts`
- `src/lib/api/pagination.ts`
- `src/lib/api/cache.ts`
- `src/lib/api/audit.ts`
- `src/lib/api/admin.ts`

Audit-specific:
- `src/lib/api/schemas/audits.ts`
- `src/lib/api/services/audits.ts`

Route handlers:
- `src/app/api/audits/route.ts`
- `src/app/api/audits/[auditId]/route.ts`
- `src/app/api/audits/[auditId]/start/route.ts`
- `src/app/api/audits/[auditId]/complete/route.ts`
- `src/app/api/audits/[auditId]/tasks/route.ts`
- `src/app/api/audits/[auditId]/tasks/[taskId]/route.ts`
- `src/app/api/audits/[auditId]/documents/route.ts`
- `src/app/api/audit-templates/route.ts`
- `src/app/api/audit-templates/[templateId]/route.ts`
- `src/app/api/audit-categories/route.ts`
- `src/app/api/audit-categories/[categoryId]/route.ts`
