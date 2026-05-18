# Regulatory Updates — Policies — User Stories

**Route:** `/correspondence/regulatory-updates/policies`
**Primary roles:** compliance officer · compliance manager · business owner · org admin
**Domain entity:** `policies` + `policy_versions` + `policy_workflow_steps` + `policy_activity_log` + `policy_attachments` + `policy_evidence` + `policy_review_cycles` (internal governance documents — AML, KYC, ICT, IT security, board governance, code of conduct)

## What this page is for

This is the home of every internal policy the institution maintains as the counterpart to a regulator's circular. Each policy carries its own category, approval tier (Board / Management / Sharia / AGM), current version, owner, **business-owner department**, **affected departments**, review cadence, attachment library, evidence per review cycle, and full per-step approval workflow. The page is the operating console for the policy lifecycle — draft → submit for review → step-by-step approval → publish (new `policy_versions` row) → review-cycle renewal → archive. Commit `774596b` opened up the closed enums on `policies.category` and `approval_tier`, so categories are now editable in-place; commit `36b0acc` shipped the missing-field hint pattern that this page mirrors from the Circulars side; migration `041_policy_hard_delete_cascade` flipped delete from soft to hard with cascade on all 6 child tables. The list view must answer at a glance: *"which policies need action this week, who owns each, when is the next review, and is the latest version current"* — **without opening any detail panel**.

## Primary user journeys

### Story 1 — Register a new policy (with all its surface data + optional template)

**As a** compliance officer drafting a new AML policy
**I want to** register the policy in one flow with name, description, category, approval tier, owner, **business-owner department**, **affected departments**, review schedule, framework tags, and (optionally) attach the document PDF — picking a template if one matches
**So that** every affected department sees the new policy immediately on its dashboard with everything they need to act, and the approval workflow seeds itself for the chosen tier.

**Acceptance criteria** (every one observable end-to-end):
- A "Create Policy" button is visible on the page header (gated by `Approve Policy Reviews` via `<Gate perm="Approve Policy Reviews">`)
- Clicking opens the create-policy modal in < 200ms
- Required fields are marked with red asterisks: Policy Name, Category, Approval Tier, Description (file upload is optional at create-time and can be attached later from the detail view, per `handleCreate` in `page.tsx`)
- The Category selector is an `EditableSelect` bound to `usePolicyCategoryStore` — users can add/rename/delete categories inline; the new value is immediately available in the dropdown
- Approval Tier is a locked `EditableSelect` with exactly four choices: Board / Management / Sharia / AGM
- **Affected Departments** renders as a scrollable multi-checkbox list bound to `useDepartmentStore`; toggling persists each pick locally
- **Business Owner Department** is a separate single-select `EditableSelect` bound to the same department store — decoupled from the team-member owner picker (per round-3 §4)
- An optional Policy Template picker pre-fills name, description, category, and approval tier when chosen; on save the picked template's `usage` count increments via `incrementPolicyTemplateUsage`
- A "Missing required: Policy Name, Category, …" hint surfaces below the form whenever any required field is empty (per commit `36b0acc`); Save is disabled until `createFormValid` is true
- Save calls `POST /api/policies` with the snake-cased payload (`ref_code: 'POL-PENDING-<ts>'` overridden to a server-minted `POL-NNN` via `getNextId`); the modal closes, a success toast appears, and the new policy appears at the **top of the list** at `version = 'v1.0'` with status `draft`
- The chosen tier seeds the workflow timeline from `TIER_WORKFLOWS[tier]` (e.g. Management = Department Review → Compliance Review → Management Approval); a "Draft Created" completed step is prepended; the first tier step is set to `current`
- Hard-reload → the policy is still in the list with reference id, name, category, approval tier, description, owner, business-owner department, affected departments, and review schedule rendered identically
- An `audit_logs` row records `policy.create`; a `policy_activity_log` row reads "Policy created: …" with the actor's name (per `writePolicyActivity` in the POST handler)
- Querying `policies` in Supabase Studio for the new row confirms `category`, `approval_tier`, `business_owner_department_id`, `affected_departments` (array) and `framework_ids` (array) match what was entered

### Story 2 — Read the entire policy state from the row, without opening it

**As a** compliance officer scanning the list during the morning standup
**I want to** see every key fact on each policy card — reference id, name, status badge, approval-tier chip, version chip, owner avatar + name + department, business-owner-department label, next-review date with overdue tint, description preview, framework chips, and affected-departments chips
**So that** I don't have to click into 20 modals to know which policies are overdue, which are mid-review, and which I own.

**Acceptance criteria**:
- Each `RegDocCard variant="policy"` renders, in this order (left → right, RTL-mirrored): category icon block, policy name, status chip (Draft / Under Review / Approved / Expired / Overdue / Requires Review), reference id (monospace), approval-tier chip, version chip
- A description preview (truncated to one line) renders below the name when `policy.description` is non-empty
- A row of **framework chips** appears under the description for every `frameworkIds[]` entry (resolved via `useFrameworkConfigStore`); empty array → no chips
- A row of **affected-department chips** renders under the framework row for every `affectedDepartments[]` entry (truncated to 3 with `+N more` overflow) — resolves IDs to localized labels via `useDepartmentStore`
- An **approval-tier badge** appears at the right of the card with the tier-specific color (board=violet, management=blue, sharia=emerald, agm=amber)
- A **business-owner-department** chip appears (replacing the owner's department line) whenever `businessOwnerDepartmentId` is set — per `policyBusinessOwnerLabel`
- The **next-review date** renders with an urgency tint: `expired` → rose, `warning` (≤ 90 days) → amber, else slate; an "Overdue" chip with the count from `overdueCount` appears when `overdueCount > 0`
- All this data is present on the list response (`POLICY_LIST_COLUMNS` via `GET /api/policies`); no `fetchById` is needed for the row to render fully
- Hard-reload → the card renders identically before any modal opens; no flicker, no "Loading…" placeholder on the card itself
- Supabase Studio `select * from policies` for the same row → status, version, approval_tier, business_owner_department_id, affected_departments, next_review_date, framework_ids all match what the card shows

### Story 3 — Deep-link to a specific policy + tab

**As a** compliance manager who got a Slack link to a specific policy's workflow tab
**I want to** click `/correspondence/regulatory-updates/policies?policyId=<id>&tab=workflow` and land directly on that tab inside the policy detail
**So that** I can act without navigating.

**Acceptance criteria**:
- Visiting with `?policyId=<id>` auto-opens the policy detail panel for the matching row
- Header data (name, status chip, tier chip, version chip, description, leader avatar, business-owner-department, review schedule) renders **instantly** from list-row data
- `?tab=overview | workflow | activity` selects the initial tab (per `deepLinkTab` state in `page.tsx`); unknown tab → `overview`
- Deferred sections (workflow steps, versions, activity, attachments, evidence) show stale-data first then resolve via `fetchById` reconciliation without flicker
- Unknown `policyId` degrades to the unfiltered list view (no crash, no toast)
- Removing the params (close modal) returns to the unfiltered list and clears `deepLinkTab`
- Hard-reload on the deep-link URL → still lands on the same policy + tab

### Story 4 — Filter + search policies

**As a** compliance officer focused on AML policies under review this week
**I want to** filter the list by category and status and search by name / description
**So that** I see only what I need without scrolling.

**Acceptance criteria**:
- The `RegDocFilterBar variant="policy"` exposes: search input (name + description), Category selector, Status selector, plus a "View Registry" jump-link on the right
- The filtered count text reads "X policies found" using `filteredPolicies.length`
- Pagination uses `paginate(filteredPolicies, currentPage, PAGE_SIZE=10)`; "Showing X–Y of Z" surface visible below the list
- Changing any filter resets `currentPage` to 1 (via the `useEffect` watching all three filter inputs)
- The 5 StatCards (total / approved / under-review / draft / expired) reflect the **unfiltered** counts
- Sort order is `nextReviewDate` ascending (`nullsFirst: false` server-side, then localeCompare client-side) so overdue / soonest review surfaces first
- Hard-reload after applying filters → filters reset to defaults (no URL persistence today — note in open questions)

### Story 5 — Publish a new policy version + browse version history

**As a** compliance manager who has just approved a substantive update to the AML policy
**I want to** publish a new version (e.g. v1.0 → v2.0) so the row's `version` chip increments AND a new `policy_versions` row is auto-emitted with author + date + changes summary, and I can browse every prior version in the detail panel
**So that** every prior version stays readable for audit and we have a defensible record of what changed.

**Acceptance criteria**:
- Editing a policy (Story 9) computes a `changes` string by deep-comparing every editable field (e.g. `"Name: \"X\" → \"Y\"; Category: aml → kyc; Version: v1.0 → v2.0"`) and pushes a `PolicyVersionEntry` to `versionHistory[]`
- The Activity tab's **Version History** section lists every entry, newest first, with version chip, formatted date, author, and the changes summary
- Clicking a version row expands a 3-column row showing Version | Last Review | By
- The detail header version chip always shows the current `policies.version`; bumping it via `POST /api/policies/[id]/versions` (`PublishPolicyVersionSchema`) writes a new `policy_versions` row AND bumps `policies.version` in the same handler
- A `policy_activity_log` entry of type `version_published` auto-emits with text "Version v2.0 published" and the changes string as a note (per the route handler)
- Hard-reload → the version chip on row AND detail shows the new version; the Version History section still lists every prior entry in the same order
- Supabase Studio `select version, date, author, changes from policy_versions where policy_id = …` confirms one row per published version, newest `date` matches the current `policies.version`

### Story 6 — Run the policy approval workflow: submit → step-by-step approve → publish

**As a** compliance officer driving an AML policy through Management-tier approval
**I want to** submit my draft for review, watch each approver act on their step (with optional notes), add/rename/reorder/set deadlines on steps when reality demands it, and have the policy auto-flip to `approved` when the last step completes — with **the assignee of the new-current step receiving an in-app notification** at every advance
**So that** the workflow reflects how approval actually unfolds and the right people are pinged.

**Acceptance criteria**:
- The Workflow tab renders every `policy_workflow_steps` row ordered by `sort_order`; the first non-completed step is `current` (amber border), prior steps are completed (emerald check + date + actor), future steps are pending (slate)
- A "Submit for Review" button on the current step opens a note prompt (`AdvanceWorkflowModal` equivalent); confirming hits `POST /api/policies/[id]/workflow/advance` with `{ action: 'submit-for-review', note }` → `policies.status` flips to `under-review`, current step's `step_state` becomes `pending-approval`, a `submitted_for_review` activity log row auto-emits
- An "Approve" button on the current step (gated by `Approve Policy Reviews`) opens the same note prompt; confirming POSTs `{ action: 'approve', step_id, note }` — server marks that step `completed`, promotes the next pending step by `sort_order` to `current`, sends `notifyPolicyStepAssignee` to the newly-promoted step's `assigned_to`, writes a `policy_activity_log` row
- When the last step completes, `policies.status` flips to `approved`, `approved_date = today`, and a `workflow_approved` activity row reads "Policy approved — all steps completed"
- An "Add Workflow Step" inline form (locked `EditableSelect` for `action_type` = move-to-next / send-email / notify-manager / request-approval / send-for-review) appends a new step at the end of the timeline; if the policy was already `approved`, the status reverts to `under-review` and the new step becomes `current`
- **Inline rename**: clicking the pencil on a non-completed step's label opens an inline input; blur/Enter PATCHes `/api/policies/[id]/workflow/steps/[stepId]` with `{ step: '<new>' }`; the route auto-emits a `step_renamed` activity row "Workflow step renamed from \"X\" to \"Y\""
- **Per-step deadline**: each non-completed step exposes an `InlineDeadlinePicker`; picking a date POSTs `/api/policies/[id]/workflow/set-phase-deadline` with `{ step_id, deadline: 'YYYY-MM-DD' }`; the deadline must be ≤ `policies.next_review_date` (validated via `validateChildDeadline`); failure surfaces a "Deadline rejected" toast; success writes a `phase_deadline_set` / `phase_deadline_changed` activity row
- **Reorder by drag**: dragging a step over another reorders the local timeline (completed steps are not draggable and can't be drop targets); after drop the `stepState` is cleared on non-completed steps; the new `sort_order` is persisted via the underlying `update()` call
- An "Undo last step" action POSTs `{ action: 'undo' }` → flips `policies.status` back to `draft` or `under-review` depending on remaining state; writes a `workflow_undone` activity row
- Hard-reload → every step's label / status / deadline / order / note / actor persists exactly. Querying `policy_workflow_steps WHERE policy_id = …` in Supabase Studio returns the same rows in the same `sort_order`
- Optimistic UI: every workflow mutation updates the panel instantly and visibly rolls back on server failure (via the store's rollback-on-error in `update()`)

### Story 7 — Upload / list / download / remove policy attachments

**As a** compliance officer attaching the supporting evidence pack for a policy
**I want to** drop multiple files (PDF, DOC, DOCX, XLSX, PPTX) onto the policy detail, see them listed with size + uploader + timestamp, download any back later, and remove individual files — **and have every file sticky across reloads**
**So that** the document library lives with the policy, not in someone's inbox.

**Acceptance criteria**:
- The Overview tab's "Upload Document" section shows an emerald "+ Upload Document" CTA + the existing attachments list
- Picker accepts multi-file `.pdf,.doc,.docx,.xlsx,.pptx`; each picked file is read as a data URL (storage bucket pending — HANDOFF §6 known gap), then registered via `POST /api/policies/[id]/attachments` with `{ name, storage_path, size }`
- Each new attachment appears in the list with file-check icon, name, formatted size (`formatBytes`), and uploader name in emerald-on-emerald styling
- Per attachment: a Download icon-button streams the file (`<a download={name}>` against `dataUrl`); a Remove icon-button hits `DELETE /api/policies/[id]/attachments/[attachmentId]` and immediately drops the row from the list
- Each upload auto-emits a `policy_activity_log` row with `type: 'attachment_added'` and text "Attachment \"<name>\" added"; each remove auto-emits `attachment_removed`
- Legacy single `attachmentUrl` (string) still renders as a "legacy" badge row at the top when `attachments[]` is empty — backward-compat per Phase-5 server-state migration
- Hard-reload → all attachments still listed in the same order (newest first per `uploaded_at desc` server-side); Download still works; Remove still works
- Supabase Studio `select name, size, uploaded_by, uploaded_at from policy_attachments where policy_id = …` confirms every row

### Story 8 — Manage evidence per review cycle

**As a** compliance officer collecting evidence for the current AML review cycle
**I want to** upload evidence tagged to the active review cycle, filter by cycle (current vs prior), and remove obsolete entries — with each cycle's evidence kept distinct
**So that** when the next inspection asks "what evidence supported the v2 approval", I can produce the bundle for that specific cycle.

**Acceptance criteria**:
- The detail exposes an Evidence section (Overview or a dedicated row) with a "Current Review" filter chip + per-prior-cycle chips derived from `reviewCycleHistory[]` + the current `currentReviewCycleId / Label / Date`
- Uploading evidence tags each file with the current cycle id + label; pushed to `evidence[]` with `uploadedAt`, `uploadedBy`, `reviewCycleId`, `reviewCycleLabel`
- Each upload auto-emits a `policy_activity_log` entry of type `evidence_uploaded` ("Evidence \"X\" uploaded for cycle \"Review Mar 2026\"")
- Remove writes an `evidence_removed` activity entry
- Switching the filter chip filters the evidence list client-side (`displayedEvidence`)
- Hard-reload → every evidence item still listed; per-cycle filter still works
- Initiating a new review cycle (Story 11) moves the prior `currentReviewCycleId` into `reviewCycleHistory[]` and creates a fresh cycle id + label — evidence uploaded after the switch is tagged to the new cycle

### Story 9 — Edit a policy (every field optimistic + persistent)

**As an** org admin who registered a policy with a typo / wrong category / wrong owner
**I want to** edit any field via the Edit modal and have it save instantly, with a version-history entry capturing the diff, and an activity row auto-emitted
**So that** the registry stays accurate and the change is traceable.

**Acceptance criteria**:
- A "Edit" button is visible on the detail (gated; opens `EditModal`)
- The modal pre-fills every field including affected-departments checkboxes + business-owner department + review schedule
- Toggling any affected-department checkbox immediately updates local state
- Save calls `PATCH /api/policies/[id]` with `UpdatePolicySchema`-validated payload; modal closes; updates appear instantly on detail panel AND row card (optimistic via the store's `update()`)
- Save also pushes a `PolicyVersionEntry` to `versionHistory[]` with a diff string ("Name: \"A\" → \"B\"; Owner: X → Y") AND a `PolicyActivityEntry` of type `edited`
- The server-side PATCH route auto-emits a `policy_activity_log` row of type `updated` listing the changed fields ("Updated fields: name, category, review_schedule")
- Hard-reload → every edited field persists on detail AND row card; `policies.updated_at` advances; the new version-history entry is visible in the Activity tab's Version History section
- Network failure → the optimistic patch visibly reverts to the previous server-known state; an inline error message renders (per `errorMessage` rollback in `update`)

### Story 10 — Hard-delete a policy and its entire subtree

**As an** org admin who registered a duplicate policy by mistake
**I want to** permanently delete it
**So that** the registry doesn't carry ghost rows.

**Acceptance criteria**:
- A "Delete" button is visible on the detail (gated by `delete` permission per the route's `requirePerm('delete')`)
- Clicking opens `DeletePolicyModal` with a strong warning ("This will permanently delete the policy and all its versions, workflow steps, attachments, evidence, review cycles, and activity. This cannot be undone.")
- Confirming hits `DELETE /api/policies/[id]`; the row disappears from the list instantly (optimistic remove via the store)
- An `audit_logs` row records `policy.delete` BEFORE the row is physically removed (so the audit trail survives — `target_id`/`entity_id` are polymorphic text/uuid pointers, not FKs, per HANDOFF §5 gotcha #7)
- Hard-reload → row is gone from list, search, deep-link, and Supabase Studio
- Supabase Studio after the delete: `select count(*) from policy_versions where policy_id = '<uuid>'` returns 0; same for `policy_workflow_steps`, `policy_attachments`, `policy_evidence`, `policy_activity_log`, `policy_review_cycles` — all 6 cascade per migration `041_policy_hard_delete_cascade`
- Failed delete → the optimistic remove visibly reverts; the original row reappears with an inline error message

### Story 11 — Initiate a new review cycle (renewal flow)

**As a** compliance manager whose policy is approaching its next-review date
**I want to** initiate a new review cycle so the workflow resets to draft, the prior cycle's evidence gets archived into history, and `next_review_date` slides forward by the configured cadence
**So that** the policy goes through fresh approval before the deadline.

**Acceptance criteria**:
- An "Initiate Review" action on the detail (under workflow controls) opens a note prompt
- Confirming calls `usePolicyStore.initiateReview(id)` which: appends the current cycle entry into `reviewCycleHistory[]`, mints a new `currentReviewCycleId / Label / Date`, marks the previous current step `completed`, appends a fresh `"Review Initiated"` step set to `current`, flips status to `draft`, and recomputes `next_review_date` from the saved `reviewSchedule`
- A `policy_activity_log` row of type `review_initiated` auto-emits with text "Review cycle initiated" and the user's note
- Banner alerts ≤ 90 days before `next_review_date` surface in the page header (`reviewAlerts` filter), prompting initiation
- Hard-reload → new cycle id/label/date is sticky; old evidence is filterable under the prior cycle chip; new evidence uploaded after initiation is tagged to the new cycle
- Recomputed `next_review_date` matches `computeNextReview(reviewSchedule)` (cadence: weekly / monthly / quarterly / yearly etc.)

### Story 12 — Archive / unarchive a retired policy

**As an** org admin retiring a superseded policy
**I want to** archive the policy without deleting its history, and restore it later if needed
**So that** auditors can still see what was in force at the time of an earlier inspection.

**Acceptance criteria**:
- The detail panel exposes an "Archive" action when status is `approved`; an "Unarchive" action when status is `expired`
- Archiving calls `update(id, { status: 'expired', activityLog: [...prev, { type: 'edited', textEn: 'Policy archived', user: actingUser }] })`; row's status chip flips to "Expired"
- Unarchiving sets status back to `approved` and pushes a "Policy unarchived" activity entry
- Archived policies still appear in the list (status filter = expired) AND remain reachable via deep-link
- Hard-reload after archive → status persists; activity entry persists
- Supabase Studio: `select status from policies where id = '<uuid>'` returns `'expired'`

### Story 13 — Read the full activity timeline

**As an** auditor preparing an inspection
**I want to** see every event that happened to this policy — created, edits, submission, step approvals, version publishes, attachment uploads/removals, evidence uploads/removals, archive/unarchive, deadline changes, step renames, review-cycle initiations
**So that** I have an end-to-end audit trail without scraping logs.

**Acceptance criteria**:
- The Activity tab renders every `policy_activity_log` row newest-first (sorted by `timestamp` descending — both server-side via `GET /api/policies/[id]/activity` and client-side via the in-memory `activityLog[].sort`)
- Each entry shows the localized text (`textEn` or `textAr` per current locale), formatted date, actor name, and optional note in a slate panel
- A status dot indicates the kind of event: emerald for `workflow_approved`, rose for any "removed" / `step_reverted` / `step_denied`, slate otherwise
- Server-emitted entries (from POST/PATCH/DELETE routes) and client-emitted entries (from `update()` calls in `PolicyDetailsContent`) appear in the same feed
- The trail includes (non-exhaustive): "Policy created: X", "Updated fields: …", "Workflow step renamed from \"A\" to \"B\"", "Phase deadline set to YYYY-MM-DD", "Policy submitted for review", "Policy approved", "Version v2.0 published", "Attachment \"…\" added", "Evidence \"…\" uploaded for cycle \"…\"", "Policy archived", "Review cycle initiated"
- Hard-reload → identical trail order and content; querying `policy_activity_log WHERE policy_id = …` in Supabase Studio confirms every row including timestamps and user names
- The trail is RTL-aware (timeline rail flips for Arabic)

### Story 14 — Export filtered policies

**As an** auditor preparing an inspection brief
**I want to** export the currently filtered policy list (locale-aware)
**So that** I can hand the inspector a snapshot of what's tracked.

**Acceptance criteria**:
- A download-cloud icon-button is visible in the page header
- Clicking it calls `exportPoliciesLocalized(filteredPolicies, 'policies', t, isRTL, resolveDept)` and triggers a localized download
- The export respects the current filters (search / category / status) — only what's visible is exported
- The export language follows the current locale (en / ar); department ids are resolved to their localized names via the `resolveDept` closure
- The exported sheet/file includes id, name, category, status, approval tier, version, owner, business-owner department, affected departments, next-review date, framework tags
- A download appears in the browser within ~1s

## Edge cases the page should handle

- **Empty state**: a fresh tenant shows 5 StatCards at zero + `NoResultsEmptyState` panel with "Clear filters" CTA when filters yielded nothing
- **Loading state**: skeleton card grid (`CardSkeleton count={4}`) while `usePolicyStore.fetchAll()` resolves on first visit (detected via `isLoading && policies.length === 0 && lastFetched === null`)
- **Repeated visits**: `fetchAll` is TTL-guarded (30s — `Date.now() - lastFetched < 30_000`); back-navigation skips the network and re-renders from the store immediately
- **Pagination**: PAGE_SIZE = 10; "Showing X–Y of Z" surface visible; pagination chevrons and numbered page buttons render only when `totalPages > 1`
- **Mutation in flight**: Save / Edit / Delete / Submit / Approve / Initiate-Review / Archive buttons disable during requests; double-click is impossible (per `LoadingButton`-equivalent disabled state on `isMutating`)
- **Network failure**: every optimistic mutation (`create` / `update` / `delete`) rolls back to the previous server-known state and surfaces an inline error via the store's `error` field
- **RBAC**: `Approve Policy Reviews` gates create, submit-for-review, approve, initiate-review; `edit` permission gates update + attachments + step rename + deadline; `delete` gates hard-delete; viewers see read-only — buttons hidden when permission denied
- **RTL**: full RTL — root container has `rtl` class; workflow timeline rail flips; chip order mirrors; Arabic policy names + descriptions render right-to-left; activity entries pick `textAr`
- **Review-due banner**: when `reviewAlerts()` returns any policies (≤ 90 days to next review OR `status === 'expired'`), an amber banner surfaces above the StatCards
- **Status auto-update on mount**: `checkAndUpdateStatuses()` runs on page mount, flipping `approved` → `requires-review` when `nextReviewDate ≤ 90d`, and `requires-review`/`approved` → `overdue` when `nextReviewDate < today`; the overdue counter increments only once per `lastOverdueDate` snapshot to avoid double-counts
- **Deep-link to a hard-deleted policy**: list/detail returns 404; the modal degrades to a closed state (no crash); the URL param remains until cleared
- **Closed-enum legacy**: per commit `774596b`, `policies.category` and `policies.approval_tier` are open-text in the DB — old hard-coded enum values still display correctly via the labels map; new custom categories render their raw string

## Out of scope for this page

- Email/SMS notification of step assignees — only in-app `notifications` rows via `notifyPolicyStepAssignee` (storage + SMTP integration is a separate phase)
- File rendering / preview engine — the policy PDF is downloaded only, not previewed in-browser (PDF service is a separate module)
- Cross-policy linkage ("this AML policy references KYC policy v3") — currently free-text in description; no relational link
- E-signature on approval — deferred (see letters page open question)
- Storage-bucket-backed uploads — all attachments currently persist as data URLs (HANDOFF §6 known gap: `policy_attachments` and `policy_evidence` buckets not yet provisioned with RLS + MIME whitelist + size cap)
- Automatic policy text-extraction or template synthesis from a PDF (out of scope; templates are authored in `/settings`)
- Bulk operations (multi-select archive / multi-delete / multi-edit) — single-row only
- URL persistence of filters / pagination — filters reset on hard-reload (see open questions)
- Policy reference auto-mint via a server RPC like the Circulars `compute_next_circular_reference` — policy ids are minted client-side via `getNextId()` (`POL-NNN`) which is collision-prone in multi-user concurrent inserts (see open questions)

## Open questions

- Should "Publish version" be its own explicit button on the detail (POSTing `/versions` directly with a curated changes message), or stay implicit through the Edit + Approve flow (per W3 walk B7)?
- Should `policies.id` minting move to a `compute_next_policy_reference` SECURITY DEFINER RPC (mirroring circulars migration 026) to avoid concurrent-insert collisions?
- When a category is renamed via the inline `EditableSelect`, do existing policies surface the new name automatically, or should they pin to the historical label they were created under (audit-immutability vs UX clarity)?
- Should archived (`expired`) policies appear in the framework compliance-score calculation, or be excluded?
- When a workflow step's assignee changes, should the previous assignee receive a "you've been unassigned" notification? (Today only the new assignee is notified.)
- Should the `affected_departments` array drive sidebar / dashboard surfaces for those departments' members (e.g. "Policies affecting your department" widget), or is it metadata only?
- Per-step `assigned_to`: the schema supports `policy_workflow_steps.assigned_to` (a team-member UUID), but the create/edit UI doesn't yet expose an assignee picker — should it surface alongside the inline rename + deadline pickers?
- Should `framework_ids` be filterable from the list page (alongside category / status), or stay detail-only?
- Should hard-delete require typing the policy name to confirm (like a GitHub repo delete), given the cascade wipes 6 child tables?
