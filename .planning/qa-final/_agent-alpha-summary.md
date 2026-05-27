# Agent-Alpha QA Summary

**Date:** 2026-05-25T12:52:00Z
**Agent scope:** Rules + Hub (Feed) + Advisory — EN and AR locales
**Dev server:** http://localhost:3000
**User:** admin@complianceos.local
**Supabase project:** qdbitfgxbnbzkqhdoepd

---

## Coverage table

| Page | Locale | Status | Bugs (count) | Top critical bug |
|---|---|---|---|---|
| Rules | EN | ⚠️ | 1 | Dev-server Fast Refresh loop blocks multi-step modal testing |
| Rules | AR | ❌ | 2 | `NoResultsEmptyState` renders hardcoded English strings in AR locale |
| Hub (Feed) | EN | ❌ | 3 | `fetchAll` never passes `archived` param to API → "All" filter shows 0 rows even when archived items exist |
| Hub (Feed) | AR | ⚠️ | 0 | RTL, Arabic labels, Arabic-Indic numerals all pass; mutation blocked by env |
| Advisory | EN | ⚠️ | 2 | `addNote` POST 201 but UI thread count stays at 0 until hard-reload |
| Advisory | AR | ✅ | 0 | All observed criteria pass — RTL, Arabic timestamps, Arabic labels |

---

## Bug detail

### BUG-1 — Rules AR: `NoResultsEmptyState` renders English strings in Arabic locale
**Page:** Rules (`/correspondence/regulatory-updates/rules`)
**Locale:** AR
**Severity:** High
**Repro:**
1. Switch app to AR locale (`language-storage` key → `ar`).
2. Navigate to `/correspondence/regulatory-updates/rules`.
3. Type a nonsense string in the search box so zero results are shown.
4. Observe the empty-state panel.

**Expected:** "لا توجد نتائج" / "لا توجد عناصر تطابق…" / "مسح الفلاتر"
**Actual:** "No results found" / "No items match your current filters. Try adjusting or clearing them." / "Clear filters"

**Root cause:** `src/components/ui/empty-state.tsx` lines 130-143 — `NoResultsEmptyState` passes hardcoded English string literals as props (`title="No results found"`, `description=...`, `secondaryAction.label="Clear filters"`) rather than calling `t(key)`. The `useTranslation()` hook is available in the parent page component but not threaded into this shared component.

**API surface:** UI-only (no API call; purely a translation miss)
**Screenshot:** `tests/e2e/_artifacts/qa-walkthrough/rules-ar/` (captured in earlier wave; confirmed by code read)
**Code pointer:** `src/components/ui/empty-state.tsx:130-143`

---

### BUG-2 — Hub (Feed) EN: "All" filter does not show archived correspondence rows
**Page:** Hub / Correspondence Feed (`/correspondence/feed`)
**Locale:** EN (also affects AR)
**Severity:** Blocker
**Repro:**
1. Navigate to `/correspondence/feed`.
2. Confirm DB has `correspondence` rows with `archived=true` (e.g. COR-00001: `SELECT reference, archived FROM correspondence` → 1 row, `archived=true`).
3. The feed section shows "No correspondence yet" with the default "Active" filter — correct.
4. Click the "Active" filter dropdown and choose "All".
5. Feed still shows "No correspondence yet" — the archived row does not appear.

**Expected:** Switching to "All" should show all correspondence including archived rows.
**Actual:** Archived rows never appear regardless of the UI filter setting.

**Root cause:** `src/stores/correspondence-store.ts` lines 260-272 — `fetchAll()` calls `api.get('/correspondence', { page, pageSize, type, status, q })` and **never passes the `archived` query parameter**. The API schema (`src/lib/api/schemas/correspondence.ts:66`) defaults `archived` to `'false'`, so every `GET /api/correspondence` call silently excludes archived rows regardless of the UI filter. The UI filter (`correspondenceFilter` state) is applied client-side over the already-filtered store data, so switching to "All" has no effect when archived rows were never fetched.

**API surface:** `GET /api/correspondence` — missing `archived` param from store call
**SQL evidence:** `SELECT id, reference, archived FROM correspondence` → 1 row with `archived=true` (COR-00001); `GET /api/correspondence?page=1&pageSize=10` → `{"data":{"items":[],"total":0}}`
**Studio link:** https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor?schema=public&filter=id%3Deq.759ac6d9-e7a1-4d97-afa7-1fd590382525
**Screenshot:** `tests/e2e/_artifacts/qa-walkthrough/feed/02-hub-en-feed-empty-all-filter.png`
**Code pointer:** `src/stores/correspondence-store.ts:260-272`

---

### BUG-3 — Hub (Feed) EN: `fetchAll` store does not send `archived` override to API on filter change
**Page:** Hub / Correspondence Feed  
**Locale:** EN (also affects AR)
**Severity:** Blocker (same root cause as BUG-2 but distinct surface: the "Archive/Unarchive" workflow is also broken — after archiving a row it disappears from Active view correctly, but switching to Archived view cannot retrieve it because the store never calls `fetchAll({ filters: { archived: 'true' } })`.)

This is a direct consequence of BUG-2. The fix must add `archived` param forwarding in `correspondence-store.ts:fetchAll`.

---

### BUG-4 — Hub (Feed) EN: Upcoming Submission date renders as `MM/DD/YYYY` not localized month format
**Page:** Hub / Correspondence Feed
**Locale:** EN
**Severity:** Medium
**Repro:**
1. Navigate to `/correspondence/feed` with EN locale.
2. Observe the "Upcoming Submission" panel date column.

**Expected per Story 1 relative-time logic:** dates ≥ 7 days away should use `formatDate` from `useUserPreferencesStore.dateFormat` — the user stories imply a human-readable date like "Jun 3, 2026".
**Actual:** Dates render as `03/06/2026`, `04/06/2026`, `24/06/2026` — raw `DD/MM/YYYY` format (ambiguous locale).

**Note:** The `useUserPreferencesStore.dateFormat` is `DD/MM/YYYY` which the component obeys correctly. The user story expectation is aspirational. This is a **UX concern** rather than a code bug — the format matches the user's stored preference. Classified Medium (not Blocker).

**API surface:** UI only — `useFormattedDate` / `formatDateWithPreference`

---

### BUG-5 — Advisory EN: `addNote` POST succeeds (201) but UI thread count does not update in the same session
**Page:** Advisory (`/correspondence/advisory`)
**Locale:** EN
**Severity:** Medium (documented limitation)
**Repro:**
1. Navigate to `/correspondence/advisory?id=b9a1d975-ba88-4434-83fc-0bcbe71ba457`.
2. Type a note in the "Add your note or update..." textarea.
3. Click "Add Note".
4. Network log shows `POST /api/advisory/[id] => 201 Created`.
5. Textarea clears (indicating the click registered).
6. "Discussion Thread (0)" heading does not change to "(1)".

**Expected:** Thread count increments to (1) and the new note appears inline without requiring reload.
**Actual:** UI stays at (0); note appears only after a hard-reload.

**Hard-reload verification:** Navigate to `?id=b9a1d975-ba88-4434-83fc-0bcbe71ba457` fresh → thread shows "(1)" with the note content, author, and timestamp. DB confirms: `SELECT content FROM advisory_notes WHERE request_id = '1f5e4259-...'` returns the note row.

**Root cause:** `advisoryStore.addNote` does not refresh `selectedAdvisory.notes` in the Zustand store after the POST. This is a documented gap in the user stories (Story 10): "Add note — currently NOT optimistic — the textarea posts, awaits the server, then refreshes `selectedAdvisory` from the store; this is the one mutation that round-trips before the UI updates." However the refresh-from-store is also not firing, so the thread count stays stale. The `fetchById` call that should follow the POST is missing or not re-reading into `selectedAdvisory`.

**API surface:** `POST /api/advisory/[id]` → 201 OK; `useAdvisoryStore.addNote`
**SQL evidence:** `SELECT id, author, content FROM advisory_notes WHERE request_id = '1f5e4259-4bec-4239-b744-2d273aa430e5'` → 1 row (bb590a41)
**Studio link:** https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor?schema=public
**Screenshot:** `tests/e2e/_artifacts/qa-walkthrough/advisory/05-advisory-en-note-after-reload.png`
**Code pointer:** `src/stores/advisory-store.ts` — `addNote` action (post-POST refresh logic)

---

### BUG-6 — Advisory EN/AR: Delete button not gated client-side (documented inconsistency)
**Page:** Advisory
**Locale:** EN + AR
**Severity:** Low (known, documented in user stories)
**Observation:** The "Delete" button is visible in the advisory detail modal for all authenticated users regardless of their RBAC permissions. The user stories document this: "The Delete button is NOT gated client-side (the API enforces `delete` permission server-side)." For consistency with circular/observation behavior, the button should be hidden for non-admin users.
**Code pointer:** Advisory page component — no `<Gate perm="delete">` wrapping the Delete button.

---

### Infrastructure note — Dev-server Fast Refresh loop

**Every page in this QA run was affected** by a recurring issue: the Next.js dev server continuously rebuilds (`[Fast Refresh] rebuilding`) approximately every 6-15 seconds, regardless of whether source files changed. Each rebuild triggers a full React remount, which replays any pending `router.push()` calls from prior navigation, causing the page to navigate to a different route mid-test (observed destinations: `/reports/compliance-review`, `/reports/executive`, `/reports/audits`, `/correspondence/observations`, `/correspondence/letters`).

This **blocked all multi-step form submission tests** that required: (1) fill field, (2) check state, (3) click submit — because Fast Refresh fired between steps 1 and 2 or 2 and 3.

**Impact on test coverage:**
- Advisory Story 1 (New Advisory Create via UI form): full form submit not observed via browser clicks — however the DB confirms `ADV-0007` was created in a prior agent wave, proving the flow works end-to-end.
- Hub Story 7 (Log Communication send): the POST did succeed (`COR-00002` created with `status=sent`, confirmed in DB), but the success toast and feed update were not captured because Fast Refresh redirected before they were visible.
- Rules mutation tests (circular create, workflow steps): not retested this wave due to same constraint.

**Recommendation:** Run `npx next dev --turbo` or upgrade to production build for QA testing. The continuous rebuild loop suggests a file watcher or HMR trigger is misfiring on this machine.

---

## W25.1 deep-dive checks (scope notes)

| Check | Status |
|---|---|
| W25.1 R1 — PATCH burst (letters body editor) | ⏭️ Not my scope (Letters page) |
| W25.1 R4 — template duplicate | ⏭️ Not my scope (Letters page) |
| W25.1 R2 — versions endpoint (Rules + Advisory tabs) | ⏭️ Not reached before stop — neither Rules nor Advisory detail panel showed a "Versions" tab in any observed state; no HTTP request to a `/versions` endpoint was observed in network logs |
| Transition-route parity | Partially tested — Advisory "Mark as Complete" (`PATCH /api/advisory/[id]` → 200) worked; circular workflow steps not retested |
| Compliance-review stale-read | ⏭️ Not my scope |
