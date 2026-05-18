# Regulatory Updates — Rules (Circulars) — User Stories

**Route:** `/correspondence/regulatory-updates/rules`
**Primary roles:** compliance officer · compliance manager · business owner · org admin
**Domain entity:** `circulars` + nested `circular_articles` (with per-article `checklist`, `versions`, `timeline`) + `circular_workflow_steps` + `circular_timeline` + `circular_attachments` + `article_attachments`

## What this page is for

This is the heart of regulator-rule tracking. Every circular issued by SAMA / CMA / IA / ZATCA / Sharia Board is registered here with its reference, authority, issue date, affected departments, and source link. Each circular contains one or more **articles** (the specific obligations the regulator demands), each with their own implementation checklist, version history, and activity log. The page tracks every circular from issuance → workflow phases (CAP review → notify BO → CAP received → remediation) → completion. The list view must answer at a glance: *"what's outstanding, who owns it, when's the deadline, and where's the source document"* — **without opening any detail panel**.

## Primary user journeys

### Story 1 — Register a new circular (with all its surface data)

**As a** compliance officer who has just received SAMA circular 41100-12345
**I want to** register the circular with reference, authority, dates, **affected departments**, description, **source URL**, and (optionally) attach the PDF in one flow
**So that** every affected department sees it immediately on their dashboard with everything they need on the card itself.

**Acceptance criteria** (every one observable end-to-end):
- A "Register New Circular" button is visible on the page header (gated by `Manage Audit Findings`)
- Clicking it opens `RegisterCircularModal` in < 200ms
- Required fields are marked with red asterisks: title, authority (SAMA / CMA / IA / Sharia Board / etc.), issuance date, due date, CAP deadline
- **Affected Departments** is a multi-pick chip selector — picks render as removable chips below the field; each selection persists; minimum one required
- Optional fields: description, reference URL (auto-normalized to https), assignee, priority (critical/high/medium/low), framework tags
- An "Attach PDF" file picker accepts `.pdf` and stores it as a data URL into `circulars.pdf_url` (until storage buckets land)
- A "Missing required: …" hint surfaces below the form when any required field is empty (per commit `36b0acc`)
- Save is disabled until all required fields are filled
- After save, the modal closes, a success toast appears, and the new circular appears at the top of the list **with all its data visible on the row card** (see Story 2)
- The new circular gets a server-minted reference like `SAMA-CIR-2026-0006` (via `compute_next_circular_reference` RPC, migration 026)
- 10 default workflow steps are seeded automatically (migration 025); the first is set to `current`
- Hard-reload → circular still there, all fields including affected departments, description, reference URL, CAP deadline, PDF link still rendered identically
- An `audit_logs` row records the creation; a `circular_timeline` row reads "Circular created" with the actor's name

### Story 2 — Read the entire circular state from the row, without opening it

**As a** compliance officer scanning the list during the morning standup
**I want to** see every key fact on each circular card — reference, title, authority, priority, status, affected departments, business owner, due date, CAP submission deadline, "View Online" link, "PDF attached" badge, progress
**So that** I don't have to click into 20 modals to know which 3 need my attention today.

**Acceptance criteria**:
- Each `RegDocCard` for a circular displays, in this order (left → right or rtl-mirrored): reference badge, authority chip, priority chip, status chip, framework tags, title, description-preview (truncated)
- A row of department chips renders below the title for every affected department (truncated to 3 with `+N more` overflow)
- A "Business Owner" chip appears when `businessOwnerDepartment` is set; absent when not
- A "PDF attached" badge appears when `pdfUrl` is populated
- A "View Online" link icon-button appears when `referenceUrl` is populated, opens in a new tab with `rel="noopener noreferrer"`
- The CAP submission deadline appears as a date chip with relative-time tail (e.g. "in 8 days", "5 days overdue") — overdue gets a rose tint
- A progress bar shows the rolled-up completion percentage (checklist + workflow steps, computed server-side per migration 040 helper)
- All this data is on the **list response** (per `CIRCULAR_LIST_COLUMNS`); no `fetchById` is needed for the row to render fully
- Hard-reload → card renders identically before any modal opens; no flicker, no "Loading…" placeholders on the card itself

### Story 3 — Deep-link to a specific circular

**As a** business owner notified by email about a new circular
**I want to** click `/correspondence/regulatory-updates/rules?id=<circularId>` and land on that circular's detail
**So that** I can see exactly what's required.

**Acceptance criteria**:
- Visiting with `?id=<id>` auto-opens the detail panel for that circular
- Header data (title, status, priority, departments, BO, dates, description, URL, PDF link) renders **instantly** from list-row data
- Deferred sections (workflow steps, articles, activity timeline) show 3–5 `<Skeleton>` placeholders briefly, then real content
- Unknown id degrades to the list view (no crash)
- Removing the param returns to the unfiltered list

### Story 4 — Filter circulars by authority and department

**As a** compliance officer focused on SAMA-only work this week
**I want to** filter the list to SAMA + my department only
**So that** I see what I need without scrolling.

**Acceptance criteria**:
- Filter controls visible above the list: search by title/reference, authority selector, department selector
- The result count text reads "Showing X–Y of Z" using `paginate(filteredCirculars, currentPage, PAGE_SIZE=10)`
- Changing any filter resets `currentPage` to 1
- Pagination chevrons navigate through pages of filtered results
- The 4 StatCards (total / in-progress / completed / overdue) reflect the *unfiltered* counts

### Story 5 — Add articles to a circular (the obligations)

**As a** compliance officer registering SAMA circular section by section
**I want to** add one article per obligation, each with a checklist of evidence requirements, a responsible department, and an assignee
**So that** implementation is tracked per requirement, not just per circular.

**Acceptance criteria**:
- The detail panel's Articles section has an "Add Article" button (when in edit mode or with edit permission)
- The article modal has required fields: Article # (e.g. "1.2.3"), Responsible Department, Article Title
- Optional fields: description, risk level (critical/high/medium/low), compliance status (compliant / in-progress / non-compliant / not-started), assignee (UUID — picks from team store)
- A "Missing required: …" hint surfaces above Save when any required field is empty (per `ArticleDetailModal.tsx`)
- During article creation, a checklist sub-list lets the user add items inline before saving (local until save)
- After save the article appears in the Articles section with its risk + compliance chips, assignee badge, and a checkbox-style checklist count
- Hard-reload → all articles, their fields, and their checklist items persist; assignee resolved to a name
- Adding/toggling/deleting a checklist item after the article is saved POSTs/PATCHes/DELETEs through `/api/circulars/[id]/implementations/[articleId]/checklist[/itemId]` — UI updates instantly (optimistic), server confirms, progress recomputes server-side and updates the rollup bar
- An `article_timeline` row auto-emits for every meaningful change (e.g. "Checklist item completed: Confirm SOP coverage") — visible in the article's Activity tab
- An `article_version` row auto-emits when any article field changes (deep-compare via JSON.stringify in the PATCH route) — visible in the article's Versions tab

### Story 6 — Browse an article's version history and activity trail

**As a** compliance manager reviewing an article that's been edited 4 times
**I want to** see every version with what changed (from → to per field) and every activity entry on the article
**So that** I can verify the changes match what was approved.

**Acceptance criteria**:
- The article modal has tabs: Details, Versions, Activity
- The Versions tab lists every `article_versions` row newest-first, with version number, date (human-formatted via `formatTimelineDate`), author, and a "summary" or "changes" message
- Clicking a version row expands to show a 3-column diff: Field changed | From | To — for every field that changed in that version (rendered from `fieldChanges` JSON)
- Versions with `approved: true` show a green check icon
- The Activity tab lists every `article_timeline` row newest-first, with formatted date and the actor's name
- Each timeline row has a status dot (completed = emerald, active = blue, pending = slate)
- The full activity is RTL-aware (timeline rail flips for Arabic)
- Hard-reload → both tabs render the same content as before, in the same order

### Story 7 — View the circular's overall activity / history trail

**As an** auditor preparing an inspection
**I want to** see every event that happened to this circular — created, BO assigned, workflow step advanced, edits, attachments added, etc.
**So that** I have an end-to-end audit trail without scraping logs.

**Acceptance criteria**:
- The detail modal has tabs: Overview, Workflow, Activity
- The Activity tab lists every `circular_timeline` row newest-first, with formatted date and actor
- The trail includes: "Circular created", "PDF uploaded", "Business Owner assigned: X", "Edit submitted for approval", "Workflow advanced to phase Y", "Article added", and every state change
- A status dot indicates the kind of event (created = blue, completed = emerald, etc.)
- Workflow advances also write a row mentioning which step (e.g. "CAP Review completed by Hani")
- Hard-reload → trail order and content identical

### Story 8 — Upload / replace / remove the circular's PDF document

**As a** compliance officer registering a circular that came as a PDF attachment
**I want to** attach the PDF directly to the circular and have it sticky across reloads
**So that** anyone reading the circular has the source document one click away.

**Acceptance criteria**:
- The detail Overview has an "Upload Circular PDF" section
- The picker accepts `.pdf` and `.docx`
- After upload, a green panel shows "Circular PDF attached" with Download, Replace, and Remove icon buttons
- Clicking Download streams the file from `pdf_url` with the right filename (`<reference>.pdf`)
- The row card on the list view now shows a "PDF attached" badge
- Hard-reload → the panel still shows "Circular PDF attached"; Download still works; the badge still appears on the row
- Replacing the PDF emits a `circular_timeline` row "PDF replaced"; Remove emits "PDF removed"

### Story 9 — Add / edit the reference URL (source link)

**As a** business owner who got the circular link from SAMA's portal
**I want to** paste the source URL on the circular and have it appear as a clickable "View Online" link everywhere — on the list card AND in the detail Overview
**So that** anyone investigating can jump to the regulator's page immediately.

**Acceptance criteria**:
- The Edit Circular modal has a "Reference URL" field; pasting a bare domain auto-prepends `https://` on save (`normalizeUrl`)
- After save, the detail Overview shows a "View Online" button with an external-link icon; clicking opens in a new tab
- The **row card** on the list view also shows the "View Online" icon-button (Story 2 — no detail open needed)
- Hard-reload → both surfaces still show the link
- Clearing the URL field and saving removes the link from both surfaces

### Story 10 — Assign / change the business owner

**As a** compliance manager
**I want to** assign each circular a Business Owner Department from the dropdown, and change it later if the org reorgs
**So that** ownership is unambiguous and the right team gets notified.

**Acceptance criteria**:
- The detail Overview shows a "Business Owner" chip when set; an "Assign Business Owner" button when not
- Clicking opens `BusinessOwnerModal` with the department selector pre-filtered by departments seeded in `/settings`
- Save calls `PATCH /api/circulars/[id]` with `business_owner_department`; the chip appears on the detail AND on the row card immediately (optimistic UI)
- A `circular_timeline` row auto-emits: "Business Owner assigned: Compliance Department"
- Hard-reload → the chip is still on both surfaces
- Reassigning emits a "Business Owner changed: A → B" entry; both surfaces update

### Story 11 — Run the workflow: add a step, reorder, set per-step deadline, advance, edit notes, assign assignees

**As a** compliance officer driving CAP review through to completion
**I want to** see all 10 default workflow steps grouped by phase (Initial Review → CAP Approval → Remediation), **add custom steps where the process needs them**, **move any step to a different position**, **set a deadline per step**, advance steps one by one with notes, change an assignee, edit a step's note, and have **every change still be there after a hard reload**
**So that** the workflow reflects reality and notifies the right people.

**Acceptance criteria**:
- The Workflow tab renders all `circular_workflow_steps` rows, grouped by `phase` (0/1/2), ordered by `sort_order`
- The current step is highlighted; future steps are dimmed; completed steps show a check mark + completion date + actor
- Each step has inline-editable: label, notes (textarea, saves on blur), assignee (team-member dropdown), action type, **deadline (date picker)**
- **Add Step** button opens an inline form (or a small modal) with required fields: label, phase, action type. On save, the step appears at the end of its phase's list with `status='pending'` and `sort_order = max + 1`. Hard-reload → the new step is still there at the same position with the same fields
- **Move a step to another position**: drag-handles or up/down chevrons reorder steps; the new order PATCHes via `POST /api/circulars/[id]/workflow/steps/reorder` with the full updated `sort_order` map. Moving a step works **within and across phases**. Hard-reload → the new order survives
- **Per-step deadline**: each non-completed step exposes a date picker. Picking a date saves immediately via `PATCH /api/circulars/[id]/workflow/steps/[stepId]` with `{ deadline: 'YYYY-MM-DD' }`. The deadline renders as a chip below the step label (e.g. "Due Mar 14", or "5 days overdue" in rose if past). Clearing the date removes the chip. Hard-reload → the deadline is still on the step
- An "Advance" button on the current step opens `AdvanceWorkflowModal` to add a note; on confirm, the step flips to completed, the next step becomes current, **and the assignee of the new-current step receives an in-app `notifications` row** (per `notifyCircularStepAssignee`)
- Editing a step's assignee triggers a notification to the newly-assigned team member (unless self-assigned)
- **Delete Step** removes a non-default step (with a strong "this cannot be undone" confirm); the remaining steps' `sort_order` re-shuffles automatically
- Hard-reload → every step's label / notes / assignee / **deadline** / status / order persists exactly. Pull the rows directly from Supabase Studio (`circular_workflow_steps WHERE circular_id = ...`) to confirm
- Workflow advance also recomputes the rollup progress (server-side `recomputeCircularProgress`)
- Optimistic UI: every workflow mutation (add/reorder/edit/deadline/advance/delete) updates the UI instantly and rolls back visibly with an inline error on server failure

### Story 12 — Edit a circular (everything optimistic + persistent)

**As an** org admin who registered a circular with a typo or wrong department
**I want to** edit any field via the Edit modal and have it save instantly
**So that** the registry stays accurate.

**Acceptance criteria**:
- The detail Overview has an "Edit" button (gated by `Manage Audit Findings`)
- Edit opens `EditCircularModal` with all fields pre-filled including affected departments (each as a checked chip)
- Toggling a department chip immediately updates local state
- Save calls `PATCH /api/circulars/[id]`; modal closes; updates appear instantly on detail + row
- A `circular_timeline` row auto-emits "Circular updated" listing changed fields
- Hard-reload → every edited field persists on detail AND on row card
- Network failure → optimistic state visibly reverts; an inline error message renders

### Story 13 — Hard-delete a circular and its entire subtree

**As an** org admin who registered a duplicate circular by mistake
**I want to** permanently delete it
**So that** the registry doesn't have ghost rows.

**Acceptance criteria**:
- The detail Overview has a "Delete" button (gated by `Manage Audit Findings`, with `delete` permission)
- Clicking opens a `DeleteConfirmModal` with strong warning: "This will permanently delete the circular and all its articles, checklist items, workflow steps, and history. This cannot be undone."
- Confirming hits `DELETE /api/circulars/[id]`; the row disappears from the list instantly (optimistic remove)
- An `audit_logs` row records the deletion BEFORE the row is physically removed (so the audit trail survives)
- Hard-reload → row is gone from list, search, deep-link, and Supabase Studio (cascade via migration 040 wipes `circular_articles`, `article_checklist_items`, `article_versions`, `article_timeline`, `circular_workflow_steps`, `circular_timeline`, attachments — verified via MCP SQL)
- Failed delete → optimistic remove visibly reverts; the original row reappears with an inline error

### Story 14 — Export filtered circulars

**As an** auditor preparing an inspection brief
**I want to** export the currently filtered circular list
**So that** I can hand the inspector a snapshot of what's tracked.

**Acceptance criteria**:
- An export icon is visible in the page header
- Clicking it calls `exportRulesLocalized(filteredCirculars, 'rules', t, isRTL)` and triggers a localized download
- The export respects the current filters (authority / department / search) — only what's visible is exported
- The export language follows the current locale (en / ar)

## Edge cases the page should handle

- **Empty state**: fresh tenant shows 4 StatCards at zero + `NoResultsEmptyState` panel
- **Loading state**: skeleton rows while `useCircularStore.fetchAll()` resolves on first visit
- **Repeated visits**: `fetchAll` is TTL-guarded (30s); back-navigation skips the network and re-renders from store immediately
- **Pagination**: PAGE_SIZE = 10; "Showing X–Y of Z" surface visible (per `page.tsx:53`)
- **Mutation in flight**: Save / Edit / Delete / Advance buttons use `LoadingButton` — disabled with a spinner during requests; double-click is impossible
- **Network failure**: every optimistic mutation rolls back visibly and surfaces an inline error
- **RBAC**: officers + managers can register/edit; business owners can update workflow notes + advance; viewers read-only — buttons hidden when permission denied
- **RTL**: full RTL — root container has `rtl` class (per `page.tsx:109`); workflow timeline rail flips; chip order mirrors
- **Reference collisions**: minting `SAMA-CIR-2026-0006` etc. respects soft-deleted ghosts via `SECURITY DEFINER` RPC `compute_next_circular_reference` (migration 026)
- **Deep-link to a hard-deleted circular**: shows a "Not found" panel + a link back to the list

## Out of scope for this page

- Linking a circular to its source PDF on a regulator portal (manual entry of URL only; no scraping)
- Automatic parsing of circular text to extract obligations (out of scope per Technical-Concerns doc)
- Cross-tenant sharing of CAP templates (single-tenant MVP)
- Email notification of workflow assignee changes (in-app `notifications` row only; email needs storage + SMTP integration)
- PDF generation of the full circular report (lives on Reports)

## Open questions

- Should the framework-pin filter (in `/settings`) hide non-pinned-authority circulars by default, or surface them with a warning?
- CAP completion: should it auto-create observations for any overdue items, or just flag the implementation status?
- Is there a notion of "supersedes" between circulars (e.g. 2025 circular supersedes 2023 one), and is it modeled?
- Should the article-level `assignee` automatically inherit from the circular-level `assignedTo`, or be picked fresh per article?
- When a workflow step's assignee changes, should the old assignee get a "you've been unassigned" notification?
