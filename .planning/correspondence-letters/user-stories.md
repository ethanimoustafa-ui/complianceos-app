# Letters — User Stories

**Route:** `/correspondence/letters`
**Primary roles:** compliance officer · compliance manager · org admin · business owner (read + acknowledge)
**Domain entity:** `sama_letters` (table name retained for FE-store compatibility per HANDOFF gotcha #6; surfaced via `/api/letters` after migration 033) + nested `letter_attachments` + `letter_approval_steps` + `letter_timeline` + `observation_letter_links`
**Storage bucket:** `sama_letter_attachments` (private, RLS by `letter_id` prefix)

## What this page is for

Formal letters are the most consequential correspondence object in the system — a letter to SAMA can trigger an inspection or a fine. This page is the inbox + outbox for those letters: every outbound letter is drafted (often from an approved template), routed through a multi-step approval chain, dispatched to a regulator authority + department, and tracked through `sent → response-received → overdue` lifecycle. The list view must answer at a glance: *"what's outstanding, who's it sitting with for approval, when is the response due, does it have a PDF attached"* — **without opening any detail panel**. The detail view hosts inline placeholder editing, attachment management, the approval chain, bilingual PDF export, and a full activity trail.

## Primary user journeys

### Story 1 — Draft a new outbound letter from a template

**As a** compliance officer responding to a SAMA query
**I want to** draft a new letter starting from an approved template, with subject, body, recipient authority + department, framework tags, and attachments
**So that** the format and disclaimers match what compliance has vetted and the letter is ready for the approval chain in one flow.

**Acceptance criteria** (every one observable end-to-end):
- A "New Letter" button is visible on the page header (gated by `Manage Letters` permission — hidden for viewers)
- Clicking it opens `CreateLetterForm` inside the letters modal in < 200ms
- Required fields are marked with red asterisks: letter type (non-objection / inquiry / submission / notification), authority (SAMA / CMA / IA / Sharia Board / ZATCA), recipient department (chained off authority via `getAuthorityDepartments`), subject (EN), body (EN), priority (standard / urgent)
- Optional fields: subject (AR), body (AR), sub-category (key-function / product-launch / etc.), assignee (team-member dropdown), framework tags, signer name + title (EN + AR), recipient name / org / city (EN + AR), draft attachments
- Selecting a template populates subject + body + placeholderDefs from the template; placeholder tokens (`{{circular_ref}}`, `{{report_period}}`) render as `InlineChipEditor` chips the officer fills before save
- "Attach file" picker uploads each file to the `sama_letter_attachments` bucket via `store.uploadAttachment` (path `<letterId>/<timestamp>-<safeName>`); status reflects the per-file progress and rolls back the optimistic row on storage failure
- A "Missing required: …" hint surfaces above Save when any required field is empty; Save is disabled until all required fields are filled
- **The server mints the reference** on POST `/api/letters` via `nextLetterReference` (e.g. `NOB-2026-082`, `INQ-2026-014`); client reads `letter.reference` off the create response — never calls a removed `getNextReference()` shim (BUG-W1 contract)
- After save the modal closes, a success toast appears, the new letter appears at the top of the list with status `draft` and all card data populated (see Story 2)
- Template `usage_count` increments server-side on POST when `template_id` is supplied
- A `letter_timeline` row "Letter created" auto-emits with the actor's name; an `audit_logs` row `letter.create` records the creation
- Hard-reload → the draft is still there with the assigned reference, all subject/body/recipient/attachments/framework tags intact; Supabase Studio shows the matching row in `sama_letters` and `letter_attachments`

### Story 2 — Read the entire letter state from the row, without opening it

**As a** compliance officer scanning the list during morning standup
**I want to** see every key fact on each letter card — reference, subject, type, authority + department, status, sender + recipient authority, sent date, response deadline, framework chip, attachment count, has-PDF indicator, approval state
**So that** I don't have to click into 20 detail panels to know which 3 need my action today.

**Acceptance criteria**:
- Each letter row displays, in this order (left → right or rtl-mirrored): reference badge, authority chip (color-coded via `getAuthorityColors`), type chip, status chip, subject (truncated), recipient authority + department chip, framework chip(s), priority chip when `urgent`
- A "Sent" column shows `sentDate` formatted via `formatTimelineDate`; absent (em-dash) when status is `draft` / `pending-approval` / `approved`
- A "Response Due" column renders `responseDeadline` with a relative-time tail ("in 8 days" / "5 days overdue"); overdue rows get a rose tint and the status chip flips to `overdue`
- An attachment-count badge (paperclip icon + integer) appears when `attachment_count > 0` (decorated server-side in `GET /api/letters`)
- A "PDF" indicator chip appears when `has_pdf === true` (any attachment with `type` ending in `pdf`)
- An approval-state mini-pill shows the current step number / total (e.g. `2 / 3 — Director of Compliance`) when status is `pending-approval`; absent for `draft`, `approved`, `sent`, `response-received`
- All this data is on the **list response** (per `LETTER_LIST_COLUMNS` plus the `attachment_count` + `has_pdf` decorate pass); no `fetchById` is needed for the row to render fully
- Hard-reload → card renders identically before any modal opens; no flicker, no "Loading…" placeholders on the row itself
- The 4 StatCards above the list reflect the *unfiltered* tenant totals (Total YTD / Sent this Quarter / Pending Drafts / Overdue Replies)

### Story 3 — Deep-link to a specific letter

**As a** compliance officer following a notification email
**I want to** click `/correspondence/letters?id=<letterId>` and land on that letter's detail view
**So that** I can act without searching or scrolling.

**Acceptance criteria**:
- Visiting `?id=<id>` switches `view` to `'detail'` and selects the matching letter automatically
- Header info (reference, subject, status, authority + department, sender, recipient, dates, framework chips) renders **instantly** from list-row data
- Deferred sections (attachments, approval steps, timeline, related observations) show 3–5 `<Skeleton>` placeholders briefly, then real content after `fetchById` resolves — gated by `isDetailLoaded` (timeline length > 0 OR approval chain length > 0 OR status ≠ draft)
- Unknown id (or RLS-hidden) degrades to the list view (no crash); a toast reads "Letter not found or access denied"
- Removing the `?id=` param returns to the unfiltered list
- Browser back restores the prior list view with filters/sort intact
- Deep-link to a hard-deleted letter → "Not Found" panel with a back-to-list link (no infinite skeleton)

### Story 4 — Upload, view, download, and remove attachments

**As a** compliance officer who's just received a supporting PDF
**I want to** attach files directly to the letter and have them sticky across reloads
**So that** every reviewer has the supporting evidence one click away.

**Acceptance criteria**:
- The detail panel has an "Attachments" section with an "Attach file" button (gated by `Manage Letters` / `edit` permission)
- Picker accepts any MIME; each file is uploaded sequentially via `store.uploadAttachment`: 1) PUT to `sama_letter_attachments` bucket, 2) POST metadata to `/api/letters/[id]/attachments`, 3) reflect canonical row in store state — UI updates without a refetch
- A spinner + `setAttachBusy(true)` disables the button during upload
- Each attachment row shows: name, size (`formatBytes`), MIME icon (PDF in rose, others in blue), uploaded date, uploaded-by name
- Click the row name → opens the signed-URL stream in a new tab
- A trash icon removes the attachment via `DELETE /api/letters/[id]/attachments/[attachmentId]`; row vanishes optimistically; bucket object is removed server-side; rollback on failure
- The list row's `attachment_count` + `has_pdf` updates after the next list refresh (or eagerly after upload via store optimistic update)
- Hard-reload → all attachments still listed with the same metadata; Supabase Studio shows matching `letter_attachments` rows with `storage_path = '<letterId>/...'`
- Storage bucket missing (per HANDOFF gotcha #3 — `sama_letter_attachments` is one of the 10 missing buckets) → upload surfaces inline error "Storage bucket not configured"; no optimistic row leaks into the UI

### Story 5 — Submit a draft for approval

**As a** compliance officer who's finished drafting
**I want to** click "Submit for Approval" and have the letter routed to the first approver
**So that** the multi-step sign-off begins.

**Acceptance criteria**:
- The "Submit for Approval" button is visible only when `status === 'draft'` and at least subject + body + recipient department are populated
- Clicking calls `POST /api/letters/[id]/submit-for-approval`; `setSubmitBusy(true)` shows the spinner, button disables, and prevents double-click
- Server transitions status to `pending-approval`, seeds the `letter_approval_steps` rows (compliance officer → manager → admin or per tenant config), writes a `letter_timeline` "Submitted for approval" row, and notifies the first approver (`notifications` row)
- The detail panel refetches via `fetchById` so the approval chain renders with each role + name + step status
- The row status chip flips to `pending-approval` instantly (optimistic) and matches server after refetch
- Network failure → status stays `draft`; inline error surfaces; submit button re-enables
- Hard-reload → status is still `pending-approval`; approval chain rows persist in Supabase Studio (`letter_approval_steps WHERE letter_id = ...`)

### Story 6 — Approve or reject an approval step

**As a** compliance manager assigned to step 2 of an approval chain
**I want to** see Approve / Reject actions only on my step and only when prior steps are complete
**So that** the chain progresses in order with a clear audit trail.

**Acceptance criteria**:
- The approval chain section lists each step in order with: step number, role, approver name + avatar (`dicebearAvatar`), status pill (pending / approved / rejected), approval/rejection timestamp
- "Approve" + "Reject" buttons render only on the current step AND only when the viewer's user id matches `assignedTo` (RBAC-gated by `Approve SAMA Letters`)
- Approve opens a notes prompt; on confirm calls `POST /api/letters/[id]/approve-step` with `{ step_index, notes }`; store refetches detail to refresh `approvalChain` + `timeline`; the next step becomes current and its assignee gets a notification
- Reject requires a reason (textarea, ≥1 char); calls `POST /api/letters/[id]/reject-step` with `{ step_index, reason }`; the step flips to `rejected`; status returns to `draft` (per current implementation — see Open question on "rejected" semantics)
- A `samaLetter.approval_step_committed` user-log entry is written client-side mirroring the server audit row
- Once every step is `approved`, status flips to `approved` and the "Send to Authority" button becomes enabled (Story 7)
- Hard-reload → step statuses, timestamps, notes persist; timeline rows for each approval/rejection are listed newest-first
- Network failure → optimistic UI rolls back; an inline error surfaces; the step stays pending

### Story 7 — Send the approved letter to the authority

**As a** compliance officer with an `approved` letter
**I want to** click "Send to Authority" and have the letter dispatched with the response clock started
**So that** the regulator's SLA window begins and downstream tracking kicks in.

**Acceptance criteria**:
- "Send to Authority" button is visible and enabled only when `status === 'approved'`; gated by `Approve SAMA Letters` permission
- Clicking opens a confirmation showing the resolved recipient email (`getDepartmentEmail(authority, department)`) and the rendered EN + AR subjects
- Confirming calls `POST /api/letters/[id]/send`; `setSendBusy(true)` disables the button
- Server transitions status to `sent`, sets `sent_date = now()`, computes `response_deadline` per authority + type (e.g. SAMA non-objection = `sent_date + 14d`), writes `letter_timeline` "Sent to <authority> — <department>" with the recipient address, and writes `samaLetter.sent` audit log
- Detail refetches; the row's "Sent" + "Response Due" columns populate; the status chip flips to `sent`
- A success toast confirms send with the resolved recipient address
- Network / SMTP failure → status stays `approved`; the optimistic chip rolls back; inline error surfaces
- Hard-reload → status, sent date, response deadline, timeline event persist; Studio shows matching `sent_date` + `response_deadline` columns

### Story 8 — Mark response received

**As a** compliance officer who got the regulator's reply
**I want to** mark the response received with the date, so the row exits the "overdue clock"
**So that** the dashboard reflects what's actually waiting on me.

**Acceptance criteria**:
- A "Mark Response Received" button is visible when `status === 'sent'` (or `overdue`); hidden otherwise
- Clicking opens a small dialog: response date (defaults to today), response notes (optional)
- Confirming calls `POST /api/letters/[id]/mark-response-received`; `setResponseBusy(true)` shows the spinner
- Server sets `response_received_date`, transitions status to `response-received`, writes a `letter_timeline` "Response received" row
- The row's status chip flips to emerald `response-received`; the Response Due column gains a `✓` marker; the row no longer counts toward `overdueReplies` StatCard
- Detail refetches; the timeline shows the new entry newest-first
- Hard-reload → status, response date, timeline entry persist
- Overdue auto-flag: if `response_deadline < now()` and status is still `sent`, the row renders with `status === 'overdue'` (computed) and a rose tint — marking response received clears this

### Story 9 — Edit a letter (everything optimistic + persistent)

**As a** compliance officer who needs to fix a typo or update the assignee
**I want to** edit any field via inline editors and have it save instantly
**So that** the record stays accurate without modal round-trips.

**Acceptance criteria**:
- Subject (EN + AR), body (EN + AR), signer (name + title in both languages), recipient (name + org + city in both languages), assignee, and department are all inline-editable when status is `draft` (per `isDraft` gate); body/subject use `LetterBodyEditor` + `LetterSubjectEditor` with `InlineChipEditor` for placeholder tokens
- Each editor uses optimistic update via `store.update`; the snapshot rolls back visibly on network failure with an inline error
- After `draft`, only assignee + department + framework tags remain editable; subject + body are locked (a tooltip explains why)
- Placeholder values can still be edited post-draft (placeholder defs are locked after submit-for-approval)
- `editPlaceholderDefs` auto-promotes any new `{{token}}` typed into the body/subject via `autoPromoteTypedTokens` and persists on the letter row
- Every meaningful field change emits a `letter_timeline` row "Letter updated" listing the changed fields
- Hard-reload → every edited field persists on detail AND row card; Studio confirms via `SELECT subject, body, assigned_to, sama_department FROM sama_letters WHERE id = ...`
- Network failure → optimistic state visibly reverts; inline error renders; spinner clears

### Story 10 — Archive and unarchive a letter

**As an** org admin clearing the dashboard of resolved letters
**I want to** archive completed letters and unarchive them later if needed
**So that** the active list reflects only what's actionable.

**Acceptance criteria**:
- An "Archive" action is available in the row menu and the detail panel (gated by `edit` permission)
- Clicking calls `POST /api/letters/[id]/archive`; an `audit_logs` row `letter.archive` and a `letter_timeline` "Letter archived" row are written
- NOTE: per current `sama_letters` schema there is no `archived` column — archive is a timeline + audit event only; list filtering by archived is a no-op until a column is added (documented constraint, surfaced in Open questions)
- An "Unarchive" action calls `POST /api/letters/[id]/unarchive`, writes the inverse timeline + audit rows
- The detail panel shows the latest archive/unarchive state in the activity trail (Story 12)
- Hard-reload → archive timeline + audit rows persist; the row remains in the list (per the no-op constraint above)

### Story 11 — Hard-delete a letter and its entire subtree

**As an** org admin who registered a duplicate letter by mistake
**I want to** permanently delete it
**So that** the registry doesn't carry ghost rows.

**Acceptance criteria**:
- The detail panel has a "Delete" button (gated by `Manage Letters` + `delete` permission); hidden for officers/viewers
- Clicking opens `DeleteConfirmModal` with strong warning: "This will permanently delete the letter and all its attachments, approval workflow steps, and activity. This cannot be undone."
- Confirming hits `DELETE /api/letters/[id]`; the row disappears from the list instantly (optimistic remove)
- An `audit_logs` row records the deletion BEFORE the row is physically removed (so the audit trail survives)
- Cascade per **migration 046** wipes `letter_attachments`, `letter_approval_steps`, `letter_timeline`, and clears `observation_letter_links` referencing the letter
- Storage objects in `sama_letter_attachments/<letterId>/...` are removed server-side as part of the delete handler
- Hard-reload → row is gone from list, search, deep-link (`?id=<deletedId>` shows Not Found), and Supabase Studio: confirm via `SELECT count(*) FROM sama_letters WHERE id = '<id>'` returns 0, same for child tables — explicit Studio verification required
- Failed delete → optimistic remove visibly reverts; original row reappears with an inline error

### Story 12 — Activity timeline (newest-first)

**As an** auditor preparing an inspection brief
**I want to** see every event that happened to this letter — created, edited, attached, submitted for approval, approved, rejected, sent, response received, archived
**So that** I have an end-to-end audit trail without scraping logs.

**Acceptance criteria**:
- The detail panel has an Activity / Timeline section listing every `letter_timeline` row newest-first
- Each entry shows: formatted date (via `formatTimelineDate`), title (translated via `translateTimelineTitle`), actor name, and a status dot (`completed = emerald`, `active = blue`, `pending = slate`)
- Events include: "Letter created", "Letter updated", "Attachment added: <name>", "Attachment removed: <name>", "Submitted for approval", "Step <N> approved by <name>", "Step <N> rejected by <name> — reason: ...", "Sent to <authority> — <department>", "Response received", "Letter archived", "Letter unarchived"
- RTL-aware: timeline rail flips for Arabic; dates render localized
- Hard-reload → trail order and content identical; Studio shows matching `letter_timeline` rows ordered by `date DESC`

### Story 13 — Filter, search, sort, and export

**As a** compliance officer focused on this week's SAMA work
**I want to** filter by authority + date range, search by reference/subject/authority name, sort by any column, and export the result set
**So that** I see what I need and can hand a snapshot to an inspector.

**Acceptance criteria**:
- Search input filters by `subject`, `subjectAr`, `reference`, `authority` code, and `authority` full name (EN + AR) — case-insensitive
- Authority filter is a multi-select chip popover; date filter offers Any / 30d / 90d / 365d (against `updatedAt`); both apply client-side on the loaded page
- A "Reset filters" affordance clears all three
- Column sort headers (`LetterSortHeader`) cycle through asc → desc → none on click; sortable columns: authority, reference, type, subject, status, updatedAt
- Pagination: page-size 10, paginated server-side via `?page` + `?pageSize`; changing any filter resets to page 1
- The 4 StatCards reflect *unfiltered* tenant totals regardless of filter state
- An export icon in the page header downloads the currently filtered + sorted result set as CSV (localized headers per locale)
- Hard-reload → search/filter/sort state resets to defaults; pagination resets to page 1 (URL params are not currently persisted — see Open questions)

## Edge cases the page should handle

- **Empty state**: fresh tenant shows 4 StatCards at zero + an empty-state panel with "Draft your first letter" CTA wired to the create modal
- **Loading state**: skeleton rows while `useLetterStore.fetchAll()` resolves on first visit (`showLettersSkeleton = isLoading && letters.length === 0 && lastFetched === null`)
- **Repeated visits**: `fetchAll` is TTL-guarded (30s); back-navigation skips the network and re-renders from store
- **Detail-loaded gating**: list snapshot ships minimal data; approval chain / attachments / timeline / related observations sections defer until `isDetailLoaded` resolves
- **Mutation in flight**: Submit / Send / Mark-Received / Delete / Attach buttons all use dedicated busy flags (`submitBusy`, `sendBusy`, `responseBusy`, `deleteBusy`, `attachBusy`) — disabled with a spinner during requests; double-click is impossible
- **Network failure**: every optimistic mutation rolls back visibly and surfaces an inline error via toast + store `error`
- **RBAC**: officers draft + attach; managers approve + send; admins delete; business owners read + acknowledge; viewers read-only — write buttons hidden when permission denied (`Gate` wrapper + `requirePermission` in store)
- **RTL**: full RTL — root container respects `isRTL`; signature block, recipient address, timeline rail all flip; subject/body AR fields use Amiri font; chip order mirrors
- **Reference collisions**: server retries up to 3× on `23505 unique_violation` from `nextLetterReference`
- **Deep-link to a hard-deleted letter**: shows a "Not Found" panel + a link back to the list; no infinite skeleton
- **Attachment upload failures (storage bucket missing)**: the `sama_letter_attachments` bucket is one of the 10 missing buckets per HANDOFF gotcha #3 — upload fails fast with an inline error; no metadata row is written; no ghost attachment leaks into the UI
- **Send-without-approval**: server rejects `POST /send` when status ≠ `approved` with a 409 + clear message; UI button is also gated, so this is a defense-in-depth check
- **Concurrent approval**: two managers approving the same step → server uses optimistic-concurrency on `letter_approval_steps.updated_at`; the loser sees "This step was already actioned" inline error and the chain refetches

## Out of scope for this page

- Inbound letter parsing / OCR (manual entry only per scope §10)
- Digital signing with eIDAS / Saudi NCA certificates (deferred — physical signature line + seal image only)
- Cross-tenant template sharing (single-tenant MVP)
- Email transport via in-region SMTP relay (the `send` endpoint records intent + sets status; the actual outbound email is wired separately per scope §5)
- Automated response detection / inbox polling (manual "Mark Response Received" only)
- PDF generation of the full letters register report (lives on Reports)

## Open questions

- Should "rejected" approval steps return the letter to `draft` (current behaviour) or to a separate `rejected` status that requires explicit re-submission?
- Should the `sama_letters` table gain an `archived boolean` column so list filtering by archived stops being a no-op, or is the timeline-event-only model sufficient?
- Bilingual letters: which language drives the PDF orientation when both blocks exist — locale of the *viewer* or locale of the *recipient department*?
- When a letter is sent, should the response deadline be configurable per-type at the tenant level (settings) or fixed to the SAMA-published SLAs?
- Should filter + sort + search state be reflected in URL params (`?status=draft&sort=updatedAt:desc`) so they survive hard-reload and can be shared?
- Should approval-chain assignees auto-inherit from a role-based config (e.g. "Director of Compliance" always = userId X) or be picked fresh on submit-for-approval?
- When an attachment upload succeeds but the metadata POST fails, should we orphan-collect the storage object eagerly (client-side delete) or leave a server-side janitor job to sweep?
