# Observations — User Stories

**Route:** `/correspondence/observations`
**Primary roles:** compliance officer · compliance manager · business owner · auditor · org admin
**Domain entity:** `observations` + nested `observation_checklist` + `observation_updates` (comments) + `observation_documents` + `remediation_plans` + `observation_timeline` + `closure_requests` + `closure_reviews` + `observation_assignees` + `observation_team`

## What this page is for

Observations are the day-to-day workload of a Saudi compliance department. Every finding raised by SAMA, CMA, IA, ZATCA, an internal audit, or an inspector lands here, gets a severity and a source-authority tag, is assigned to a leader and a business-owner department, given a remediation submission deadline + a completion deadline, and tracked through a remediation plan to closure. The observations tracker is what compliance staff have in front of them most of the day — `/observations` redirects here and there is no separate `/observations/new` route. Creation, editing, and deletion are all modal-driven from this page. The list view must answer at a glance: *"what's overdue, who owns it, what severity, when's the plan due, what's the source authority"* — **without opening any detail panel**.

## Primary user journeys

### Story 1 — Register a new observation (with all required surface data)

**As a** compliance officer who just received a SAMA finding letter
**I want to** register the observation with subject, severity, status, source authority, target/completion deadline, framework, department, description, leader/assignees, **and optionally drop the source PDF into the modal in one flow**
**So that** remediation tracking starts immediately and the row card carries everything the team needs to triage it.

**Acceptance criteria** (every one observable end-to-end):
- An "Add Observation" button is visible on the page header (gated by `Manage Audit Findings`)
- Clicking it opens `AddObservationModal` in < 200ms
- Required fields are marked with red asterisks: title (subject), severity (critical/high/medium/low), source authority (SAMA / CMA / IA / ZATCA / Internal / Sharia / etc., driven by `sourceConfig`), status (defaults to `open`), assignees (≥ 1), completion due date, department
- Optional fields: subtitle, reference (server-minted on save if blank), description, remediation submission due date, framework tags (multi-select via `FrameworkTagSelector`)
- An "Attach files" picker (`FileUpload`) accepts PDF + common Office + common image MIME types; selected files appear as removable chips in the modal body before save
- A "Missing required: …" hint surfaces below the form when any required field is empty (per commit `36b0acc`, same pattern as Circulars + Policies)
- Save is disabled until all required fields are filled
- After save, the modal closes, a success toast appears, and the new observation appears at the top of the list with a server-assigned reference and severity/status/source chips visible on the row card immediately
- The reference is server-minted (the client's `getNextReference()` shim is a fallback only — same anti-pattern as letters)
- A `timeline` row "Created this observation" is appended with the actor's name + avatar
- An `audit_logs` row records the creation with `action='observation.create'`
- Hard-reload → the observation is still there, with title, subtitle, severity, source, due dates, department, leader, description, framework tags, and any attachments still rendered identically
- Optimistic UI: if the POST fails, the row visibly disappears and an inline error renders (no ghost rows)

### Story 2 — Read the entire observation state from the row, without opening it

**As a** compliance officer scanning the list during the morning standup
**I want to** see every key fact on each observation card — reference, source authority + icon, severity chip, status chip with live-pulse indicator, framework tag, department, leader name + avatar, completion due date with relative-time chip, submission due date if set, attachment count or evidence indicator
**So that** I don't have to click into 20 modals to know which 3 need my attention today.

**Acceptance criteria**:
- Each `ObservationTableRow` displays, in this order (left → right or rtl-mirrored): reference (`#<id>`), source icon + label, title + subtitle, severity badge, due-date with `lucide:flag` icon, submission-due-date with `lucide:file-clock` icon (when set), live status chip with animated pulse on `resolved`, action menu
- Severity badge uses the `severityConfig` palette (critical = rose, high = orange, medium = amber, low = slate); colors fade to slate when status is `closed`
- The completion due date renders with a relative-time tail when within ±30 days (e.g. "in 8 days", "5 days overdue"); overdue (status ≠ `closed` AND `due_date < today`) gets a rose tint
- A framework tag chip renders next to the source when `frameworkIds` is non-empty
- A department chip renders below the title
- A leader avatar + name renders inline next to the title; falls back to "Unassigned" when `leaderId` is null
- An attachment indicator (paperclip icon + count) renders when `documents.length > 0`
- Rows with `status='closed'` render at 60% opacity with a green check-circle in place of the action menu
- **All of the above must come from the list response** (per `useObservationStore.fetchAll()` — list columns selected via the API service); no `fetchById` is needed for the row card to render fully
- Hard-reload → card renders identically before any modal opens; no flicker, no "Loading…" placeholders on the card itself

### Story 3 — Deep-link to a specific observation

**As a** business owner notified by email
**I want to** click `/correspondence/observations?id=<observationId>` and land on the observation's detail panel
**So that** I can read the finding and start remediation without searching the list.

**Acceptance criteria**:
- Visiting with `?id=<id>` auto-opens `ObservationDetailModal` for that observation (per `useEffect` on `searchParams` in `page.tsx`)
- Header data (title, subtitle, severity, status, source, leader, due dates, description) renders **instantly** from the list-row data
- Deferred sections — Comments / Updates, Documents, Remediation Plan, Activity Timeline, Closure Status — show 3–5 `<Skeleton>` placeholders briefly via `isDetailLoaded(id)`/`detailLoaded` until `fetchById(id)` resolves, then real content
- Unknown id degrades to the list view (no crash, no error toast)
- Removing the `?id=` param returns to the unfiltered list and closes the modal
- An observation that was hard-deleted between the email and the click → the modal opens to a "Not found" empty state with a link back to the list (no crash; row is gone from list per Story 10)

### Story 4 — Add / edit / delete comments on an observation

**As a** compliance officer following up with the assigned business owner
**I want to** post a comment, edit my own past comment, and delete a stale one
**So that** the back-and-forth lives inside the observation record with author + timestamps + edit history.

**Acceptance criteria**:
- The detail modal has an "Updates & Discussion" / Comments section (per `CommentsSection`)
- Submitting a comment writes through `POST /api/observations/[id]/comments`; the new comment appears in the list immediately (optimistic) with the current user as author and "just now" timestamp
- Each comment shows: author name + avatar, body, created-at (formatted), and an "edited" label + timestamp when `isEdited` is true
- Edit and delete affordances are visible **only** to (a) the comment's author or (b) compliance managers + org admins (per `requirePerm` gate; UI hides the buttons when not allowed)
- Editing calls `PATCH /api/observations/[id]/comments/[commentId]`; the body updates in place and the "edited" label appears with the new timestamp
- Deletion calls `DELETE /api/observations/[id]/comments/[commentId]` and is explicit — no inline "X" hover; user must click the trash icon and confirm (matches circular pattern)
- Each add / edit / delete emits a corresponding `observation_timeline` row (`comment_add` / `comment_edit` / `comment_delete`) with actor + target id
- Hard-reload → comments persist in chronological order with their `isEdited` flag, `editedAt` timestamp, and author resolved to current display name
- Network failure on any of the three actions → optimistic mutation visibly reverts and an inline error appears next to the comment

### Story 5 — Upload supporting documents to an observation

**As a** business owner who has fixed the issue and gathered evidence
**I want to** click "Attach", pick a PDF / screenshot / signed memo, and have it appear in the Documents section sticky across reloads
**So that** the auditor can close the observation without asking for more files. **(HANDOFF §4 #3 flags this as broken because the `observation_documents` storage bucket has not been created — write very precise acceptance criteria so a QA agent can verify the bug.)**

**Acceptance criteria**:
- The detail sidebar has a "Related Documents" section with an "Upload" button (per `RelatedDocuments`, gated by `canUploadDocument(user, observation)`)
- Clicking opens `FileUploadModal` with a file picker that accepts PDFs, common images, and common Office MIME types; max size 20 MB default / 50 MB for evidence
- After picking, the user confirms; the file is uploaded to the `observation_documents` Supabase Storage bucket and a row is inserted into `observation_documents` via `POST /api/observations/[id]/attachments` with `{ name, type, storage_path }`
- On success: the document appears in the Documents section with name + size + type icon (pdf/image/doc); a `document_add` row is appended to `observation_timeline`; an `audit_logs` row records `observation.attachment.add`
- **Hard-reload → the document is still in the Documents section** (this is currently broken per HANDOFF §4 #3; the `observation_documents` storage bucket is one of 10 missing buckets — the POST currently 404s on the storage upload, so the row is never persisted)
- **Studio verification (the QA acceptance test):** after a successful upload, opening Supabase Studio → SQL Editor and running `SELECT id, name, storage_path, uploaded_at FROM observation_documents WHERE observation_id = '<id>' ORDER BY uploaded_at DESC;` returns the row. If it returns 0 rows after a "successful" upload, the bug is confirmed (storage bucket missing — see Story 13 edge case)
- Each uploaded document is downloadable via a "Download" icon-button that streams the file from `storage_path` with the original filename
- Removing a document explicitly hits `DELETE /api/observations/[id]/attachments/[attachmentId]` after a confirm; emits a `document_delete` timeline row; hard-reload → the document is gone

### Story 6 — Manage a remediation plan and its items

**As a** business-owner-department lead assigned to remediate a critical finding
**I want to** create a remediation plan, add concrete sub-items, mark items complete as I finish them, toggle them back to incomplete if I overstate progress, and delete items that turn out to be irrelevant — and have the plan's completion percentage roll up automatically
**So that** compliance can see live progress without nagging.

**Acceptance criteria**:
- The detail sidebar has a "Remediation Status" section (per `RemediationStatus`); when no plan exists, an "Add Remediation Plan" button is visible
- Creating a plan opens `RemediationPlanModal` with fields: title, description, due date, status (defaults to `draft`); on save POSTs to `/api/observations/[id]/remediation`; the plan appears in the sidebar immediately with status pill (`draft` slate → `submitted` blue → `approved` emerald → `rejected` rose)
- After plan creation, the user can add sub-items inline (the plan reuses the `observation_checklist` table per migration 043 comment — items are checklist entries scoped by `plan_id`)
- Toggling an item complete hits `PATCH /api/observations/[id]/remediation/[planId]/toggle` (or the checklist `[itemId]` endpoint); the item checkmark fills + line-through; the **rolled-up completion percentage** at the plan header updates immediately (e.g. "3 of 5 complete · 60%")
- Toggling an item back to incomplete reverses the above; the percentage drops
- Deleting an item is explicit (trash icon + confirm); the item disappears from the list; percentage recomputes
- Each add / toggle / delete emits an `observation_timeline` row (`checklist_add` / `checklist_update` / `checklist_delete`)
- Hard-reload → plan, all items, their completed/incomplete states, the due date, and the computed % persist exactly; Studio `SELECT * FROM remediation_plans WHERE observation_id = '<id>'` returns the plan row and `SELECT * FROM observation_checklist WHERE observation_id = '<id>'` returns the items
- Optimistic UI on every mutation; rollback visibly on server failure with an inline error
- A plan that has been `approved` shows a "View approval" affordance (Story 7); items remain togglable until the observation is closed

### Story 7 — Submit and approve / reject a remediation plan

**As a** compliance manager reviewing the business owner's plan
**I want to** see when a plan has been submitted, read the items, approve it or reject it with notes
**So that** the BO knows whether to start executing or revise.

**Acceptance criteria**:
- When `RemediationPlan.status = 'submitted'`, the sidebar Remediation Status section shows a "Review" affordance to users with `canReviewRemediation(user, observation)` permission (compliance managers + org admins; BO who authored the plan is NOT allowed to self-review)
- The review action exposes Approve and Reject buttons; Reject requires entering rejection notes (textarea, ≥ 10 chars)
- Approve hits `PATCH /api/observations/[id]/remediation/[planId]` with `{ status: 'approved', reviewedBy, reviewedAt, reviewNotes? }` → status pill turns emerald; the BO sees the approval inline; a `remediation_approved` timeline row is appended
- Reject hits the same endpoint with `{ status: 'rejected', reviewNotes }` → status pill turns rose; the BO sees the rejection notes inline; a `remediation_rejected` timeline row is appended; the BO can edit items and re-submit
- Hard-reload → the reviewer name, reviewed-at timestamp, status, and notes all persist on the sidebar; Studio `SELECT status, reviewed_by, reviewed_at, review_notes FROM remediation_plans WHERE id = '<planId>'` returns the persisted row
- An approval does NOT auto-close the observation — closure is a separate flow (Story 8)

### Story 8 — Close and reopen an observation

**As a** compliance manager satisfied that the remediation is complete
**I want to** request closure, then have an approver verify and close the observation — and, if I close one in error, **reopen it within a reasonable window**
**So that** the registry reflects only legitimately-closed findings.

**Acceptance criteria**:
- The detail sidebar has a "Closure Status" section (per `ClosureStatus`)
- When the observation is `open` / `in_progress` / `resolved` AND the user has `canRequestClosure(user, observation)`, a "Request Closure" button is visible
- Clicking opens an inline form for closure notes; submitting hits `POST /api/observations/[id]/close` with `{ notes }`; the section now shows "Closure requested by <name> at <date>" + the notes
- A reviewer with `canReviewClosure(user, observation)` sees Approve / Reject buttons on the closure request (the requester cannot self-approve — same author-blocking pattern as remediation plans)
- Approving the closure flips `observation.status` to `closed`, sets `closureReview = { approved: true, reviewedBy, reviewedAt, notes }`, and the list row immediately renders at 60% opacity with the green check icon
- Rejecting closure flips the closure request back to "Pending" with the rejection notes; observation status stays as-is
- A "Reopen" button is visible on the detail header when status is `closed` AND user has `observation:edit` permission; clicking hits `POST /api/observations/[id]/reopen` with optional notes; status flips back to the prior value (or `in_progress` if unknown), row opacity restores, and a `status_change` timeline row is appended
- Each close / reopen / closure-request / closure-review action emits a corresponding `observation_timeline` row
- Hard-reload → status, closure request, closure review, and reopen history all persist; Studio `SELECT * FROM closure_requests WHERE observation_id='<id>'` and `SELECT * FROM closure_reviews WHERE observation_id='<id>'` return the rows

### Story 9 — Edit an observation (everything optimistic + persistent)

**As an** org admin who registered an observation with the wrong department or severity
**I want to** edit any field — subject, severity, status, source, framework, department, leader, due dates, description, attachments — and have it save instantly
**So that** the registry stays accurate.

**Acceptance criteria**:
- The row's action menu has an "Edit" item (gated by `Manage Audit Findings`)
- Edit opens `EditObservationModal` with every field pre-filled — including assignees as chips, framework tags as chips, and current attachments as removable chips
- Toggling a chip immediately updates local state
- Save calls `PATCH /api/observations/[id]`; modal closes; updates appear instantly on detail view AND on the row card
- Each changed field is enumerated in a single `observation.update` `audit_logs` entry; the `observation_timeline` row reads "Updated fields: severity, due_date" with the actor's name
- Hard-reload → every edited field persists on detail panel AND on row card (severity badge, status chip, due-date chip, source, leader avatar, attachments list, framework tags)
- Removing an attachment in the edit modal calls `removeDocument(observationId, docId, …)` which writes a `document_delete` timeline row before the PATCH; hard-reload → the attachment is gone, the timeline still shows it was removed
- Network failure on PATCH → optimistic state visibly reverts; an inline error renders below Save

### Story 10 — Hard-delete an observation and its entire subtree

**As an** org admin who registered a duplicate observation by mistake
**I want to** permanently delete it
**So that** the registry doesn't have ghost rows or spurious open counts.

**Acceptance criteria**:
- The row's action menu has a "Delete" item (gated by `Manage Audit Findings` with the `delete` capability)
- Clicking opens `DeleteConfirmationDialog` with `requireConfirmation` (user must type `DELETE`) and the strong warning: "This will permanently delete the observation '<title>' and all its comments, documents, remediation plans, and activity. This cannot be undone."
- Confirming hits `DELETE /api/observations/[id]`; the row disappears from the list instantly (optimistic remove)
- An `audit_logs` row records `observation.delete` BEFORE the row is physically removed (so the append-only trail survives — per migration 043 comment + HANDOFF §5 gotcha #7)
- Per migration 043's verified cascade, deleting the parent row also wipes: `observation_checklist`, `observation_documents`, `observation_updates` (comments), `observation_timeline`, `observation_assignees`, `observation_team`, `remediation_plans`, `closure_requests`, `closure_reviews`, `letter_observations` — **every FK is `ON DELETE CASCADE`**
- **Studio verification (the QA acceptance test):** after a successful delete, run in Supabase SQL Editor:
  ```sql
  SELECT count(*) FROM observations WHERE id = '<id>';                     -- expect 0
  SELECT count(*) FROM observation_checklist WHERE observation_id = '<id>';-- expect 0
  SELECT count(*) FROM observation_documents WHERE observation_id = '<id>';-- expect 0
  SELECT count(*) FROM observation_updates WHERE observation_id = '<id>';  -- expect 0
  SELECT count(*) FROM observation_timeline WHERE observation_id = '<id>'; -- expect 0
  SELECT count(*) FROM remediation_plans WHERE observation_id = '<id>';    -- expect 0
  SELECT count(*) FROM closure_requests WHERE observation_id = '<id>';     -- expect 0
  SELECT count(*) FROM closure_reviews WHERE observation_id = '<id>';      -- expect 0
  SELECT count(*) FROM audit_logs WHERE entity_id = '<id>'::text;           -- expect ≥ 2 (create + delete preserved)
  ```
- Hard-reload → row is gone from list, search results, and deep-link (which now degrades to "Not found")
- Failed delete (network or 403) → optimistic remove visibly reverts; the original row reappears with an inline error

### Story 11 — Read the full activity timeline of an observation

**As an** auditor preparing an inspection brief
**I want to** see every event that happened to this observation — created, leader transferred, status changed, severity changed, checklist item added/edited/deleted/toggled, comment added/edited/deleted, document added/deleted, remediation submitted/approved/rejected, closure requested/approved/rejected, reopened
**So that** I have an end-to-end audit trail without scraping logs.

**Acceptance criteria**:
- The detail sidebar has an "Activity Timeline" section (per `ActivityTimeline`); renders every `observation_timeline` row newest-first
- Each entry shows: status-dot color (created = blue, completed = emerald, deleted = rose, edited = amber), formatted timestamp via `formatTimelineDate` (or the bilingual `dateKey` translation for "today" / "yesterday"), actor name + avatar, and a localized description (uses `descriptionKey` + `descriptionParams` for standard actions, falls back to the literal `description` / `descriptionAr` string)
- The trail includes at minimum these action types (per `Observation['timeline'][n].actionType`): `created`, `updated`, `status_change`, `severity_change`, `observation_updated`, `checklist_add` / `checklist_edit` / `checklist_delete` / `checklist_update`, `comment_add` / `comment_edit` / `comment_delete`, `document_add` / `document_delete`, `leader_transfer`, `remediation_submitted` / `remediation_approved` / `remediation_rejected`
- The timeline rail is RTL-aware (flips for Arabic)
- While `detailLoaded` is false, the timeline shows a few `<Skeleton>` rows; after `fetchById` resolves, real entries render in place
- Hard-reload → order and content of the trail are identical; the rows are read from `observation_timeline` via `GET /api/observations/[id]/timeline`
- Bilingual rendering: in `ar` locale, the description uses `descriptionAr` (or the localized `descriptionKey`) and the layout mirrors RTL

### Story 12 — Filter, search, paginate, and export observations

**As a** compliance officer focused on SAMA critical findings overdue this week
**I want to** filter the list to SAMA + Critical + Overdue and export the result for the inspector
**So that** I see only what I need and can hand the inspector a snapshot.

**Acceptance criteria**:
- The filter strip above the table exposes: search (title / subtitle / reference), source authority, severity, status, completion due-date cutoff, remediation submission due-date cutoff (per `ObservationFilters`)
- All filters compose (AND) via the `filteredObservations` memo in `page.tsx`
- A "Clear filters" button appears when any filter is active and resets all six in one click
- Pagination: `itemsPerPage = 10`; changing any filter resets `currentPage` to 1; "Showing X–Y of Z" surface visible; pagination chevrons navigate filtered results
- The 5 `ObservationStats` cards (total / open critical / overdue / in remediation / drafting / closed-this-quarter) reflect the **unfiltered** counts; this is intentional so users see global state alongside the filtered slice
- An export icon ("Export CSV", gated by `Export Compliance Data`) is visible in the header
- Clicking it calls `exportObservations(filteredObservations, 'observations-<date>', t, isRTL)` and triggers a localized download — only what's visible (filtered) is exported
- The export filename is `observations-YYYY-MM-DD.csv` in `en` locale and `ملاحظات-YYYY-MM-DD.csv` in `ar` locale
- The exported columns and headers follow the current locale (en / ar)

### Story 13 — Transfer leadership of an observation

**As a** compliance manager when the current leader goes on leave
**I want to** transfer leadership to another assignee
**So that** ownership is unambiguous and the right person gets notified.

**Acceptance criteria**:
- The detail sidebar has an "Observation Leader" section (per `ObservationLeader`); when set, shows the leader's avatar + name; when not, shows "Unassigned"
- A "Transfer" affordance is visible only when `canTransferLeadership(user, observation)` is true (current leader + compliance managers + org admins)
- Clicking opens `TransferLeadershipModal` listing all current assignees (`observation.assignees` ∪ `observation.team`) excluding the current leader
- Selecting a new leader hits the leadership-transfer store action which PATCHes `leader_id`; the sidebar updates immediately
- A `leader_transfer` timeline row auto-emits: "Leadership transferred from A to B"
- Hard-reload → the new leader avatar + name persists on the detail panel AND the row card

## Edge cases the page should handle

- **Empty state**: fresh tenant shows 5 `ObservationStats` cards at zero + an empty `ObservationTable` with a CTA ("Add Observation") below; the CTA wires to the same `onAddObservation` that the header button uses
- **Loading state**: `ListSkeleton rows={5} columns={5}` renders while `useObservationStore.fetchAll()` resolves on **first** visit only (`isLoading && observations.length === 0 && lastFetched === null`); on subsequent refetches the stale list stays on screen — no flash of empty
- **Repeated visits**: `fetchAll` is store-driven; back-navigation re-renders from store immediately (no spinner)
- **Mutation in flight**: Save / Status / Delete / Upload / Comment buttons disable during requests; double-click is impossible
- **Network failure on any optimistic mutation** (create, edit, delete, comment add/edit/delete, document add/delete, checklist toggle, remediation review, closure request/review, leader transfer): the optimistic UI visibly reverts and an inline error renders next to the affected control
- **RBAC**: officers + managers can register/edit; assigned business owners can edit assigned observations + manage their own remediation plan; viewers see read-only; auditors get read-only with export — buttons hidden when permission denied (per `Gate perm="…"`)
- **RTL**: Arabic observation titles render right-to-left; row-card chip order mirrors; sidebar lives on the right; timeline rail flips
- **Deep-link to a hard-deleted observation**: the modal opens to a "Not found" empty state with a "Back to list" link; the URL `?id=<gone>` is preserved so the user can refresh / share without crash
- **Document upload failure due to missing storage bucket** (per HANDOFF §4 #3): the `observation_documents` bucket is not yet created. The POST `/api/observations/[id]/attachments` currently 404s on the storage upload step. **The UI should surface a clear "Storage not configured" error rather than silently failing.** Once Agent S creates the bucket with the 20MB / 50MB evidence MIME whitelist (per HANDOFF §4 #4 + §6), uploads work end-to-end and Story 5 passes Studio verification
- **Closing an observation that has no approved remediation plan**: the closure request still flows through, but a warning surface notes "No approved remediation plan on file — proceed only if remediation is documented elsewhere"
- **Source authority not in `sourceConfig`** (e.g. a custom framework added via `/settings`): the row card falls back to `lucide:help-circle` + slate icon + the raw source string as label, so the row still renders without breaking
- **Two users editing the same observation simultaneously**: last write wins (no optimistic locking on MVP); both users see each other's changes after a refetch

## Out of scope for this page

- **Bulk import of observations** from a spreadsheet (deferred per scope §1 — manual entry from day one)
- **Auto-classification of observation severity** from a SAMA letter (out of scope per concerns doc)
- **PDF export of the observation list** (lives on `/reports` → `observation-list` PDF template; this page exports CSV only)
- **Email notification** of leadership transfer / remediation approval / closure (in-app `notifications` row only on MVP; email needs SMTP integration — see HANDOFF §4 #4)
- **Per-comment threading / replies** (flat comment list only)
- **Approval workflow for the observation itself** (only the remediation plan and closure are reviewed; the observation record is created directly)
- **Cross-tenant sharing of remediation templates** (single-tenant MVP)
- **Per-item due dates on remediation plan items** (only the plan has a due date; items are just text + complete/incomplete)
- **Letter linkage on this page** — the `letter_observations` join exists in schema but is set from the letters page, not here

## Open questions

- Should closing an observation be reversible only within a window (e.g. 30 days)? Today's `reopen` endpoint accepts any closed observation indefinitely — confirm with compliance leads if this needs a guardrail
- When an assignee resigns (team member soft-deleted), who should the observation be reassigned to — the team lead, the creator, or stay-as-is until manually fixed?
- Is remediation evidence (at least one document on the approved plan) a hard requirement for closure approval, or should the reviewer be allowed to override?
- Should the framework filter chip in `/settings` hide non-pinned-framework observations by default, or surface them with a warning (mirror the open question on Circulars)?
- Should a `severity_change` from `critical` → anything else require a justification note (regulator hygiene)?
- Should the row card surface the leader's avatar OR the full assignees stack (today only the leader)? The current row design hides assignees behind the modal — confirm if BO wants both
- HANDOFF.md does not yet have a §11 (observation-fixes) section even though the task prompt references one — should the recent fixes (hydration on detail open, optimistic comment delete, hard-delete cascade per migration 043, observation source fallback for custom frameworks) be back-filled into HANDOFF as §11 so the next agent has the context?
