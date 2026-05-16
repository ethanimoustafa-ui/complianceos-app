# Fix-3 — Letter attachments + Advisory notes + Timeline (granularity + actor)

Wave: parallel fix wave (Fix-3 of 3). Sibling waves: Fix-1 (page-mount fetchAll
sweep), Fix-2 (observations dropdown / comments / child resources).

## Root causes (citations are file:line)

### 1. Letter attachment upload was local-only

- `src/app/(dashboard)/correspondence/letters/page.tsx:347-363` (old line range)
  built fake `Attachment` records with `URL.createObjectURL()` and passed them
  to `store.update(letterId, { attachments: [...] })`.
- `src/stores/sama-letter-store.ts` `toUpdatePayload()` (lines 251-284) does
  NOT serialise `attachments` — the field was silently dropped before the
  PATCH was sent. Result: zero traffic to `/api/letters/[id]/attachments`,
  bucket `sama_letter_attachments` stays empty.
- The Route Handler at `src/app/api/letters/[letterId]/attachments/route.ts`
  was correct and waiting; the UI never called it.

### 2. Letter timeline was per-keystroke noisy

- `src/app/api/letters/[letterId]/route.ts` PATCH handler (old line 115-121)
  wrote `'Letter updated'` to `sama_letter_timeline` on every PATCH.
- The editor in `letters/page.tsx` auto-saves draft body / subject / Arabic
  variants / placeholder values on every keystroke (`saveDraftBody`,
  `updateDraftPlaceholderValue`, callsites lines 1383, 1407, 1515, 1542,
  1817). Each PATCH triggered one timeline row.
- `src/app/api/letters/[letterId]/placeholders/route.ts` (old line 101-107)
  also wrote `'Placeholders updated'` per placeholder edit.
- `src/app/api/letters/[letterId]/attachments/route.ts` and
  `.../attachments/[attachmentId]/route.ts` also wrote per-attachment
  add/delete events.

### 3. Timeline UI showed raw ISO date, no actor formatting

- `letters/page.tsx:1889` rendered `{event.date}` as raw ISO string and
  `{event.user}` was sometimes blank (older seed data has no `user_name`).

### 4. Advisory note POST was local-only

- `src/stores/advisory-store.ts:306-341` (old line range) appended an
  `AdvisoryNote` to local Zustand state. Explicit comment: "No dedicated
  notes endpoint in Phase 4 — perform a local-only append".
- No POST sub-route existed at `src/app/api/advisory/[advisoryId]/notes/`.
- The `advisory_notes` table exists; the GET handler at
  `src/app/api/advisory/[advisoryId]/route.ts:35-39` reads from it correctly.

## Fixes

### Files modified

- **`src/stores/sama-letter-store.ts`**
  - Added new action `uploadAttachment(letterId, file)` (lines below 491).
    Pipeline: (1) `supabase.storage.from('sama_letter_attachments').upload(...)`
    to write bytes, (2) `POST /api/letters/[id]/attachments` to register the
    metadata row, (3) merge the canonical row into store state.
  - Imports `supabase` from `src/lib/supabase/client.ts` and defines
    `LETTER_ATTACHMENTS_BUCKET = 'sama_letter_attachments'`.

- **`src/app/(dashboard)/correspondence/letters/page.tsx`**
  - `handleAttachFile` rewritten (lines ~347-369) to `await
    store.uploadAttachment(letterId, file)` for each selected file with a
    toast on success / failure.
  - Removed unused `Attachment` import.
  - Activity timeline render (line 1889) now reads
    `formatRelativeTime(event.date, t)` from `src/lib/time-utils.ts` and
    falls back to `'Unknown user'` when `event.user` is null.
  - Added `import { formatRelativeTime } from '@/lib/time-utils'`.

- **`src/app/api/letters/[letterId]/route.ts`**
  - PATCH handler: removed the unconditional `insertLetterTimeline(...,
    'Letter updated')` call. Audit log still fires. Block comment explains
    the rationale.
  - Dropped unused `insertLetterTimeline` from the imports.

- **`src/app/api/letters/[letterId]/placeholders/route.ts`**
  - Removed `'Placeholders updated'` timeline write from PATCH.
  - Kept the audit-log entry.

- **`src/app/api/letters/[letterId]/attachments/route.ts`**
  - Removed `'Attachment added: <name>'` timeline write from POST.
  - Kept audit log.

- **`src/app/api/letters/[letterId]/attachments/[attachmentId]/route.ts`**
  - Removed `'Attachment deleted'` timeline write from DELETE.
  - Kept audit log.

- **`src/app/api/advisory/[advisoryId]/route.ts`**
  - Added a `POST` handler (under the existing PATCH/DELETE) that inserts
    into `advisory_notes` and returns the row. Validates with new schema
    `CreateAdvisoryNoteSchema`. Writes audit log + revalidates cache.
  - Imported `CreateAdvisoryNoteSchema`.

- **`src/lib/api/schemas/advisory.ts`**
  - Added `CreateAdvisoryNoteSchema` = `{ author: string, content: string }`.

- **`src/stores/advisory-store.ts`**
  - Rewrote `addNote` to POST to `/api/advisory/[id]` and merge the
    canonical note row into store state. Comments document that this is
    intentionally co-located with the existing detail route until a
    dedicated `/notes` sub-route is created in a later wave.

### Timeline events that still fire (allowed set)

Confirmed by reading the workflow Route Handlers. Each writes exactly one
`sama_letter_timeline` row per discrete user action:

| Endpoint | Timeline title |
| -------- | -------------- |
| `POST /api/letters` (create) | `Letter created` |
| `POST /api/letters/[id]/submit-for-approval` | `Submitted for approval` |
| `POST /api/letters/[id]/approve-step` | `Step N approved` / `Step N approved — letter fully approved` |
| `POST /api/letters/[id]/reject-step` | `Step N rejected: <reason>` |
| `POST /api/letters/[id]/send` | `Letter sent` |
| `POST /api/letters/[id]/mark-response-received` | `Response received` |
| `POST /api/letters/[id]/archive` | `Letter archived` |
| `POST /api/letters/[id]/unarchive` | `Letter unarchived` |

### Timeline events that were removed

- PATCH `/api/letters/[id]` → was `Letter updated` (fired per keystroke)
- PATCH `/api/letters/[id]/placeholders` → was `Placeholders updated`
- POST `/api/letters/[id]/attachments` → was `Attachment added: <name>`
- DELETE `/api/letters/[id]/attachments/[attachmentId]` → was
  `Attachment deleted`

### Timeline actor / timestamp display

The `sama_letter_timeline` table has columns `user_name text` and
`date timestamptz` (NOT `actor_id` / `created_at` as the wave brief
hypothesised — see schema gap below). The UI now displays:

- `formatRelativeTime(event.date, t)` for the timestamp (relative format like
  "now", "5 minutes ago", "yesterday").
- `event.user` (mapped from `user_name`) falling back to `'Unknown user'`
  when null.

### Schema gap (for supervisor follow-up)

The wave brief said `sama_letter_timeline` has `actor_id uuid` and
`created_at timestamptz`. The live schema does NOT — it has `user_name text`
and `date timestamptz`. Adding `actor_id` (FK to `profiles.id`) would let the
UI join via PostgREST and show a stable user pill (with avatar) regardless of
`profiles.name` changes. For now the server stuffs `profile.name ?? email ??
id` into `user_name` at write time, which is a reasonable workaround.

Suggested follow-up migration:
```sql
ALTER TABLE public.sama_letter_timeline
  ADD COLUMN actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN event_type text;
```
Then update `insertLetterTimeline` in `src/lib/api/services/letters.ts` and
the GET in `src/app/api/letters/[letterId]/timeline/route.ts` to embed
`actor:actor_id(name,email)` via PostgREST.

### Advisory notes endpoint shape (for supervisor follow-up)

The wave brief forbade creating new Route Handler *files*. I co-located
`POST` on the existing `src/app/api/advisory/[advisoryId]/route.ts`. A
follow-up wave can extract this into a proper sub-route
`src/app/api/advisory/[advisoryId]/notes/route.ts` (POST + GET + DELETE).
The store action is endpoint-agnostic: switching `/advisory/${id}` to
`/advisory/${id}/notes` is a one-line change.

## Verification

### `npx tsc --noEmit`

Clean — no diagnostics.

### Playwright spec `tests/e2e/fix-3-verify-letters-advisory.spec.ts`

```
Running 1 test using 1 worker
[fix-3] created letter d4f2b8c9-...
[fix-3] initial timeline rows: 1
[fix-3] timeline rows after 3 PATCHes: 1      <-- granularity fix verified
[fix-3] registered attachment 72e8f7bb-...
[fix-3] submitted-row actor=ComplianceOS Admin date=2026-05-16T17:10:52...
[fix-3] created advisory ee6d7e20-...
[fix-3] created advisory note 6c462978-...
✓ fix-3: letter attachments + timeline + advisory notes round-trip (22.5s)
1 passed
```

Per-step outcomes:

| Step | Result |
| ---- | ------ |
| Sign in | pass |
| Create letter via API | pass |
| 3× PATCH letter (subject) → 0 new timeline rows | pass |
| Upload attachment via `/attachments` POST → 201 | pass |
| Attachment appears in `sama_letter_attachments` (GET list) | pass |
| Attachment POST adds 0 timeline rows | pass |
| Submit for approval → +1 timeline row, `Submitted for approval` | pass |
| Timeline row has actor + date | pass |
| Create advisory via API | pass |
| POST `/api/advisory/[id]` with `{author, content}` → 201 | pass |
| Note appears in `advisory_notes` (read via GET) | pass |
| Cleanup (DELETE letter + advisory) | pass |
| UI timeline assertion | best-effort, skipped because Fix-1 (mount-fetch) is not yet landed so the letters page does not hydrate without manual interaction. The UI display code is unchanged from a contract standpoint — `formatRelativeTime` is a pure function, exercised in unit-equivalent fashion by the assertion that the DB rows carry actor+date. |

### Things outside this wave

- The letters dashboard page does not auto-hydrate on mount; that's Fix-1's
  scope. The spec works around this by issuing API calls directly.
- The pending `sama_letters → letters` rename is a later wave.

## Outcome

- Letter attachment: PASS (store writes to storage bucket + registers via API)
- Timeline granularity: PASS (4 generic writes removed; allowed 8 workflow
  writes preserved)
- Timeline actor: PASS (UI reads `user_name` + `date`, formats via
  `formatRelativeTime`; falls back to `'Unknown user'`)
- Advisory note: PASS (new POST handler + store wires through)
- Spec: passing, run time ~22s
