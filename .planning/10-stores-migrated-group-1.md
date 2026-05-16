# Group 1 — Stores Migrated (Observations / Risks / Policies)

Phase 5 server-state migration completed for the 6 stores in Group 1. All
files now read/write through `/api/*` via `@/lib/api-client`. `persist`
middleware and `seedXxx` arrays have been removed; canonical state fields
(`byId`, `isLoading`, `isMutating`, `error`, `lastFetched`) are in place.

`npx tsc --noEmit` is clean for all six files **and** for every page /
component that consumes them (Lists & Categories settings, PolicyTemplates
settings, observations modals, risks reports page, regulatory-updates
policies page, dashboards, calendar/notification hooks). Pre-existing errors
in Group 2 / Group 3 territory (sama-letter-store, letter-type-store,
sub-category-store, circular-store, user-log-store, plus the consumer files
that import them) are untouched.

## Stores migrated

| Store | API resource | Endpoints wired |
|---|---|---|
| `observation-store` | `/api/observations` | GET list, GET item, POST, PATCH, DELETE; sub-routes `/comments` (POST), `/checklist` (POST/PATCH/DELETE), `/evidence` (POST/DELETE), `/remediation` (POST), `/assign` (POST), `/close` (POST), `/reopen` (POST), `/timeline` (GET). |
| `risk-store` | `/api/risks` | GET list, GET item, POST, PATCH, DELETE; sub-routes `/assign-department`, `/set-deadline`, `/send-to-department`, `/submit-plan`, `/accept-plan` (POST). |
| `policy-store` | `/api/policies` | GET list, GET item, POST, PATCH, DELETE. Workflow transitions piggy-back on PATCH (the dedicated `/workflow/advance` route is not yet wired). |
| `policy-template-store` | `/api/policy-templates` | GET list, POST, PATCH, DELETE. |
| `policy-category-store` | `/api/policy-categories` | GET list, POST, PATCH, DELETE. |
| `risk-category-store` | `/api/risk-categories` | GET list, POST, PATCH, DELETE. |

## Shape conventions

- **policy-category-store / risk-category-store**: the public `id` exposed to
  the UI is the server's `key` column (e.g. `compliance`, `it`) so existing
  policies / risks that reference categories by slug literals keep matching.
  The server's UUID is held in a private `_serverId` field and used to route
  PATCH/DELETE.
- **observation-store / risk-store / policy-store**: snake_case API rows are
  translated at the store boundary via `mapRow()` helpers. Nested fields the
  list endpoint omits (assignees, comments, documents, history, remediation
  plan, version history, workflow timeline, activity log) carry forward from
  the prior `byId[id]` value so detail-page state isn't blown away by a list
  refetch.

## Legacy method names → new

All legacy action names are preserved verbatim; pages keep compiling without
edits. Shims / behaviour notes per store:

### observation-store
- `fetchAll`, `fetchById`, `create`, `update`, `delete` — async, server-backed.
- `addComment` — wired to `POST /api/observations/[id]/comments`.
- `editComment`, `deleteComment` — **local-only** (PATCH/DELETE per-comment
  endpoints not shipped). Timeline entry still appended. TODO marked.
- `addChecklistItem`, `editChecklistItem`, `toggleChecklistItem`,
  `removeChecklistItem` — wired to `/checklist` and `/checklist/[itemId]`.
- `addDocument`, `removeDocument` — wired to `/evidence` (POST/DELETE).
- `transferLeadership` — wired to `/assign` (POST).
- `submitRemediationPlan` — wired to `/remediation` (POST).
- `reviewRemediationPlan` — **local-only** (review endpoint not shipped). TODO.
- `requestClosure` — wired to `/close` (POST). Local status patched to
  `'resolved'` so the UI's "Pending Review" state matches legacy semantics.
- `reviewClosure` — wired (approve → PATCH `status=closed`; reject → `/reopen`).
- `fetchTimeline(id)` — **new**, GET `/api/observations/[id]/timeline`.
- `getNextReference` — preserved (client-side counter; safe because the
  server validates uniqueness).
- All filter/sort/page setters preserved.

### risk-store
- `fetchAll`, `fetchById`, `create`, `update`, `delete` — async, server-backed.
- `updateStatus` — preserved sync signature; optimistic local update +
  background PATCH.
- `markReviewed` — preserved sync signature; optimistic local update +
  background PATCH of `last_review_date` / `next_review_date`.
- `addMitigationItem`, `editMitigationItem`, `toggleMitigationItem`,
  `removeMitigationItem` — **local-only** (no per-item endpoint for the
  top-level risk checklist; observations' checklist family hasn't been
  mirrored onto risks yet). History entry still appended. TODO marked.
- `assignDepartment`, `setMitigationDeadline`, `sendToDepartment`,
  `submitDepartmentPlan`, `acceptDepartmentPlan` — wired to dedicated POST
  endpoints; optimistic local update + background reconciliation.
- `toggleDepartmentPlanItem` — **local-only** for now (the toggle route
  takes both `planId` and `itemId`; the page-side caller doesn't pass
  `planId`). Marked TODO to plumb planId through.

### policy-store
- `fetchAll`, `fetchById`, `create`, `delete` — preserved sync signatures
  (legacy contract). Background async POST/GET runs; optimistic local
  insert/lookup keeps the page rendering immediately. `create` returns the
  optimistic policy synchronously, `fetchById` returns the cached value
  synchronously while a background fetch refreshes.
- `update` — preserved sync signature; optimistic patch + background PATCH.
- `getNextId` — preserved (client-side counter `POL-NNN`).
- `submitForReview`, `approve`, `initiateReview` — preserved; route through
  `update()` which fires PATCH. `useUserLogStore.log` audit entry preserved.
- `reviewAlerts`, `checkAndUpdateStatuses` — preserved (pure client-side).
- `setPhaseDeadline`, `renameWorkflowStep` — preserved; route through
  `update()` to persist the new workflow timeline. Validation (`validateChildDeadline`)
  unchanged.

### policy-template-store
- `create` — preserved sync signature; returns optimistic template; POST runs
  in background.
- `update`, `delete` — preserved sync signatures; optimistic patch + background
  PATCH/DELETE with rollback on failure.
- `incrementUsage` — **local-only** (no `/usage` endpoint shipped). TODO marked.

### policy-category-store / risk-category-store
- `add` — preserved sync signature returning `string` (the slug `id`).
  Optimistic local insert + background POST.
- `update`, `remove`, `resetToDefaults` — preserved sync signatures with
  background API reconciliation.

## Consumer page breakages noticed (NOT touched — left for orchestrator)

None caused by Group 1 stores. The 39 TS errors that remain in
`npx tsc --noEmit` all sit in Group 2 / Group 3 territory:

- `src/stores/sama-letter-store.ts` (Group 2) — `string | undefined`
  unsoundness at line 165.
- `src/components/correspondence/letters/CreateLetterForm.tsx`,
  `EditableAuthorityDeptField.tsx`, `TemplateEditForm.tsx`,
  `RegisterCircularModal.tsx`,
  `src/components/settings/ListsAndCategoriesSection.tsx` (lines 466, 467,
  568) — `Promise<X>.id` access and `Promise<string>` assigned to
  `string | void`. These point to in-flight migrations of the
  `sama-letter-store`, `sama-sub-category-store` / `framework-sub-category-store`,
  `authority-department-store`, `circular-store`, and `letter-type-store`
  (all Group 2).
- `src/app/(dashboard)/correspondence/feed/page.tsx`,
  `correspondence/letters/page.tsx` — same Group 2 stores.
- `src/app/(dashboard)/team/logs/page.tsx` — `user-log-store` (Group 3)
  changed `UserLog.id` shape; the page still expects `number`.

## Verification

- `npx tsc --noEmit` 2>&1 | grep `(observation|risk|policy|policy-template|policy-category|risk-category)-store` → **empty**.
- `npx tsc --noEmit` 2>&1 | grep `(policies|observations|risks)/page` → **empty**.
- `npx tsc --noEmit` 2>&1 | grep `(observation-detail|add-observation|PolicyDetails|DeletePolicyModal|PolicyTemplatesSection|ManagerialView|OfficerView)` → **empty**.

## Files touched

- `src/stores/observation-store.ts`
- `src/stores/risk-store.ts`
- `src/stores/policy-store.ts`
- `src/stores/policy-template-store.ts`
- `src/stores/policy-category-store.ts`
- `src/stores/risk-category-store.ts`
