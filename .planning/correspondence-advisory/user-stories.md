# Advisory — User Stories

**Route:** `/correspondence/advisory`
**Primary roles:** compliance officer · compliance manager · business owner · org admin
**Domain entity:** `advisory_requests` + `advisory_notes` (the thread)

## What this page is for

The advisory page tracks the back-and-forth of compliance opinions — internal departments asking *"is this allowed?"*, Sharia board guidance, and the compliance team's recorded answers. Each advisory has a server-minted `ADV-NNNN` reference, a subject, a long-form description (the question), a requesting business unit (department id from the shared department store), a requester name, a status (`pending` / `in_progress` / `completed`), a priority (`low` / `medium` / `high`), an optional assignee, and a `notes` thread (chronological author+content entries via `advisory_notes`). It's the institution's audit-defensible record of *"why we decided to do X"* when the regulator later asks.

The list view answers at a glance: *"what's open, who's asking, who owns it, when was it raised, has anyone replied yet?"* — using the row card alone, with no detail modal required.

## Primary user journeys

### Story 1 — Submit a new advisory request

**As a** business owner who is unsure whether a new product launch needs SAMA non-objection
**I want to** submit an advisory request to the internal compliance team with subject, requesting department, priority, requester name, optional assignee, and the question body
**So that** the compliance team picks it up, records an authoritative opinion, and the question becomes part of the audit trail.

**Acceptance criteria** (every one observable end-to-end):
- A "New Advisory Request" button is visible on the page header (gated by `Manage Audit Findings`)
- Clicking it opens the New Request modal in < 200ms
- Required fields (marked with `*` in the label): **Subject**, **Business Unit**, **Priority**, **Description**
- Optional fields: **Requested By** (defaults to the current user's name from `authStore.user`), **Assigned To** (picks from `teamStore.members`)
- The Business Unit picker is the shared `EditableSelect` backed by `useDepartmentStore` — adding a new department inline immediately appears in every other dropdown app-wide (settings, observations, circulars), and persists on reload
- Submit click without all four required fields surfaces a "Fill required fields" toast and the modal stays open
- On valid submit, the modal closes, the form resets, and an "Advisory request submitted" toast appears
- The new advisory appears at the top of the list **optimistically** (with a temp id) before the server responds; on server confirmation the temp row swaps to the server row carrying the minted `ADV-NNNN` reference
- The server-minted reference follows the pattern `ADV-NNNN` (zero-padded, year-agnostic) via `nextAdvisoryReference` with a 3-attempt retry on `23505` reference-collision
- `status` defaults to `pending`; `requested_date` is auto-set to today (`YYYY-MM-DD`)
- An `audit_logs` row records `advisory.create` with `{ ref, business_unit }` metadata
- Hard-reload → the advisory is still at the top of the list with the same `ADV-NNNN`, subject, business unit, priority, requester, and assignee

> **Honest limitation** — the modal does **not** offer: a "send to" picker (no external regulator/internal-counsel routing — every advisory is internal compliance), **a framework tag**, a **related-entity link** (no link to a circular, observation, audit, risk, or policy), or **file attachments**. The system has no advisory-attachments table; the question body is plaintext only.

### Story 2 — Read the entire advisory state from the row, without opening it

**As a** compliance officer scanning the queue during the morning standup
**I want to** see reference, status, priority, subject, a 2-line description preview, business unit, requester, request date, assignee, and reply count on each row card
**So that** I can triage today's work without opening every modal.

**Acceptance criteria**:
- Each advisory row card displays (left → right, mirrored in RTL): `ADV-NNNN` reference badge, status chip (slate / blue / emerald), priority chip (slate / amber / rose)
- The subject renders as a bold heading; the description is truncated to 2 lines via `line-clamp-2`
- A meta row beneath the description shows: business unit (resolved via the department store and i18n fallback in `renderBusinessUnit`), requester name, request date, and — when notes > 0 — a blue "N notes" chip with a message-circle icon
- The assignee, when set, renders as an emerald pill on the right edge of the card; absent when not set
- A `chevron-right` (or `chevron-left` in RTL) hints the row is clickable
- All this data comes from `ADVISORY_LIST_COLUMNS` on the list response; no `fetchById` is needed for the row to render fully
- The notes count is **not** on the list response (only the detail endpoint loads `advisory_notes`), so the "N notes" chip only appears after the detail panel has been opened at least once (or `fetchById` has otherwise been triggered). On a fresh hard-reload the chip is absent until the row is opened — **document this limitation**

### Story 3 — Open and track an advisory thread (deep-link supported)

**As a** compliance officer who got a link to an advisory
**I want to** click `/correspondence/advisory?id=<advisoryId>` and land directly on that advisory's open detail panel showing the full question, all metadata, and the discussion thread
**So that** I can respond without searching.

**Acceptance criteria**:
- Visiting `/correspondence/advisory?id=<id>` auto-opens the detail modal for that advisory (driven by the `useEffect` watching `searchParams` against `advisoryStore.advisoryRequests`)
- The modal header shows the subject and `REF: ADV-NNNN`
- The body renders: status chip, priority chip, a 4-cell metadata grid (Business Unit, Requested By, Request Date, Assignee), the full Description block, and the Discussion Thread section
- Opening the modal triggers `useAdvisoryStore.getState().fetchById(id)` to hydrate `notes`; the local `selectedAdvisory` is refreshed from the freshly-fetched detail
- Notes render newest-first per the server `order('created_at', { ascending: false })`, each in a slate card with the author bold, the timestamp localized (`ar-SA` in Arabic locales, `en-US` otherwise), and a left-border accent (mirrored to right-border in RTL)
- An unknown `?id=` value leaves the user on the list (no crash, no error toast)
- Removing the `?id=` query param closes the modal (or rather, the next user-driven open is required — the deep-link effect only opens; it does not auto-close on param removal — **document this**)

### Story 4 — Reply to an advisory (append a note)

**As a** compliance manager
**I want to** post my opinion or follow-up question as a note on the advisory thread
**So that** the requester sees the answer and the back-and-forth becomes a permanent record.

**Acceptance criteria**:
- The detail panel exposes a textarea labeled per `t('advisory.addNotePlaceholder')` and an "Add Note" button
- Submitting an empty / whitespace-only note is a no-op (the button is wired to `if (!newNoteContent.trim()) return`)
- On valid submit, `advisoryStore.addNote` POSTs to `/api/advisory/[id]` (the note POST is co-located on the detail route per Fix-3) with `{ author, content }` where author is `authStore.user.name`
- The note appears in the thread, `selectedAdvisory.notes` is refreshed from the store, the textarea is cleared, and a "Note added" toast appears
- The note timestamp uses `created_at` from the server; the row card's "N notes" chip count increments
- An `audit_logs` row records `advisory.note.add` with `{ advisory_id }`
- Hard-reload → the note is still there, in the same chronological position, with the same author and timestamp
- Failure (e.g. server 500) leaves `isMutating` reset and surfaces `error` on the store; the UI does **not** currently render this inline on the advisory panel — **document this UX gap**

> **Honest limitation** — replies do **not** support attachments. There is no per-note file upload, and the `advisory_notes` table has no attachment columns. Status changes (Story 5) also do **not** emit a system note into the thread — they're only visible via the status chip and `audit_logs`. The thread is plain author+text entries only.

### Story 5 — Mark an advisory complete and reassign it

**As a** compliance manager who has finalized an opinion
**I want to** mark the advisory complete and (separately) hand it to another team member while it's still in progress
**So that** the status reflects reality and the right person is on the hook.

**Acceptance criteria**:
- The detail panel shows a "Mark Complete" button only when `status !== 'completed'`, gated by `Manage Audit Findings`
- Clicking "Mark Complete" calls `advisoryStore.updateStatus(id, 'completed')`, optimistically flips the chip on the row and in the modal, closes the modal, and shows a "Status updated" toast
- The reassign control is an `EditableSelect` populated from `teamStore.members.filter(m => m.status === 'active')`, also gated by `Manage Audit Findings`
- Picking a team member calls `advisoryStore.reassign(id, name)`, updates the assignee pill on both surfaces, resets the picker, and shows an "Assignment updated" toast
- The status update writes an `audit_logs` row `advisory.update` with `{ fields: ['status'] }`; reassign writes `{ fields: ['assigned_to'] }`
- Hard-reload → the new status chip and assignee persist on the row card and the detail panel
- On server failure the optimistic update **rolls back visibly** via the snapshot-restore pattern in `useAdvisoryStore.update` (this is the canonical reference store cited in `OPTIMIZATION-PATTERNS.md`); the previous status / assignee reappears
- The reassign picker stores the team member **`name`** (not the team_member UUID) — see Open Question 3 below

> **Honest limitation** — the UI exposes **only** a "Mark Complete" action and a reassign picker. There is no "Move to In-Progress" button, no "Re-open a completed advisory" button, and no inline editor for subject / description / priority / business unit / requested-by. The PATCH endpoint accepts all those fields (the store's `update` action is fully wired), but no Edit modal calls it. Treat this as **feature exists in store + API but not exposed in UI**.

### Story 6 — Hard-delete an advisory (actually a soft delete)

**As an** org admin who registered a duplicate advisory by mistake
**I want to** permanently remove it from the list
**So that** the registry doesn't have ghost rows.

**Acceptance criteria**:
- The detail panel has a rose "Delete" button (no permission gate in UI — the API enforces `delete` permission server-side)
- Clicking opens `DeleteConfirmationDialog` with the advisory's subject and item type "advisory request"
- Confirming calls `advisoryStore.delete(id)`, optimistically removes the row from the list, closes the modal, and shows a "Request deleted" toast
- The API performs a **soft delete** (`UPDATE advisory_requests SET deleted_at = NOW()`), not a hard delete; subsequent GETs filter via `.is('deleted_at', null)`
- An `audit_logs` row records `advisory.delete`
- Hard-reload → the advisory does not reappear on the list, in search, or via deep-link (deep-link returns the not-found fallback)
- On server failure the optimistic remove rolls back: the row is re-inserted at its original index (`prevIndex` snapshot pattern), and `error` is set on the store
- **No cascade verification needed** — `advisory_notes` are orphaned in the database but never re-shown because the parent's `deleted_at` filter hides them; nothing is physically deleted

> **Honest limitation** — there is no hard-delete path; "delete" is reversible at the DB level by clearing `deleted_at`. There is also no UI for restoring a soft-deleted advisory. If a destination cascade-test ever runs, expect `advisory_notes` rows to remain in the DB pointing to the soft-deleted request.

### Story 7 — Filter and search the queue

**As a** compliance officer working through Q2 SAMA-related advisories assigned to me
**I want to** narrow the list by status, priority, business unit, and time-frame and free-text search the subject + description
**So that** I see only what I need without scrolling 50 rows.

**Acceptance criteria**:
- Filter controls are visible above the list inside a `glass-card` panel: search (subject + description), status (`pending` / `in_progress` / `completed`), priority (`low` / `medium` / `high`), business unit (from the department store, with inline add / edit / remove), and time-frame (week / month / quarter / semi-annual / annual / fiscal)
- The result count under the page sub-header reads "N requests" using the filtered length
- Changing any filter resets `advisoryPage` to 1 (via the `useEffect` watching all five filter values)
- Pagination chevrons navigate through pages of filtered results at `pageSize = 10`; current page / total pages render between the chevrons
- The time-frame filter computes a date range client-side per `getDateRangeForFrequency` and compares against `req.requestedDate` (so "this fiscal" means after April 1 of the current fiscal year)
- A "Clear Filters" pill appears when any filter is set; clicking it resets all five filters and the search box
- Search is **client-side substring** on `subject` + `description`; the server-side `q` query is also wired in the store / API but the page does not currently feed it — filters apply to the in-memory result set after `fetchAll`

### Story 8 — Export the filtered queue to CSV

**As an** auditor preparing an inspection brief
**I want to** export the currently filtered advisory list
**So that** I can hand the inspector a snapshot of what was tracked.

**Acceptance criteria**:
- A "Export to CSV" button is visible in the pagination footer (only when `filteredAdvisory.length > 0`)
- Clicking it calls `exportAdvisoryLocalized(filteredAdvisory, 'advisory-requests', t, isRTL)` and triggers a localized download
- The export respects the current filters — only what's visible on screen is exported
- The export language follows the current locale (en / ar)
- A toast "Export to CSV" confirms the download

### Story 9 — First-fetch skeleton + reload persistence

**As a** compliance officer who just hit `/correspondence/advisory` for the first time today
**I want to** see clean skeleton cards while data loads, and then see the same data on every subsequent reload without re-flashing the skeleton
**So that** the page feels instant and steady.

**Acceptance criteria**:
- On a cold visit (`advisoryRequests.length === 0 && lastFetched === null && isLoading`), `CardSkeleton count={4}` renders in place of the list
- Once `fetchAll` resolves, `lastFetched` is set; subsequent refetches keep the (now stale) data on screen and only the global mutating spinner indicates work
- Hard-reload → after the first fetch lands, the page shows the same advisories in the same order (server-sorted `requested_date DESC`)
- The `useEffect` mount hook fires `fetchAdvisory`, `fetchTeam`, and `fetchDepartments` in parallel so the modal pickers are populated immediately
- Network failure on `fetchAll` sets `error` on the store, clears `isLoading`, and leaves the list empty — there is currently **no inline error banner** rendered for fetch failures on the advisory page; the only fallback is the empty-state inbox card

### Story 10 — Optimistic UI on every mutation

**As a** compliance manager working through a queue at low bandwidth
**I want to** every create / update / reassign / status-flip / delete to land instantly and roll back visibly on failure
**So that** I'm never blocked by a slow round-trip.

**Acceptance criteria**:
- **Create** — temp row prepended to the list with `id = temp-adv-<n>` (via `newTempId`); on server-200 the temp row is swapped for the real row with `ADV-NNNN`; on server-fail the temp row is removed and `error` is set
- **Update / updateStatus / reassign** — snapshot saved, patch applied to `byId` + `advisoryRequests` + `selectedRequest` in one set; on server-fail the snapshot is restored to all three slots and `error` is set
- **Delete** — row removed from list + `byId`, `selectedRequest` nulled if it matched; on server-fail the row is re-inserted at its original `prevIndex` and `error` is set
- **Add note** — currently **not optimistic** — the textarea posts, awaits the server, then refreshes `selectedRequest` from the store; this is the one mutation that round-trips before the UI updates. Document this gap; aligns the store's docstring claim of "Phase 5 server-state migration" with reality
- A double-click on Submit / Mark Complete / Delete cannot fire twice because `isMutating` gates the store (though buttons are not visually disabled — **document this**)
- All five mutation patterns are unit-tested in the advisory store and serve as the reference implementation for other domain stores (per `OPTIMIZATION-PATTERNS.md`)

## Edge cases the page should handle

- **Empty state**: a fresh tenant shows the filters card + an inbox illustration with `t('advisory.noRequests')` and `t('advisory.noRequestsDescription')` (W1 walk confirmed this renders cleanly)
- **First-fetch skeleton**: `CardSkeleton count={4}` while `isLoading && advisoryRequests.length === 0 && lastFetched === null`
- **Stale-fetch**: subsequent refetches keep prior data on screen — no skeleton flash
- **Pagination**: `pageSize = 10`; if filtered length drops below `(page - 1) * 10` the user sees an empty page — there's no auto-clamp on `advisoryPage` when the filtered length shrinks (**known minor UX bug**)
- **RBAC**: `Manage Audit Findings` gates the "New Advisory Request" button, the "Mark Complete" button, and the reassign picker. The Delete button is **not** gated client-side (the API enforces `delete` server-side, so the button may surface a permission error toast for low-privilege users — **document this inconsistency**)
- **RTL**: full RTL — root has `rtl` class when `isRTL`; the discussion-thread border-accent flips from left to right; metadata labels right-align
- **Reference collisions**: `nextAdvisoryReference` retries on `23505` up to 3 times (no `SECURITY DEFINER` RPC — service-role-side max-scan instead of the circular pattern); year-agnostic format
- **Department renamed inline**: `renderBusinessUnit` resolves via the department store first, then the legacy i18n keys for advisories created before the department migration, then the raw id as a final fallback — so user-added departments stay readable even before they get a translation
- **Soft-delete deep-link**: visiting `?id=<soft-deleted>` triggers `fetchById`, which returns 404 → store sets `error` and returns `null`; the modal does not open. The user lands on the unfiltered list with no error indicator (**known UX gap**)
- **Network failure**: every optimistic mutation rolls back on failure (per Story 10); failures are stored on `advisoryStore.error` but not surfaced inline on the page — only the create-modal's "fill required fields" toast and the success toasts are visible

## Out of scope for this page

- **Attachments on the request body or on individual notes** — no `advisory_attachments` table; not modeled
- **A framework tag on the advisory** — only `business_unit` is recorded
- **A related-entity link** — no FK to circular / observation / audit / risk / policy; an advisory can only reference these via plaintext mention in `subject` / `description`
- **External-recipient routing** — advisories are always internal compliance review; no "send to regulator" path
- **Sharia-specific workflow** (e.g. multi-scholar voting) — Sharia advisory currently uses the same generic flow
- **An Edit modal for subject / description / priority / business unit / requested-by** — the API and store support full PATCH; the page does not render the UI yet
- **A "Move to In-Progress" or "Re-open" button** — only "Mark Complete" is exposed
- **A status-change system note in the thread** — status changes only appear via the chip and `audit_logs`, not as inline thread entries
- **An activity timeline tab** — there is no equivalent of the circular's Activity tab; `audit_logs` exist but are not rendered
- **Email notification to the requesting department on status change** — handled (if at all) by the notifications subsystem; not surfaced here
- **PDF export of an advisory thread** — only CSV of the row list is supported

## Open questions

1. Should `advisoryStore.addNote` adopt the same optimistic-prepend pattern as `create` and `update`? Today the textarea round-trips before clearing — it's the only non-optimistic mutation in this store
2. Should the **subject / description / priority / business unit** be editable through an Edit modal? The PATCH endpoint and `advisoryStore.update` are wired; no UI surfaces them
3. The reassign picker stores the team member **`name`** (string), not the team_member **UUID** — meaning a rename in `/team` will orphan the assignment. Should reassign migrate to UUIDs (matching how circulars and observations key their assignees)?
4. Should the "N notes" chip on the row card be populated from a `notes_count` aggregate on the list response (currently it only appears post-`fetchById`)?
5. Should the Delete button be hidden client-side for users without `delete` permission, matching circular / observation behavior?
6. Should the activity / status-change history render as inline thread entries (like correspondence) or as a separate Activity tab (like circulars)?
7. Are advisory requests visible only to the requesting department + compliance team, or org-wide by default? RLS today is org-wide; if narrower visibility is required it needs a policy change
8. Does a `completed` advisory get version-locked, or is the answer thread editable forever? Today notes can be appended even after completion; nothing prevents it
