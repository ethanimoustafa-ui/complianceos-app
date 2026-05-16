# Group 2 — Stores migrated to server-state (Phase 5)

Date: 2026-05-15
Agent: parallel migration agent — Group 2 (correspondence / SAMA letters)
Reference pattern: `.planning/09-store-pattern.md` and `src/stores/audit-store.ts`

## Stores migrated (10/10)

All persist+seed scaffolding stripped; every async action now routes through
`api.*` from `src/lib/api-client.ts`. Each store carries the canonical lifecycle
state (`isLoading`, `isMutating`, `error`, `lastFetched`), a `byId` map where
appropriate, and the first-fetch skeleton-loading comment near `isLoading`.

| Store                              | Endpoints                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `sama-letter-store.ts`             | `/api/letters` (CRUD + sub-actions: submit-for-approval, approve-step, reject-step, send, mark-response-received). Reference numbers are server-generated on POST. Approval workflow (`submitForApproval`, `approveStep`, `rejectStep`, `send`, `markResponseReceived`) hits the dedicated route handlers and refetches the row to pick up server-computed fields. Template `usage_count` increments are server-owned. |
| `sama-template-store.ts`           | `/api/letter-templates`. `incrementUsage()` now refetches the template list (server bumps `usage_count` on POST /api/letters with `template_id`). |
| `sama-letter-type-store.ts`        | `/api/letter-types`. Surfaces a `key` field separate from server uuid so the persisted letter `type` values keep matching. |
| `sama-sub-category-store.ts`       | Compat shim untouched — re-exports `useFrameworkSubCategoryStore`. |
| `framework-sub-category-store.ts`  | `/api/letter-sub-categories?framework_id=…` (consolidated endpoint per task spec). Surfaces `id` (= server `key`) and `rowId` (uuid for PATCH/DELETE). `.list(frameworkId)` selector preserved. |
| `authority-department-store.ts`    | `/api/authority-departments?authority_id=…`. Bucketed by authority via `byAuthority` map; `getDepartments(authority)` selector preserved. |
| `correspondence-store.ts`          | `/api/correspondence` (CRUD). Reference numbers server-generated. Filters mapped to API query params. |
| `correspondence-type-store.ts`     | `/api/correspondence-types`. |
| `circular-store.ts`                | `/api/circulars` (top-level CRUD). Reference numbers server-generated. **Local-only fallbacks** for articles, workflow-step CRUD, attachments, edit-approval workflow, timeline, PDF tracking — Phase 4 backend only ships the top-level CRUD plus a workflow-advance route. The sub-routes (`/implementations`, `/workflow/advance`, `/timeline`) exist but the existing UI surfaces lean on in-memory state; wiring those is documented as a Phase 6 follow-up. Each fallback is tagged with a comment. |
| `advisory-store.ts`                | `/api/advisory` (CRUD). Reference numbers (ADV-NNNN) server-generated. `addNote()` is local-only — Phase 4 didn't ship `/api/advisory/[id]/notes` (POST). |

## Behaviour changes

1. **Reference numbers now server-side.** `useCircularStore.create()`,
   `useCorrespondenceStore.create()`, `useAdvisoryStore.create()`,
   `useSAMALetterStore.create()` all read the reference from the POST
   response. The `getNextReference()` family of helpers either dropped
   entirely (correspondence, advisory, circular) or converted to a
   `throw`-on-call compat shim (`useSAMALetterStore.getNextReference`).
   Existing call sites that compose a reference client-side will surface
   the failure loudly during testing.
2. **Approval workflow now server-driven.** SAMA letter approve / reject /
   send / mark-response-received calls hit dedicated route handlers and
   refetch the letter detail to surface server-computed timeline +
   approvalChain state.
3. **Template usage tracking now server-side.** `incrementUsage()` refetches
   the template list rather than mutating local `usage_count` directly. The
   server bumps the count on POST /api/letters when `template_id` is passed
   in the create body.

## TypeScript follow-up (consumer-side; out of scope for this agent)

Per the task spec **"Touch ONLY the 10 store files listed above"**, the
following consumer-side TypeScript errors are intentionally left for a
follow-up sweep. They are direct, expected consequences of converting the
relevant store actions from synchronous to async (matching the audit-store
reference). All paths that previously called `store.create(...)` synchronously
and read `.id` off the return value now need to `await` the call. The same
applies to `add()` / `addDepartment()` returns.

```
src/app/(dashboard)/correspondence/feed/page.tsx (×3)         — ListSectionLauncher onAdd signature
src/app/(dashboard)/correspondence/letters/page.tsx (×1)      — ListSectionLauncher onAdd signature
src/components/correspondence/letters/CreateLetterForm.tsx (×3)
  - L254  store.create(...).id              → must await
  - L308  letterTypeStore.add(...)          → ListSectionLauncher signature
  - L371  subCategoryStore.add(...).id      → must await
src/components/correspondence/letters/EditableAuthorityDeptField.tsx (×1)
  - L41   addDepartment(...).id             → must await
src/components/correspondence/letters/TemplateEditForm.tsx (×1)
  - L217  letterTypeStore.add               → ListSectionLauncher signature
src/components/correspondence/regulatory-updates/rules/RegisterCircularModal.tsx (×1)
  - L90   circularStore.create(...).id      → must await
src/components/settings/ListsAndCategoriesSection.tsx (×3)
  - L466-467  subCategoryStore.add(...).id  → must await
  - L568      letterType.add                → ListSectionLauncher signature
```

The `ListSectionLauncher` shared component's `onAdd: (label, labelAr?) => string | void`
interface needs to be widened to `string | void | Promise<string>` (or the
consumer pages should wrap with `void` to discard the promise) — a one-line
change for whichever follow-up agent owns the components.

## Verification

- `npx tsc --noEmit` against just the 10 modified store files: **clean** (0 errors).
- Total tsc errors in the project: 13, all in consumer paths described above
  (plus 7 unrelated errors in `src/app/(dashboard)/team/logs/page.tsx` and
  `src/components/auth/auth-listener.tsx` that pre-date this migration).
- No persist middleware, seed arrays, or `migrate()` chains remain in the
  10 stores.
- Every async action sets `error` on failure; list fetches don't re-throw,
  mutations do.
- `byId` index rebuilt on every list fetch; patched on every single-item
  write.
- Legacy method names preserved or shimmed (e.g. `useSAMALetterStore.getNextReference`
  is a throwing shim; `useSAMASubCategoryStore` is an alias of
  `useFrameworkSubCategoryStore`).
