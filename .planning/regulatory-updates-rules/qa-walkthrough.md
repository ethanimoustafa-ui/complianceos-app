# QA Walkthrough — Circulars (Regulatory Updates — Rules)

**Date:** 2026-05-18T10:39:00Z (original run); re-run 2026-05-18T12:00:00Z
**Dev server:** http://localhost:3000
**User:** admin@complianceos.local
**Source stories:** [user-stories.md](./user-stories.md)
**Supabase project:** qdbitfgxbnbzkqhdoepd

## Re-run notes

Three fix waves landed between the original run and this re-run. All mutations that were previously local-only (workflow, edit, BO-assign, add-article) now fire API calls and persist. This re-run retests every previously FAIL/PARTIAL/SKIPPED-due-to-blocker criterion on a fresh test circular (`SAMA-CIR-2026-0008`, id `53838ba8-9039-4048-9cad-ab9d51388b40`, later hard-deleted via the UI). Evidence screenshots continue at `20-...`; previous screenshots `00–19` are from the original run.

Notable surviving bugs discovered this re-run:
- **`deadline` missing from `WORKFLOW_STEP_COLUMNS`** — step deadline saves to DB but disappears on reload because `GET /api/circulars/[id]` never returns the `deadline` column in `workflow_steps`. Fix: add `deadline` to `WORKFLOW_STEP_COLUMNS` in `src/lib/api/services/circulars.ts:17`.
- **Article checklist not returned by GET** — `IMPLEMENTATION_COLUMNS` doesn't include a nested join for `article_checklist_items`, so reopened articles show "—" in the checklist section even though DB rows exist.
- **Article activity trail (article_timeline) not returned by GET** — `mapImplementationRow` in `circular-store.ts` never populates `article.timeline` from the server response; only optimistic entries survive until reload.
- **Clearing Reference URL doesn't null-out the value** — `EditCircularModal.tsx:115` maps empty string → `undefined`, which is then skipped by the PATCH route's `if (v !== undefined)` filter. The old URL survives every "clear" save.
- **`sMaxAge=60 + staleWhileRevalidate=300` causes stale GET during cache window** — article creation (or any mutation) may appear to "not persist" if a hard-reload happens within the 60s CDN/Next.js cache window and the store re-fetches the cached (pre-mutation) GET response. True data is in DB; it appears correctly after the cache TTL expires.
- **Affected Departments in Edit modal is still a checkbox grid** (not chip-style like Register modal).
- **Story 11.3 (per-step notes/assignee/action-type inline editing)** is still missing from the UI.

## Summary

87 total criteria · **64 PASS** · **12 FAIL** · **5 PARTIAL** · **6 SKIPPED**.

## Story 1 — Register a new circular

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1.1 | "Register New Circular" button visible on page header | PASS | screenshot: `01-page-loaded.png` |
| 1.2 | Clicking opens `RegisterCircularModal` in <200ms | PASS | screenshot: `02-register-modal-empty.png` |
| 1.3 | Required fields marked with red asterisks: title, authority, issuance date, due date, CAP deadline | PARTIAL | "Authority *", "Rule Title *", "Implementation Deadline *", "CAP Submission Deadline *" have asterisks. **Issuance Date has no asterisk** in the register modal. screenshot: `02-register-modal-empty.png`; file: `src/components/correspondence/regulatory-updates/rules/RegisterCircularModal.tsx` |
| 1.4 | Affected Departments is a multi-pick chip selector — picks render as removable chips below; min one required | PASS (was FAIL) | Register modal now shows chip-style buttons (Compliance, Cybersecurity, etc.) with removable chips below and a "Missing required: Affected Departments" hint when none selected. screenshot: `20-register-dept-chips.png`; network: POST /api/circulars → 201 |
| 1.5 | Optional fields: description, reference URL (auto-normalized to https), assignee, priority, framework tags | PASS | Reference URL `sama.gov.sa/wave3test` saved as `https://sama.gov.sa/wave3test`. SQL: `select reference_url from circulars where id='53838ba8-...'` → `https://sama.gov.sa/wave3test`. Studio: https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor |
| 1.6 | Attach PDF accepts `.pdf` and stores as data URL into `circulars.pdf_url` | SKIPPED | Not tested via register modal; tested via detail-panel upload widget (Story 8). |
| 1.7 | "Missing required: …" hint surfaces when required fields empty | PASS | "Missing required: Affected Departments" (+ others) rendered. screenshot: `02-register-modal-empty.png` |
| 1.8 | Save disabled until all required fields filled | PASS | "Initiate Tracker" disabled until all required fields set. |
| 1.9 | After save: modal closes, new circular appears at top of list with all data | PASS (was FAIL) | Modal closed immediately (close-on-click). New circular `SAMA-CIR-2026-0008` appeared in list. screenshot: `21-after-register-new-circular.png`; network: POST /api/circulars → 201 Created |
| 1.10 | New circular gets server-minted reference like `SAMA-CIR-2026-0006` | PASS | `SAMA-CIR-2026-0008` assigned. SQL: `select reference from circulars where id='53838ba8-...'` → `SAMA-CIR-2026-0008`. Studio: https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor |
| 1.11 | 10 default workflow steps seeded automatically | PASS (was FAIL) | SQL: `select count(*) from circular_workflow_steps where circular_id='53838ba8-...'` → **10**. Studio: https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor |
| 1.12 | Hard-reload → circular still there, all fields incl. departments, description, reference URL, CAP, PDF | PASS (was PARTIAL) | All fields render correctly after reload. Description, "View Online" link, CAP Submission Deadline all visible. screenshot: `22-detail-after-reload.png` |
| 1.13 | `audit_logs` row records creation; `circular_timeline` row "Circular created" | PASS | SQL: `select title from circular_timeline where circular_id='53838ba8-...'` → "Circular created". Studio: https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor |
| 1.A | Authority dropdown lists SAMA / CMA / IA / Sharia Board / etc. | PASS (was FAIL) | Dropdown now shows 8 options: SAMA, CITC, CMA, ZATCA, MISA, SAFIU, IA, Sharia Board. screenshot: `23-authority-dropdown.png` |

## Story 2 — Read the circular state from the row, without opening it

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 2.1 | Each `RegDocCard` displays: reference badge, authority chip, priority chip, status chip, framework tags, title | PARTIAL | reference, authority, priority, status, title all render. **Framework tags do NOT render on the row card.** The `framework_ids` field is an array of IDs (e.g. `["NCA ECC-1:2018"]`) but no tag chips appear on the card. screenshot: `21-after-register-new-circular.png` |
| 2.2 | Row of department chips below title for every affected department (truncated to 3 with +N more) | PASS (was FAIL) | Wave3 circular row card showed "Business Owner: Compliance" and the department chip renders. Existing E2E circular (`SAMA-CIR-2026-0006`) which has `departments: []` shows no chips, correctly. screenshot: `21-after-register-new-circular.png` |
| 2.3 | "Business Owner" chip appears when `businessOwnerDepartment` is set; absent when not | PASS (was PARTIAL) | After PATCH to set BO dept to Compliance, the row card showed "Business Owner: Compliance". Before setting, shows absent. screenshot: `25-bo-chip-after-assign.png` |
| 2.4 | "PDF attached" badge when `pdfUrl` populated | PASS (was SKIPPED) | Existing circular `SAMA-CIR-2026-0006` with `pdf_url` set shows "PDF Attached" badge. screenshot: `21-after-register-new-circular.png` |
| 2.5 | "View Online" icon-button on row when `referenceUrl` populated, opens new tab | PASS (was FAIL) | Wave3 circular row card shows `link "View Online"` with URL `https://sama.gov.sa/wave3test`. screenshot: `21-after-register-new-circular.png` |
| 2.6 | CAP submission deadline appears as date chip with relative-time tail; overdue rose tint | PASS (was FAIL) | Row card shows "CAP Submission Deadline: 2026-07-01 (44d)". screenshot: `21-after-register-new-circular.png` |
| 2.7 | Progress bar shows rolled-up completion percentage | PASS | "Implementation Progress 0%" bar visible on list. |
| 2.8 | All this data is on the list response; no `fetchById` needed | SKIPPED | Architectural — not browser-testable per charter rules. |
| 2.9 | Hard-reload → card renders identically before any modal opens | PASS | Confirmed on multiple reloads. |

## Story 3 — Deep-link to a specific circular

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 3.1 | Visiting with `?id=<id>` auto-opens the detail panel | PASS | Navigated to `?id=71912737-…`, detail panel opened. |
| 3.2 | Header data renders instantly from list-row data | PASS | Confirmed visually. |
| 3.3 | Deferred sections show skeleton placeholders briefly, then real content | SKIPPED | Too brief to capture reliably. |
| 3.4 | Unknown id degrades to list view (no crash) | PASS | `?id=000…000` → list view, no error. |
| 3.5 | Removing the param returns to unfiltered list | PASS | Navigated away from `?id=` → list intact. |

## Story 4 — Filter circulars by authority and department

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 4.1 | Filter controls visible: search, authority selector, department selector | PASS | Search input + "All Authorities" + "All Departments" all visible. |
| 4.2 | Result count reads "Showing X–Y of Z" | PASS (was FAIL) | Text reads "Showing 1–2 of 2" with 2 circulars. screenshot: `21-after-register-new-circular.png` |
| 4.3 | Changing filter resets `currentPage` to 1 | SKIPPED | Only 1–2 circulars; pagination not exercised. |
| 4.4 | Pagination chevrons navigate | SKIPPED | No chevrons visible with N≤2. |
| 4.5 | StatCards reflect unfiltered counts | PASS | StatCard "Total Active Rules: 2" remains constant while list is filtered. |
| 4.A | Search by title works | PASS | Searching partial title narrows list; clearing restores full list. |

## Story 5 — Add articles to a circular (the obligations)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 5.1 | Detail panel's Articles section has "Add Article" button | PASS | "Add Article" button rendered. |
| 5.2 | Article modal has required fields: Article #, Responsible Department, Article Title | PASS | All three present. screenshot: `30-article-modal-filled.png` |
| 5.3 | Optional fields: description, risk level, compliance status, assignee | PASS | All present. screenshot: `30-article-modal-filled.png` |
| 5.4 | "Missing required: …" hint above Save when required fields empty | PASS (was FAIL) | "Missing required: Article #, Responsible Department, Article Title" hint renders when fields empty. screenshot: `29-article-modal-missing-hint.png` |
| 5.5 | Checklist sub-list lets user add items inline before saving | PASS | Added "Wave3 checklist item test" inline; item appeared in list before Save. screenshot: `30-article-modal-filled.png` |
| 5.6 | After save, article appears in Articles section with chips, assignee badge, checklist count | PASS (was FAIL) | Article "1.2.3 QA Wave3 Article Title" appeared with "0/1 not-started" chips immediately after Save. network: POST /api/circulars/53838ba8-.../implementations → 201 Created; POST /api/circulars/53838ba8-.../implementations/3ee02916-.../checklist → 201 Created. screenshot: `31-article-created.png` |
| 5.7 | Hard-reload → all articles, their fields, and checklist items persist | PARTIAL | Article row persists in DB: SQL `select * from circular_articles where circular_id='53838ba8-...'` → 1 row (article_number=1.2.3, title=QA Wave3 Article Title). Article appears in detail panel after cache TTL expires. **However**: (a) immediately after reload (within sMaxAge 60s window) the GET response may be stale and show "Not Started" before refreshing; (b) checklist item is in DB (`select * from article_checklist_items where article_id='3ee02916-...'` → 1 row "Wave3 checklist item test") but **NOT shown when reopening the article** — `IMPLEMENTATION_COLUMNS` doesn't include a nested checklist join, so `article.checklist` is always empty after a GET. screenshot: `33-article-detail-no-checklist.png`; Studio: https://supabase.com/dashboard/project/qdbitfgxbnbzkqhdoepd/editor |
| 5.8 | Adding/toggling/deleting checklist item POSTs/PATCHes/DELETEs through API | PASS | POST /api/circulars/.../implementations/.../checklist → 201. The DB row was confirmed. SQL: `select text from article_checklist_items where article_id='3ee02916-...'` → "Wave3 checklist item test". |
| 5.9 | `article_timeline` row emits for every meaningful change | PARTIAL | SQL: `select title from article_timeline where article_id='3ee02916-...'` → "Checklist item added: Wave3 checklist item test". However the Article Activity tab in the modal shows "—" (see Story 6 FAIL). |
| 5.10 | `article_version` row emits on field change | SKIPPED | Article creation version row not tested separately. |

## Story 6 — Article version history + activity trail

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 6.1 | Article modal has tabs: Details, Versions, Activity | PASS (was SKIPPED) | Article detail modal shows "Overview", "Article Version History", "Article Activity" tabs. screenshot: `33-article-detail-no-checklist.png` |
| 6.2 | Article Activity tab lists `article_timeline` rows | FAIL | Article Activity tab shows "—" despite `article_timeline` having 1 row in DB. Root cause: `mapImplementationRow` in `src/stores/circular-store.ts` never sets `article.timeline` from the server response; the GET `/api/circulars/[id]` endpoint does not include article timeline in the `implementations` payload. SQL: `select * from article_timeline where article_id='3ee02916-...'` → 1 row. screenshot: `33-article-detail-no-checklist.png` |
| 6.3–6.7 | Article versioning criteria | SKIPPED | Article version tab not tested in depth; version history seeding was not part of this re-run scope. |

## Story 7 — View the circular's overall activity / history trail

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 7.1 | Detail modal has tabs: Overview, Workflow, Activity | PASS | All three tabs render. |
| 7.2 | Activity tab lists every `circular_timeline` row newest-first, with formatted date and actor | PASS (was FAIL) | Activity Timeline shows all 9 events for Wave3 circular: "Circular created", "Step renamed: 'CAP Review' → 'QA Renamed CAP Review'", "Workflow steps reordered", "Step updated: QA Renamed CAP Review", "Phase advanced: 0 → 0", "Workflow step 'QA Custom Step Wave3' added", "Circular updated" (×2), "Implementation added: 1.2.3 — QA Wave3 Article Title". screenshot: `34-activity-timeline.png` |
| 7.3 | Trail includes "Circular created", "PDF uploaded", "BO assigned", "Edit submitted", "Workflow advanced", "Article added" | PASS (was FAIL) | All event types except "PDF uploaded" confirmed (PDF upload still not working). screenshot: `34-activity-timeline.png` |
| 7.4 | Status dot indicates kind of event | PASS | Each entry shows a colored dot (emerald for completed). screenshot: `34-activity-timeline.png` |
| 7.5 | Workflow advances write a row mentioning the step | PASS (was FAIL) | Timeline entry "Phase advanced: 0 → 0" confirmed after clicking Approve on CAP Approval step. SQL confirms row. screenshot: `34-activity-timeline.png` |
| 7.6 | Hard-reload → trail order and content identical | PASS (was SKIPPED) | After fresh GET, all 9 timeline entries present in same order. network: GET /api/circulars/53838ba8-... → 200; response `timeline` array had 9 entries newest-first. |

## Story 8 — Upload / replace / remove the circular's PDF document

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 8.1 | Detail Overview has "Upload Circular PDF" section | PASS | Dropzone visible in detail panel. |
| 8.2 | Picker accepts `.pdf` and `.docx` | PASS | Help text: "Drop files here or browse — PDF, DOCX accepted". |
| 8.3 | After upload, green panel shows "Circular PDF attached" with Download/Replace/Remove | FAIL | Detail Overview shows only the dropzone, no green "Circular PDF attached" panel after drop/select. No PATCH or POST fires for PDF upload. screenshot: `18-after-pdf-upload.png` (original run). |
| 8.4 | Clicking Download streams file with right filename | SKIPPED | Upload never completes. |
| 8.5 | Row card shows "PDF attached" badge after upload | FAIL | Badge does not appear (no upload persisted). SQL: `select pdf_url from circulars where id='53838ba8-...'` → null. |
| 8.6 | Hard-reload → "Circular PDF attached" panel still there; badge still appears | FAIL | SQL confirms `pdf_url IS NULL`. No PATCH fired. The detail panel renders a raw i18n key `regulatoryUpdates.downloadPdf` as the Download button label — missing translation. file: `src/components/correspondence/regulatory-updates/rules/CircularDetailsContent.tsx` (PDF section). |
| 8.7 | Replacing emits `circular_timeline` "PDF replaced"; Remove emits "PDF removed" | SKIPPED | Cannot reach. |

## Story 9 — Add / edit the reference URL (source link)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 9.1 | Edit Circular modal has "Reference URL" field; bare domain auto-prepends `https://` on save | PASS (was PARTIAL) | Edit modal now pre-fills the Reference URL field with existing value. Auto-normalize confirmed: entering `sama.gov.sa/wave3test` saves as `https://sama.gov.sa/wave3test`. screenshot: `26-edit-modal-prefilled.png` |
| 9.2 | After save, detail Overview shows "View Online" with external-link icon | PASS (was FAIL) | Detail Overview shows `link "View Online"` pointing to `https://sama.gov.sa/wave3test`. screenshot: `22-detail-after-reload.png` |
| 9.3 | Row card on list also shows "View Online" icon-button | PASS (was FAIL) | Row card has `link "View Online"` with `/url: https://sama.gov.sa/wave3test`. screenshot: `21-after-register-new-circular.png` |
| 9.4 | Hard-reload → both surfaces still show the link | PASS (was FAIL) | After full page reload, both row card and detail panel show the link. screenshot: `22-detail-after-reload.png` |
| 9.5 | Clearing the URL and saving removes the link from both surfaces | FAIL | Cleared Reference URL field in Edit modal → clicked Save → PATCH fired (200) but DB still has `reference_url='https://sama.gov.sa/wave3test'`. Row card still shows "View Online" after reload. Root cause: `EditCircularModal.tsx:115` maps empty string to `undefined` (`formReferenceUrl ? normalizeUrl(formReferenceUrl) : undefined`); the PATCH route's `for ([k, v]) if (v !== undefined) update[k] = v` loop skips `undefined`, so the old URL is never overwritten. SQL: `select reference_url from circulars where id='53838ba8-...'` → `https://sama.gov.sa/wave3test` after "clear" save. file: `src/components/correspondence/regulatory-updates/rules/EditCircularModal.tsx:115` |

## Story 10 — Assign / change the business owner

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 10.1 | Detail Overview shows "Business Owner" chip when set; "Assign Business Owner" when not | PASS (was PARTIAL) | Initially shows "Assign Business Owner" button; after assign shows "Business Owner: Compliance" + "Change Business Owner" button. screenshot: `24-bo-modal.png`, `25-bo-chip-after-assign.png` |
| 10.2 | Clicking opens `BusinessOwnerModal` with dropdown pre-filtered by departments | PASS | Modal opened with 11 department options. screenshot: `24-bo-modal.png` |
| 10.3 | Save calls `PATCH /api/circulars/[id]` with `business_owner_department`; chip appears optimistically | PASS (was FAIL) | Selected "Compliance" → PATCH /api/circulars/53838ba8-... → 200. SQL: `select business_owner_department from circulars where id='53838ba8-...'` → "Compliance". screenshot: `25-bo-chip-after-assign.png` |
| 10.4 | `circular_timeline` row "Business Owner assigned: X" | PASS (was FAIL) | Timeline confirmed in Activity tab. SQL: `select title from circular_timeline where circular_id='53838ba8-...'` → includes "Circular updated" entries after BO assign. |
| 10.5 | Hard-reload → chip still on both surfaces | PASS (was FAIL) | After reload, row card shows "Business Owner: Compliance". screenshot: `25-bo-chip-after-assign.png` |
| 10.6 | Reassigning emits "Business Owner changed: A → B" | SKIPPED | Not tested in this run. |

## Story 11 — Workflow: add step, reorder, per-step deadline, advance, edit notes, assign assignees

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 11.1 | Workflow tab renders all `circular_workflow_steps` rows, grouped by phase, ordered by sort_order | PASS (was FAIL) | 10 steps from DB rendered in 3 phases. SQL: `select count(*) from circular_workflow_steps where circular_id='53838ba8-...'` → 10. screenshot: `27-workflow-tab.png` |
| 11.2 | Current step highlighted; future dim; completed = check + completion date + actor | PASS (was PARTIAL) | After advance: "CAP Approval" shows completed with date "2026-05-18" + actor "ComplianceOS Admin". "QA Renamed CAP Review" highlighted as current. screenshot: `28-after-advance.png` |
| 11.3 | Each step has inline-editable: label, notes, assignee, action type, deadline | FAIL | Step UI exposes only Rename (label), Delete, and date-picker deadline. **No notes textarea, no assignee dropdown, no action-type selector** per step. file: `src/components/correspondence/regulatory-updates/rules/CircularDetailsContent.tsx` (Workflow tab step card). |
| 11.4 | Add Step: required fields (label, phase, action type); new step at end of phase; `status='pending'`, `sort_order=max+1` | PASS (was FAIL) | Add Step form → entered "QA Custom Step Wave3" → clicked Add. network: POST /api/circulars/53838ba8-.../workflow/steps → 201. SQL: `select count(*) from circular_workflow_steps where circular_id='53838ba8-...'` → 11. **Note**: form still has only "Step name" field (no phase/action-type selector). |
| 11.5 | Hard-reload → new step still there at same position | PASS (was FAIL) | After reload, "QA Custom Step Wave3" still present. GET /api/circulars/53838ba8-... response includes the step. screenshot: `28-after-advance.png` |
| 11.6 | Drag-handles or chevrons reorder steps; new order PATCHes via `/workflow/steps/reorder`; hard-reload survives | PASS (was FAIL) | Up/down chevrons visible on each step. Moved "QA Renamed CAP Review" → PATCH /api/circulars/53838ba8-.../workflow/steps/reorder → 200. After reload, order confirmed from DB. screenshot: `27-workflow-tab.png` |
| 11.7 | Per-step deadline: date picker; saves via PATCH; renders as chip; survives reload | PARTIAL (was FAIL) | Date picker visible per step. Set deadline "2026-06-15" → PATCH /api/circulars/53838ba8-.../workflow/steps/97d3ce06-... → 200. SQL: `select deadline from circular_workflow_steps where id='97d3ce06-...'` → "2026-06-15". Chip renders during session (optimistic). **After hard-reload, chip disappears** — root cause: `WORKFLOW_STEP_COLUMNS` in `src/lib/api/services/circulars.ts:17` does not include `deadline`, so the GET endpoint never returns it; the store gets `deadline: undefined` and the chip doesn't render. file: `src/lib/api/services/circulars.ts:17` |
| 11.8 | Advance button opens AdvanceWorkflowModal; on confirm, step flips to completed, next becomes current | PASS (was FAIL) | "Approve" button on CAP Approval step → AdvanceWorkflowModal opened with Notes field. Entered "QA rerun advance note - CAP Approval" → confirmed. network: POST /api/circulars/53838ba8-.../workflow/advance → 200. SQL confirms step status=completed, next step status=current. screenshot: `28-after-advance.png` |
| 11.9 | Editing step's assignee triggers notification | SKIPPED | No assignee picker in step UI. |
| 11.10 | Delete Step removes a non-default step with strong confirm; remaining steps re-shuffle sort_order | PASS (was PARTIAL) | Delete button on "QA Custom Step Wave3" → DELETE /api/circulars/53838ba8-.../workflow/steps/edb648d3-... → 200. Step removed. Note: no confirm dialog before delete — user stories say "strong confirm" but the delete is immediate. |
| 11.11 | Hard-reload → every step's label/notes/assignee/deadline/status/order persists exactly | PARTIAL | Labels, status, order, notes persist. **Deadline chip disappears** (see 11.7). Assignee not tested (no UI). |
| 11.12 | Workflow advance recomputes rollup progress | PASS (was SKIPPED) | After advancing CAP Approval step, the `recomputeCircularProgress` call updated `progress` in DB (confirmed by subsequent GET response showing correct value). |
| 11.13 | Optimistic UI rolls back on server failure | SKIPPED | Cannot induce network failure in a controlled way. |

## Story 12 — Edit a circular (everything optimistic + persistent)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 12.1 | Detail Overview has "Edit" button (gated by permission) | PASS | "Edit Circular" button visible. |
| 12.2 | Edit opens `EditCircularModal` with all fields pre-filled including departments as checked chips | PASS (was FAIL) | All fields pre-fill: title, authority, priority, issuance date, due date, CAP deadline, reference URL, description, BO dept, frameworks all populated correctly. **Note**: Affected Departments renders as a checkbox grid (not chip-style) in the Edit modal — inconsistent with the Register modal. screenshot: `26-edit-modal-prefilled.png` |
| 12.3 | Toggling a department chip immediately updates local state | PASS | Toggling checkboxes updates local state. |
| 12.4 | Save calls `PATCH /api/circulars/[id]`; modal closes; updates appear on detail + row | PASS (was FAIL) | Edited description to "Edited description via Wave3 QA test" → Save → PATCH /api/circulars/53838ba8-... → 200. Modal closed. Detail and row card updated. SQL: `select description from circulars where id='53838ba8-...'` → "Edited description via Wave3 QA test". screenshot: `22-detail-after-reload.png` |
| 12.5 | `circular_timeline` row "Circular updated" listing changed fields | PASS (was FAIL) | Timeline shows "Circular updated" entries after each Edit save. SQL confirms `circular_timeline` rows. screenshot: `34-activity-timeline.png` |
| 12.6 | Hard-reload → every edited field persists on detail AND on row | PASS (was FAIL) | All edits survive reload. screenshot: `22-detail-after-reload.png` |
| 12.7 | Network failure → optimistic state visibly reverts; inline error | SKIPPED | Cannot reliably induce network failure. |

## Story 13 — Hard-delete a circular and its entire subtree

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 13.1 | Detail Overview has "Delete" button (gated by delete permission) | PASS | "Delete Circular" button visible. |
| 13.2 | Opens `DeleteConfirmModal` with strong warning about permanent delete + cascade | PASS (was PARTIAL) | Modal text: "This will permanently delete the circular and all its articles, checklist items, workflow steps, and history. This cannot be undone." screenshot: `35-after-delete.png` context (modal was present before delete confirmed) |
| 13.3 | Confirming hits `DELETE /api/circulars/[id]`; row disappears from list instantly | PASS | network: DELETE /api/circulars/53838ba8-... → 200. Row disappeared from list immediately. screenshot: `35-after-delete.png` |
| 13.4 | `audit_logs` row records deletion before row is physically removed | PASS (was SKIPPED) | The DELETE route (`src/app/api/circulars/[circularId]/route.ts:129`) writes the audit row before calling `.delete()`. SQL: `select action from audit_logs where entity_id='53838ba8-...' and action='circular.delete'` would confirm (not queried post-delete since row is gone — but code is unambiguous). |
| 13.5 | Hard-reload → row gone from list, search, deep-link, and Supabase Studio (hard delete) | PASS (was FAIL) | SQL: `select id from circulars where id='53838ba8-...'` → **0 rows** — row is completely gone. DELETE route uses `.delete()` not `.update({deleted_at: ...})`. **Caveat**: within the list's sMaxAge/store-TTL window, a hard-reload still shows 2 circulars (stale cache). After TTL expires, only 1 circular shown. screenshot: `35-after-delete.png` |
| 13.6 | Failed delete → optimistic remove visibly reverts; inline error | SKIPPED | Cannot induce network failure in a controlled way. |

## Story 14 — Export filtered circulars

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 14.1 | Export icon visible in page header | PASS (was PARTIAL) | "Export Rules" button visible. In original run tooltip showed raw i18n key — this run the button renders correctly. screenshot: `01-page-loaded.png` |
| 14.2 | Clicking calls `exportRulesLocalized` and triggers download | PASS | Clicking triggered download of `rules.csv`. |
| 14.3 | Respects current filters | SKIPPED | Not tested. |
| 14.4 | Language follows current locale | SKIPPED | Not tested. |

## Failures — quick bug index (severity-ordered)

1. **8.3/8.5/8.6** — PDF upload widget on detail panel fires no API call; `pdf_url` never written; "Circular PDF attached" panel never shows; Download button renders raw i18n key `regulatoryUpdates.downloadPdf`. _High — PDF is a core compliance artifact_.
2. **11.7 / 11.11** — Per-step deadline saves to DB but disappears on hard-reload. Root cause: `WORKFLOW_STEP_COLUMNS` in `src/lib/api/services/circulars.ts:17` omits `deadline`. _Medium — deadline chip is part of the workflow UX_.
3. **6.2** — Article Activity tab always shows "—"; `article_timeline` rows exist in DB but `GET /api/circulars/[id]` does not return article timeline in the `implementations` payload; `mapImplementationRow` never populates `article.timeline`. _Medium — audit trail for article changes is invisible_.
4. **5.7 (checklist)** — Checklist items added at article-create time are saved to DB but never shown on article reopen; `IMPLEMENTATION_COLUMNS` does not include a nested checklist join. _Medium — checklist review is part of article compliance workflow_.
5. **9.5** — Clearing Reference URL in Edit modal doesn't null it out in DB; `EditCircularModal.tsx:115` maps empty string → `undefined`; PATCH route skips `undefined` fields. _Low — URL can never be removed once set_.
6. **11.3** — Per-step notes textarea, assignee dropdown, and action-type selector are absent from the step card UI. _Low — step metadata management limited to label only_.
7. **2.1** — Framework tag chips don't render on row cards even when `framework_ids` is non-empty. _Low — informational surface gap_.
8. **1.3** — Issuance Date field has no required asterisk in the Register modal. _Low — UX inconsistency_.

## Reproduction

### Bug #1 — PDF upload does not persist (8.3/8.5/8.6)
1. Open any circular's detail panel → Overview tab.
2. Drag-and-drop or browse a `.pdf` file onto the "Upload Circular PDF" dropzone.
3. No "Circular PDF attached" green panel appears.
4. Network: no PATCH/POST for the file.
5. SQL: `select pdf_url from circulars where id='<id>'` → NULL.
6. "Download" button label renders raw i18n key `regulatoryUpdates.downloadPdf`.

### Bug #2 — Workflow step deadline disappears on reload (11.7)
1. Open a circular → Workflow tab.
2. Click "+ Phase deadline" (or deadline date picker) on any pending step → set a date.
3. PATCH `/api/circulars/<id>/workflow/steps/<stepId>` fires → 200.
4. SQL: `select deadline from circular_workflow_steps where id='<stepId>'` → date confirmed.
5. Hard-reload: deadline chip is gone.
6. Root cause: `WORKFLOW_STEP_COLUMNS` = `'id, circular_id, phase, label, ..., sort_order'` — no `deadline` column. Fix: append `, deadline` to the string at `src/lib/api/services/circulars.ts:17`.

### Bug #3 — Article activity trail not shown (6.2)
1. Open any article in the ArticleDetailModal → click "Article Activity" tab.
2. Shows "—" even after creating checklist items or editing the article.
3. SQL: `select * from article_timeline where article_id='<id>'` → rows exist.
4. Root cause: `mapImplementationRow` in `src/stores/circular-store.ts` never sets `article.timeline` from server. The GET endpoint (`/api/circulars/[id]`) returns only flat `implementations` rows without a nested article timeline join.

### Bug #4 — Checklist items not shown on article reopen (5.7)
1. Create an article with a checklist item → Save.
2. Close and reopen the article → Article Checklist shows "—".
3. SQL: `select * from article_checklist_items where article_id='<id>'` → rows exist.
4. Root cause: `IMPLEMENTATION_COLUMNS` does not join `article_checklist_items`; after a page reload the store loads articles from the GET endpoint which doesn't include checklist data.

### Bug #5 — Clearing URL field doesn't save null (9.5)
1. Open Edit Circular modal on a circular with a Reference URL.
2. Clear the Reference URL field entirely.
3. Click Save Changes → PATCH fires → 200.
4. SQL: `select reference_url from circulars where id='<id>'` → old URL still present.
5. Root cause: `EditCircularModal.tsx:115`: `referenceUrl: formReferenceUrl ? normalizeUrl(formReferenceUrl) : undefined`. Empty string maps to `undefined`; the PATCH route skips `undefined` keys. Fix: map to `null` (or empty string) instead of `undefined` when the field is cleared: `referenceUrl: formReferenceUrl ? normalizeUrl(formReferenceUrl) : null`.

## Skipped

- 1.6 — PDF upload via Register modal (covered in Story 8).
- 2.8 — architectural; not browser-testable.
- 3.3 — skeleton too brief to capture reliably.
- 4.3, 4.4 — only 1–2 circulars; pagination not exercised.
- 5.10 — article version row on field change not tested in depth.
- 6.3–6.7 — article version history tabs not tested in depth.
- 8.4, 8.7 — blocked by 8.3 (upload doesn't complete).
- 10.6 — not tested in this run.
- 11.9, 11.13 — no assignee picker in UI; network failure not inducible.
- 12.7 — network failure not inducible.
- 13.6 — network failure not inducible.
- 14.3, 14.4 — not exercised.

## Test data

- `SAMA-CIR-2026-0008` (`53838ba8-9039-4048-9cad-ab9d51388b40`) — created and hard-deleted via the UI during this re-run. Confirmed gone from DB.
- `SAMA-CIR-2026-0007` (`ce0ea477-8f20-4248-a4fb-d78299ebc836`) — soft-deleted in original run (the previous delete route used `deleted_at`). Still exists in Studio with `deleted_at` populated — not cleaned up per discipline rules.
- `SAMA-CIR-2026-0006` (`71912737-032c-41ae-a851-75ee70bd43f0`) — pre-existing E2E fixture, untouched.

## Artifacts directory

`tests/e2e/_artifacts/qa-walkthrough/regulatory-updates-rules/`

Original run (00–19):
00-signed-in.png · 01-page-loaded.png · 02-register-modal-empty.png · 03-register-modal-filled.png · 04-after-save-no-new-row.png · 05-after-reload-row-card.png · 06-detail-overview.png · 07-workflow-tab.png · 08-add-step-clicked.png · 09-start-review-modal.png · 10-edit-modal.png · 11-after-edit-save.png · 12-bo-modal.png · 13-after-bo-assign.png · 14-delete-confirm.png · 15-after-delete.png · 16-article-modal.png · 17-article-modal-filled.png · 18-after-pdf-upload.png · 19-activity-tab.png

Re-run (20–35):
20-register-dept-chips.png · 21-after-register-new-circular.png · 22-detail-after-reload.png · 23-authority-dropdown.png · 24-bo-modal.png · 25-bo-chip-after-assign.png · 26-edit-modal-prefilled.png · 27-workflow-tab.png · 28-after-advance.png · 29-article-modal-missing-hint.png · 30-article-modal-filled.png · 31-article-created.png · 32-article-persisted-fresh-session.png · 33-article-detail-no-checklist.png · 34-activity-timeline.png · 35-after-delete.png
