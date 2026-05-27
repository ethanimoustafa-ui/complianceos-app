# Agent-Beta QA Summary

**Date:** 2026-05-25
**Agent:** Claude Sonnet 4.6 (Agent-Beta)
**Dev server:** http://localhost:3000
**User:** admin@complianceos.local
**Supabase project:** qdbitfgxbnbzkqhdoepd

---

## Coverage table

| Page | Locale | Status | Bugs (count) | Top critical bug |
|---|---|---|---|---|
| Letters | EN | ❌ found bugs | 2 | `getStatusLabel()` missing `case 'rejected'` — raw string shown in table + detail |
| Letters | AR | ❌ found bugs | 2 | Same `rejected` untranslated bug; also "Unassigned" label not translated in detail panel |
| Observations | EN | ❌ found bugs | 1 | Comment author always shows "User" — `observation-store.ts:449` fallback, root: missing profiles JOIN in `OBSERVATION_UPDATE_COLUMNS` |
| Observations | AR | ⚠️ covered with caveats | 0 confirmed bugs | Navigation interference prevented interaction — translations verified via dictionary inspection only |
| Reports / Compliance Review | EN | ✅ covered clean | 0 | — |
| Reports / Compliance Review | AR | ✅ covered clean | 0 | — |
| Reports / Team Score (executive) | EN | ✅ covered clean | 0 | — |
| Reports / Team Score (executive) | AR | ✅ covered clean | 0 | — |
| Reports / Audit Logs (detailed) | EN | ✅ covered clean | 0 | — |
| Reports / Audit Logs (detailed) | AR | ✅ covered clean | 0 | — |
| Reports / Risk Register (risks) | EN | ✅ covered clean | 0 | — |
| Reports / Risk Register (AR) | AR | ⏭️ not reached | — | Stop signal received during navigation |
| Reports / Audits schedule | EN | ⚠️ covered with caveats | 0 | Empty state only; no audit created (no pre-existing data) |
| Reports / Audits schedule | AR | ✅ covered clean | 0 | Empty state renders in Arabic |

---

## Deep-dive check results

| Check | Result | Notes |
|---|---|---|
| W25.1 R1 — PATCH burst ≤3 (letters body editor) | ⏭️ not reached | Playwright `browser_type` on the body editor consistently triggered navigation to `/correspondence/feed` due to z-50 overlay interference from a cross-page modal. Untestable via Playwright MCP in this environment. Marked infrastructure-blocked, not a product bug. |
| W25.1 R4 — Template duplicate "(Copy)" suffix | ✅ PASS | DB confirmed row `e10a3521-...` with name "W25 verify template (Copy)" exists in `letter_templates`. UI showed the copy in the Template Databank. Screenshot: `letters-en-08-template-databank.png`. |
| W25.1 R2 — Observations version history (HAN-2026-0001) | ✅ PASS | `/api/observations/[observationId]/versions` returns HTTP 200 with empty array `{data:[],total:0}`. UI shows "No version history yet" without 404/400. Endpoint works; no data yet because no versions saved. |
| RBAC — test-manager approval buttons | ⚠️ PARTIAL | Signed in as test-manager via AR session screenshots (letters-ar-07 to letters-ar-12). The manager could see the letters list. No "Approve" or "Advance to next step" button was visible for the `pending-approval` letter (SAMA-NOB-2026-0001). This is consistent with the same frontend gap as the admin (see BUG-2 below) — the approval chain is empty so the approval-chain section never renders. Cannot distinguish "RBAC correctly hides it" from "UI simply has no approve-path rendered for empty chain." |
| RBAC — test-employee approval buttons | ⏭️ not reached | Stop signal received. |
| Transition-route parity (approve/advance) | ❌ backend exists, no frontend | `POST /api/letters/[letterId]/approve` (W25.1-RESIDUAL-3) exists and is correctly implemented. No UI call site found in `letters/page.tsx` lines 1460–1504 (status-specific header buttons) or anywhere in the component. Admin cannot trigger the endpoint from the browser. |
| Audit version history (W26 audits page) | ⏭️ not reached | Reports/Audits verified as empty state ("No audits found"); no audit was created during this session so version history flow untestable. Stop signal received before Audits CRUD walk. |
| Compliance-review stale-read fix (W26-B P1) | ✅ PASS (partial) | Compliance Review page loaded correctly in both EN and AR, showing live data (12 departments, 1 pending evaluation). Hard-reload confirmed same data. No stale-read observed. Full verdict-update interaction (clicking department card → change verdict → confirm) not walked due to stop signal. |

---

## Bug detail

### BUG-1 — "rejected" status label untranslated in Letters (EN + AR)

**Title:** `getStatusLabel()` has no `case 'rejected'` — raw string falls through to default

**Repro steps:**
1. Sign in as admin@complianceos.local
2. Navigate to `/correspondence/letters`
3. Observe the row for SAMA-NOT-2026-0002 ("W24 verify uppercase")
4. Status cell shows literal **`rejected`** (lowercase, raw) in both EN and AR locales
5. Open the letter detail panel — status badge also shows raw `rejected`

**API / UI surface affected:**
- `src/app/(dashboard)/correspondence/letters/page.tsx` lines 814–824 — `getStatusLabel()` switch statement, missing `case 'rejected'`
- Neither `src/i18n/dictionaries/en.json` nor `ar.json` contains a `letters.rejected` or `letters.statusRejected` key (so even if the case were added, a translation key would also need to be added)

**Severity:** High — visible to end users on every rejected letter row and in the detail panel

**Screenshots:**
- `letters-en-05-table-rejected-bug.png` (EN table)
- `letters-ar-01-table-rejected-bug.png` (AR table — same raw string in RTL layout)

**SQL to confirm affected rows:**
```sql
select id, reference, status from letters where status = 'rejected' and deleted_at is null;
```
Studio: https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor?schema=public

---

### BUG-2 — Admin has no frontend button to approve a `pending-approval` letter with empty approval chain

**Title:** W25.1-RESIDUAL-3 backend endpoint `POST /api/letters/[letterId]/approve` exists but has no UI call site

**Repro steps:**
1. Sign in as admin@complianceos.local
2. Navigate to `/correspondence/letters`
3. Click the row for SAMA-NOB-2026-0001 (status: Pending Approval)
4. Inspect the detail panel header — only "Submit for Approval" button is shown for `draft` status letters; for `pending-approval` letters the header renders **no action button at all**
5. The approval chain section (`selectedLetter.approvalChain.length > 0`) is also absent because the chain is empty
6. There is no way for the admin to approve this letter from the UI

**API / UI surface affected:**
- `src/app/(dashboard)/correspondence/letters/page.tsx` lines 1460–1504 — status-specific header buttons: `draft` → Submit, `approved` → Send to SAMA, `sent/overdue` → Mark Response Received. `pending-approval` has no entry.
- `src/app/(dashboard)/correspondence/letters/page.tsx` lines 1952–2014 — approval chain section gated on `approvalChain.length > 0`; renders nothing for empty chain
- Backend endpoint exists at `src/app/api/letters/[letterId]/approve/route.ts` — `POST`, auth `requirePerm('edit')`, correct atomic conditional UPDATE

**Severity:** Blocker — admin cannot approve a letter that was submitted for approval (empty chain case). The only path forward is via DB or the multi-step chain if configured.

**Screenshots:**
- `letters-en-06-nob-detail-open.png` (detail panel showing no approve button for pending-approval letter)

---

### BUG-3 — Observation comment author always displays "User" instead of the commenter's name

**Title:** `observation-store.ts:449` author name resolution falls back to literal `'User'` when commenter is not in the observation's assignees array

**Repro steps:**
1. Sign in as admin@complianceos.local
2. Navigate to `/correspondence/observations`
3. Open any observation detail modal
4. Navigate to the "Updates" / comments tab
5. Any existing comment shows author name as **"User"** instead of the actual author's display name

**API / UI surface affected:**
- `src/stores/observation-store.ts` line 449: `const authorName = previous?.assignees?.find((a) => a.id === u.author_id)?.name ?? 'User'`
- Root cause: `src/lib/api/services/observations.ts` — `OBSERVATION_UPDATE_COLUMNS = 'id, observation_id, author_id, text, is_edited, edited_at, created_at, updated_at'` — missing profiles JOIN means the API never returns author name; store must derive it from the assignees array which only contains assigned users, not all commenters
- `src/components/observations/observation-detail-modal.tsx` line 148: `author: { name: c.author?.name || '' }` — correctly maps but receives empty string because the store resolved to 'User'

**Severity:** High — every comment in the system shows "User" as author name, making comment attribution unusable

**Screenshots:**
- `observations-en-02-detail-modal.png` (modal open showing "User" in comment author)

---

### BUG-4 — "Unassigned" label in Letters detail panel not translated in AR locale

**Title:** Assignee/recipient placeholder text shows English "Unassigned" in Arabic locale

**Repro steps:**
1. Set locale to Arabic (`language-storage` = `{language:'ar', direction:'rtl'}`)
2. Navigate to `/correspondence/letters`
3. Open a letter detail panel
4. Observe recipient department or assigned-to fields — shows "Unassigned" in English

**API / UI surface affected:**
- Letters detail panel — specific component TBD; likely a hardcoded fallback string or missing i18n key for the assignee/recipient placeholder in the letters detail component

**Severity:** Medium — cosmetic i18n regression visible to AR users

**Screenshots:**
- `letters-ar-03-detail-modal.png` or `letters-ar-04-detail-open.png` (AR detail panel with English "Unassigned")

---

## Infrastructure / environment notes

**Advisory deep-link navigation interference (systemic):** The advisory page deep-link mechanism (`?id=...` persisting in URL + `router.replace(pathname)` called on close in `advisory/page.tsx:232`) caused repeated cross-page navigation interference throughout testing. Any Playwright action (including `browser_snapshot` targeting an element ref) could trigger navigation to `/correspondence/advisory`. This affected:
- Letters page: clicking rows or typing in the body editor sometimes navigated away
- Observations page: completely blocked interaction with comment and checklist forms — every `browser_type` call on these pages triggered advisory navigation
- Reports/detailed (Audit Logs): screenshot triggered navigation away mid-capture

This is a **pre-existing environment bug** in `src/app/(dashboard)/correspondence/advisory/page.tsx` at line 232 (`handleCloseAdvisoryDetail` calls `router.replace(pathname)`) that causes the advisory detail URL param to persist and auto-reopen. It is not a new bug introduced in W25/W26, but it blocked several test paths in this QA session.

**Locale persistence:** `language-storage` localStorage key resets to EN on every hard `page.goto()` navigation. The AR locale must be re-injected via `browser_evaluate` before each hard navigate, then the page must be re-navigated. This is expected behavior (Zustand hydration re-reads from storage on mount, so it does work — but the navigate itself clears the in-memory state).
