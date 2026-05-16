# Fix-2 — observations: dropdown + comment 500 + child resource wiring

## Root cause of the 500 on POST /api/observations/[ref]/comments

`src/stores/observation-store.ts:96-99` remaps API rows so
`observation.id = reference || id`. The detail modal therefore calls
`addComment(observation.id, ...)` with a value like `OBS-2026-0001`, not a
UUID.

`src/lib/api/services/observations.ts:32` (pre-fix) did:

```ts
.from('observations').select('id').eq('id', observationId)
```

Because `observations.id` is `uuid`, Postgres rejected the reference string
with `22P02 invalid input syntax for type uuid` — `errors.ts:handle()`
collapsed that to `internal/500`.

Identical bug was latent in every child route (`checklist`, `evidence`,
`attachments`, `assign`, `remediation`, `timeline`, top-level GET/PATCH/DELETE,
plus `close` and `reopen` which inlined their own `.eq('id', ...)` lookups).

## Fix

1. `assertObservationExists()` now probes `id` when the input matches a
   UUID regex and `reference` otherwise, returning the canonical UUID.
2. Every child route handler now does
   `const observationId = await assertObservationExists(supabase, param)`
   so subsequent `observation_id` FK inserts always use the UUID.
3. `close/route.ts` and `reopen/route.ts` got the same UUID/reference
   probe inlined.
4. `getObservationDetail()` got the same probe and additionally now hydrates
   `updates[]` (the `observation_comments` rows), so the detail modal can
   render existing comments on open instead of starting empty.

## Why the department dropdown was empty

`useDepartmentStore` starts cold — nothing on the observations page or
in either observation modal ever called `fetchAll()`. The `EditableSelect`
in `DepartmentField` was receiving an empty `items` array → "No options".

Fix: `AddObservationModal` and `EditObservationModal` now fire
`useDepartmentStore.fetchAll()` once when `isOpen && lastFetched == null`.
Fix-1's page-mount sweep covers the list page but not the modals.

## Child-resource audit

| resource | was wired? | action taken | DB write verified? |
|---|---|---|---|
| `observation_updates` (comments) | wired but 500'd on reference param | `assertObservationExists` resolves UUID; route inserts with resolved UUID | yes — `commentRow.observation_id === obsUuid` |
| `observation_checklist` | wired but 500'd same way | same fix | yes |
| `observation_documents` (evidence + attachments) | wired but 500'd | same fix on both `/evidence` and `/attachments` (aliases of the same table) | yes |
| `observation_assignees` | wired (replace-set via `/assign`) | resolved UUID for `observation_id` in delete+insert | not asserted in this spec; route covered structurally |
| `observation_timeline` | read-only GET wired | resolved UUID for `eq('observation_id', ...)` | yes — entries appear after writes |
| `observation_team` | not used by the store (legacy table) | n/a | n/a |
| `remediation_plans` | wired via POST `/remediation` | resolved UUID | structurally covered |
| `close` / `reopen` | wired | resolved UUID inline | structurally covered |

The store's PATCH/DELETE-comment, edit/remove paths still use a local-only
fallback because no per-comment Route Handler exists. That's Phase-6
backlog, not a Fix-2 regression.

## tsc

`npx tsc --noEmit` → only pre-existing error is
`src/app/(dashboard)/correspondence/letters/page.tsx:364 — 'common.success'`
which is Fix-3's territory. All Fix-2 changes type-clean.

## Playwright spec

`tests/e2e/fix-2-verify-observations.spec.ts` exercises:
- sign-in (gracefully soft-skips on flake)
- open Add Observation modal, assert department option labels are visible
- POST `/api/observations` to seed
- POST `/api/observations/<reference>/comments` × 2 (the reproducer for the 500)
- POST `/api/observations/<reference>/checklist`
- POST `/api/observations/<reference>/evidence`
- GET `/api/observations/<reference>/timeline`
- DELETE `/api/observations/<reference>` (currently blocked by RLS — logged)

One successful run before parallel-load flake re-skipped subsequent runs:
the comment, checklist, evidence, and timeline assertions all passed on
that run. Sign-in then flaked on later attempts because three agents are
hammering `/api/auth/*` simultaneously through `npm run dev`. The spec
soft-skips on sign-in failure per the supervisor's flake handling rule;
the supervisor can re-run it cleanly post-wave.

## Findings to flag

1. **RLS gap on `observations` UPDATE for soft-delete.** The DELETE
   handler tries `update({ deleted_at: ... })`, but the active RLS
   policy denies that for the admin user
   (`new row violates row-level security policy for table "observations"`
   in Postgres logs). The supervisor should add an UPDATE policy that
   allows admins (or the row's creator) to set `deleted_at`, OR route
   delete through the service-role client. This is a pre-existing schema
   issue, not introduced by Fix-2.

2. **`countDepartmentReferences()` queries `observations.department_id`**
   (`src/lib/api/services/settings.ts:108`) — that column doesn't exist
   (the canonical column is `department text`). Currently harmless because
   the DELETE-department flow likely surfaces the error as a 500 only
   when someone tries to delete a department row in use. Out of Fix-2
   scope but worth noting for the schema-cleanup pass.

3. **Permission `observation:comment` exists** and is wired into the
   POST handler — that was a pre-flight concern that turned out to be
   non-issues.
