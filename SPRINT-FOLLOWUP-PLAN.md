# Sprint Follow-Up Plan — May 2026

> **Status (May 8 2026):** Rounds 1 + 2 landed and Playwright-validated. Round-2 reworks (§1.A–H) and the universal editable-dropdown migration (§2) shipped under commit following `031df1e`. The §3 RBAC matrix remains deferred to a future session per the original sequencing. See `PRODUCT-BACKLOG.md` summary dashboard for the closure list.

**Source:** Live demo review (May 7 2026) of the work shipped under "Editable Dropdowns + Compliance Review + Policy Owner Rename + Phase Deadlines + Risk Workflow + Exports + Permission Strip + SAMA Templates" sprint.

**Purpose:** This document captures every item raised during the review in one place, so the next session can pick it up clean. Each entry is a brief — not a full spec — with enough scope, file pointers, and gotchas that an implementer can hit the ground running. Backlog rows (`📋`) for every item below were appended to `PRODUCT-BACKLOG.md` in the same pass.

---

## Section 1 — Bugs & Gaps in This Sprint's Work

These are corrections to behavior that already shipped but doesn't match the intent.

### 1.1 Compliance Review tab — make rows clickable + paginated + filtered by business owner

**Problem.** On `/reports/compliance-review` every department currently sees every rule. The score is meaningless because the same 5 rules are applied to all 10 departments. Also, clicking a rule in the checklist does nothing (no detail open). Also no pagination.

**Fix scope.**
1. Filter the rules shown for an "active department" to only those whose `circular.businessOwnerDepartment` (a name string) — or, after the data-model cleanup below, `businessOwnerDepartmentId` — matches the active department. Rules with no business owner stay hidden from per-department views (or surface in a separate "Unassigned" bucket — design call: I'd vote a count badge on the dept card).
2. Same treatment for **policies**: spec'd this sprint adds `policy.businessOwnerDepartmentId`. Compliance Review must include policies, not just circulars. The per-department checklist becomes a unioned list of `[rules → businessOwner === dept] + [policies → businessOwnerDepartmentId === dept.id]`.
3. Each row in the checklist is a button: clicking opens the **same** detail modal used elsewhere (rule → `RegisterCircularModal` view OR `CircularDetailsContent` modal in `rules/page.tsx`; policy → `PolicyDetailsContent` modal in `policies/page.tsx`). Easiest path: navigate `/correspondence/regulatory-updates/rules?id={ruleId}` or `/correspondence/regulatory-updates/policies?id={policyId}` — both pages already deep-link `?id=` and auto-open the modal.
4. Pagination identical to the policies page (10/page, prev/next, page numbers).

**Affected files.**
- `src/app/(dashboard)/reports/(tabs)/compliance-review/page.tsx` (the whole page).
- Pull from `useCircularStore` (already there) **and** `usePolicyStore` (new).
- `src/stores/compliance-evaluation-store.ts` — `getDepartmentScore` already takes `applicableRuleIds`; just feed it the filtered list. Consider extending the eval key namespace to support both `rule:` and `policy:` prefixes so the same store handles both: `${kind}:${itemId}::${departmentId}`.

**Edge cases.** Migration: existing evaluations stored under bare-id keys need a one-shot migrate to `rule:{id}::{deptId}` (since today only rules are evaluated, this is safe — every existing key is a rule).

---

### 1.2 Risk drawer — surface the department-side workflow actions

**Problem.** The store actions `submitDepartmentPlan`, `acceptDepartmentPlan`, `toggleDepartmentPlanItem` are wired but the drawer panel never lets a department actually submit a plan. Once an officer hits "Send to department", the workflow status moves to `sent-to-department` and stays there forever — there's no UI surface to advance to `plan-proposed`.

**Fix scope.**
1. Add a "Propose mitigation plan" CTA to the drawer panel that's visible only when `wfStatus === 'sent-to-department'`. Clicking opens an inline form (or a nested modal) with: free-text plan, dynamic checklist (add rows, each row has text + optional deadline via `InlineDeadlinePicker`). On submit, calls `submitDepartmentPlan(riskId, plan, items, submittedBy)`.
2. The "Accept plan" button already exists (`acceptDepartmentPlan`) but only renders inside the `departmentProposedPlan` block — confirm it's reachable and prominent enough.
3. While in `in-progress` or `mitigated`, the existing checkbox list per item is fine; verify "Mark as reviewed" and "Mark all done" rolls up to `mitigationWorkflowStatus = 'mitigated'`.

**Affected files.**
- `src/app/(dashboard)/reports/(tabs)/risks/page.tsx` — IIFE around line 684–800.

**Note.** Today there's no separate "department user" persona, so the propose-plan UI is just the same drawer — that's fine for the demo. When RBAC comes back (see §3), gate the CTA on the user's department matching `risk.intendedDepartmentId`.

---

### 1.3 Phase/workflow deadlines on rules (parity with policies)

**Problem.** `setPhaseDeadline` works on policies (great UI). Rules (circulars) have a workflow but no inline deadline picker on each step.

**Fix scope.**
1. Add `deadline?: string` to `CircularWorkflowStep` in `src/types/index.ts`.
2. Add `setRuleStepDeadline()` action to `useCircularStore` that mirrors `usePolicyStore.setPhaseDeadline()`: same parent-deadline validation against `circular.dueDate` (or `capDeadline` for CAP-phase steps — design call), same activity-log entry pattern (will need a circular-side `activityLog` mirror; today circulars have a `timeline` array — re-use it with a new event type `phase_deadline_set`).
3. Render `InlineDeadlinePicker` inside the existing rule workflow step row in `CircularDetailsContent.tsx` (find via `workflowSteps.map` — same layout as the rule details page).

**Affected files.**
- `src/types/index.ts` — `CircularWorkflowStep`.
- `src/stores/circular-store.ts`.
- `src/components/correspondence/regulatory-updates/rules/CircularDetailsContent.tsx`.

---

### 1.4 Configurable workflow phases on rules (and policies)

**Problem.** Rule and policy workflows are seeded from hardcoded `TIER_WORKFLOWS` (policies) and equivalent hardcoded `defaultWorkflowSteps` (rules). Users can't rename a step or insert a new one freely.

**Fix scope.**
1. Policies already partly support this — the `WorkflowAddStep` UI exists in `PolicyDetailsContent`. Extend it so the user can also **rename** an existing step inline (pencil icon on hover, inline edit, Enter to save). Activity log entry: `step_renamed`.
2. Mirror the same pattern on rules. Today's `CircularDetailsContent` displays workflow steps from `workflowSteps[]` (already store-backed) but doesn't let the user add/rename/delete them. Add an "Add step" button at the bottom of the workflow tab and per-row edit/delete, gated on the step not being completed (matches policy rules).
3. Keep the **visual** UI of rules workflow as it is today (the user explicitly called out that they want to maintain the look).

**Affected files.**
- `src/components/correspondence/regulatory-updates/policies/PolicyDetailsContent.tsx` (rename only).
- `src/components/correspondence/regulatory-updates/rules/CircularDetailsContent.tsx` (full add/rename/delete/reorder + deadline picker).
- `src/stores/circular-store.ts` — add `addWorkflowStep`, `renameWorkflowStep`, `removeWorkflowStep`, `reorderWorkflowSteps`.

---

### 1.5 SAMA letter draft — turn `{{token}}` placeholders into inline UI on the letter body

**Problem.** Today the placeholder pickers live in a separate "Fill in placeholders" panel above the editor. The user wants the experience to feel like an `@`-mention: the token in the letter body itself becomes a clickable chip that, when clicked, opens a searchable dropdown matching its configured type. Once filled, the chip displays the chosen value.

**Fix scope.**
1. Replace the raw `<textarea>` in the letter body with a contenteditable rich editor (or a lightweight token-aware renderer over a textarea — a `<div>` that re-renders the body with React, splitting on `{{token}}` and rendering inline `<PlaceholderChip>` components).
2. `PlaceholderChip` is essentially today's `PlaceholderPicker` but inline — small chip showing either the token name (unfilled, dashed border, amber) or the chosen value (filled, solid emerald). Click → dropdown with the existing search-by-kind UI.
3. Same treatment for the subject line.
4. Keep the body's actual stored string as `{{token}}` plus the `placeholderValues` map; only the rendered-on-screen view substitutes. On save, run `renderTemplate()` exactly as today.
5. The Arabic body needs the same treatment in RTL.

**Affected files.**
- `src/app/(dashboard)/correspondence/sama-letters/page.tsx` (`CreateLetterForm` — the bilingual editor block).
- `src/components/correspondence/sama-letters/PlaceholderPicker.tsx` — re-shape the `text`/`date`/`reference` cases into a smaller chip-friendly dropdown variant. Probably split into `PlaceholderChip.tsx` (the inline chip) and keep `PlaceholderPicker.tsx` for the popover content.
6. Drop the standalone "Fill in placeholders" panel (or keep it as an optional summary table — design call).

**Edge cases.** Cursor position handling in a contenteditable. RTL bidi inside Arabic body. The simpler implementation: render the body as a flexible block of plain-text spans + chip components, with the chip replacing the token. Editing of plain text proceeds via per-span contenteditable. This is non-trivial — budget half a day.

---

### 1.6 "Draft New Letter" modal — sync with Template Registry

**Problem.** Two entry paths into the create-letter modal:
- Click a registry template → "Use Template" → modal opens with subject/body/etc. pre-filled. Works.
- Click "Draft New Letter" button on the Letters tab → modal opens with letter-type dropdown but no template selection — body is empty.

The user wants both to feel like the same flow: when they pick a letter type from the dropdown in the create modal, they should also be able to pick a specific template (from the same template bank that the registry uses), and picking one fills the form.

**Fix scope.**
1. In `CreateLetterForm`, add a "Choose template" `EditableSelect` (or styled select) below the Letter Type dropdown. It's filtered to templates of the currently-selected `selectedType`. Picking one → call the same effect that `template?.id` already triggers (the existing useEffect at line ~2329 that pre-fills subject/body/authority).
2. The select should be optional — picking nothing keeps the form empty.
3. Pre-select the template if `template` was passed in (i.e., the "Use Template" path).

**Affected files.**
- `src/app/(dashboard)/correspondence/sama-letters/page.tsx` — `CreateLetterForm` component.

---

### 1.7 Compliance Health on the dashboard must be sourced from Compliance Review

**Problem.** Today's dashboard `Compliance Health` hero card is computed by `useDashboardHealth` from a 7-component formula (audits, observations, letters, policies, circulars, riskPosture, training). The user wants it to be the same number that surfaces on `/reports/compliance-review` — i.e., compliant ÷ (compliant + non-compliant) across departments × rules+policies.

**Fix scope.**
1. Add a new function `calculateComplianceReviewScore(circulars, policies, departments, evaluations)` in `src/stores/compliance-evaluation-store.ts` (or a new `src/lib/compliance-review-score.ts`).
2. Score per department = compliant / (compliant + non-compliant), filtered by business owner of each rule/policy as in §1.1.
3. Overall = weighted mean across departments (equal weights for now — make weights configurable later).
4. `useDashboardHealth` calls this and exposes it as `metrics.health.businessComplianceScore` separately from the existing component-driven `overall`. Or replace `overall` with this number — design call to align with the user's intent.
5. The Executive view's hero ring number, the Managerial view's threshold bar, and the Officer view's "your actions" panel all read from this new source. The 7-component breakdown remains visible elsewhere (renamed appropriately — see §1.8).

**Affected files.**
- New: `src/lib/compliance-review-score.ts`.
- `src/hooks/useDashboardHealth.ts` — wire new input + emit new field.
- `src/components/dashboard/{Executive,Managerial,Officer}View.tsx` — read the new field.

**Migration note.** The existing 7-component score is still useful as a *team-performance* metric. Keep it, just rename and relocate (see §1.8).

---

### 1.8 Rename "Executive View" / "Compliance Health" → "Team Score" wherever it represents team performance

**Problem.** The user explicitly said: the existing "Executive View" tab is showing team performance, not business compliance. Rename to **"Team Score"** everywhere. The current sprint added `reports.teamPerformanceTab: "Team Performance"` for the new tab nav label — change that to "Team Score" too.

**Fix scope.**
1. `src/i18n/dictionaries/en.json` + `ar.json`:
   - `reports.teamPerformanceTab: "Team Performance"` → `"Team Score"`.
   - `settings.executiveView: "Executive"` (used in user-preferences default-view dropdown at `src/components/settings/UserPreferencesSection.tsx:64`) → `"Team Score"`.
   - Also `viewExecutive: "Executive"` (en.json:212) — same rename.
   - Stale unused keys flagged by audit: `audits.executiveView` (en.json:1374) and `reports.executiveView` (en.json:2326) — delete; no callers.
2. The Executive tab on `/reports/executive` shows the 7-component dashboard health — its page header should say "Team Score" too (currently `t('reports.auditManagement')` which now resolves to "Compliance Review" — wrong on this tab, see §1.9).
3. The dashboard hero card label: when displaying the 7-component score, label it "Team Score". When displaying the new Compliance-Review-derived score (§1.7), label it "Compliance Health".

**Affected files.**
- Both i18n dictionaries.
- `src/components/settings/UserPreferencesSection.tsx`.
- `src/app/(dashboard)/reports/(tabs)/executive/page.tsx` — header text.
- `src/components/dashboard/{Executive,Managerial,Officer}View.tsx` — hero card label logic.

---

### 1.9 Audit-page header copy on non-Audits tabs

**Problem.** The audits/executive/detailed/risks pages share a header that reads `t('reports.auditManagement')` when the path starts with `/reports/audits` and `t('reports.auditReports')` otherwise. Last sprint we renamed `auditManagement` → "Compliance Review" — but `auditReports` (still "Audit Reports") shows on the Team Score / Audit Logs / Risks tabs and now reads stale.

**Fix scope.**
1. Decide the right page-level title per tab. Cleanest: each tab sets its own title, not the shared header logic. Or: `auditReports` becomes "Compliance Review" too (the umbrella page name) and the per-tab name lives in the tab pill, which it already does.
2. New `compliance-review` tab page already has its own header text "Compliance Review / Per-department compliance evaluation" — that's correct, no change.

**Affected files.**
- `src/app/(dashboard)/reports/(tabs)/{audits,executive,detailed,risks}/page.tsx` — header conditional.
- i18n.

---

## Section 2 — Universal Editable Dropdowns (the big one)

### 2.1 The user's ask, restated

Every dropdown in the app — **including** today's enum-backed ones (priority `critical|high|medium|low`, severity, risk likelihood/impact 1–5, monitoring frequency, audit frequency, status lifecycles, approval tiers, observation source, advisory priority/businessUnit, training category, etc.) — should look and behave like the new `EditableSelect`: pick from a list, or add a new entry, or edit/delete existing entries (with sensible guards on defaults).

The user explicitly acknowledged this is a data-model decision and asked for the migration approach to be discussed before implementation. This section is that discussion, backed by a full code audit (~70 dropdown call sites inventoried).

### 2.2 The four-bucket migration framework

For each dropdown, pick one of these strategies:

- **Bucket A — store-backed CRUD (no enum at all).** Already true for `Department`, `LetterTemplate`, `AuditTemplate`, `PolicyTemplate`, `Framework`. No change needed except UI swap to `EditableSelect`.
- **Bucket B — hybrid (seed + custom).** Keep the enum literal type, but allow users to add string-keyed "custom" values that live in a new per-category Zustand store. Persisted records keep their enum value; new ones can be either the enum literal or a custom string. This is what `Department` already does (`isDefault: true` seed rows the user can extend). Persisted data stays untouched. **Recommended for most cosmetic enums.**
- **Bucket C — full open string list.** Drop the enum literal, replace with `string`. Color maps lose their `Record<EnumKey, X>` shape and become lookups via the new store. Use only when the enum is purely cosmetic.
- **Bucket D — locked / labels-only.** The underlying value drives math or workflow logic; users may edit display labels but not the underlying values. Likelihood/impact 1–5 is the obvious case (`riskScore = likelihood × impact`); status lifecycles also fall here because they gate state-machine transitions in the engine and stores.

### 2.3 Per-category recommendation (post-audit)

The audit found 70+ dropdown call sites. Grouped recommendation:

| Category | Type | Bucket | Notes |
|---|---|---|---|
| **Department / business owner / dept filter** | `string` (already store-backed) | A | Already EditableSelect in 7 sites; sweep the remaining: `employee-table.tsx:114` (training filter — uses hardcoded labels instead of department-store), `RegDocFilterBar.tsx`, `feed/page.tsx`, `advisory/page.tsx`, `[auditId]/page.tsx`, both audit modals, `correspondence` modals. |
| **Assignee / officer (team member)** | `string` (team-store user IDs) | (d) Don't change | Team members are managed by the invite flow, not by an EditableSelect. Adding an "Add new" here would conflict. Just swap the visual style to match. |
| **Authority** in `RegDocFilterBar.tsx:71` | hardcoded 7-value array | A — read from `framework-config-store` | The store already has every framework. Easiest first task. |
| **Authority dept (per authority)** | `useAuthorityDeptStore` | A | Done this sprint. |
| **SAMA sub-category** (`sama-letters/page.tsx:2482`) | already `string` | A — new `useSAMASubCategoryStore` | Trivial, no migration. |
| **Calendar event type, Correspondence type, Advisory businessUnit** | enum, drives small `Record<>` icons | B | Add fallback config block, then EditableSelect with hybrid persistence. |
| **Audit/Observation/Advisory/Circular priority + Article risk-level + ComplianceThreshold** | `critical|high|medium|low` enum (or 4-tier) | D — labels-only | Color ramp depends on the 4-tier ordering; renaming "Critical" → "Severe" is the realistic ask. |
| **Likelihood / Impact 1–5** (`risks/page.tsx:869,870`) | `1|2|3|4|5` literal | D — labels-only | `riskScore = likelihood × impact` math. Allow editing labels ("Rare"…"Catastrophic") only. |
| **Observation severity** | `critical|high|medium|low` | D — labels-only | Severity feeds compliance engine deductions; tiers must stay 4. |
| **MonitoringFrequency, AuditFrequency, ReviewCadence, ReportPeriod** | enum, drives `computeNextReview()` math | D — labels-only | Adding a custom cadence requires a corresponding interval that can't be inferred. Defer "add custom" until an interval-math API exists. |
| **PolicyApprovalTier + workflow actionType** | enum, drives `TIER_WORKFLOWS` state machine | D — locked | Adding a tier needs explicit step definitions; not safe via UI. |
| **Audit/Observation/Risk/Policy/Circular/Correspondence/Training status** | enum, drives state-machine transitions, overdue calc, sort, color | D — labels-only | Adding a custom status would silently break workflow logic in `policies/page.tsx`, `compliance-engine.ts`, store actions like `submitForApproval`/`approve`. Recommend **labels-only mode**: rename "approved" → "Approved by Council", but underlying string stays canonical. |
| **Audit category, Policy category, Training category** | enum, drives `Record<>` color/icon | B | Add generic neutral fallback config, then hybrid EditableSelect that adds string IDs alongside built-ins. |
| **Risk category** | enum, drives 3 separate color maps + 2 reports tabs | B (phase 2) | Bigger blast radius. Central `getCategoryConfig(id)` helper replaces every direct `Record<RiskCategory, ...>` lookup before opening the dropdown. |
| **SAMALetterType, SAMASubCategory** | enum + already `string` | B | Letter type drives `LETTER_EMAIL_SUBJECTS` + sort; needs fallback. |
| **User role** (`officer|manager|admin`) | enum, gates RBAC | D — locked | Wait until §3 (RBAC matrix) is built. |
| **Onboarding employees / industry / region** | hardcoded | B | Pure metadata, no downstream `Record<>` consumers. |
| **Date format / dashboard view / notification scope / language** | enum, tied to formatting code | D — locked | Not user-managed. |

### 2.4 Concrete fallback pattern (every consumer of the form `config[entity.field]`)

Every place that does `categoryConfig[risk.category]` will break when `risk.category` becomes a custom string. Standard fix:

```ts
const fallbackColor = { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
const conf = riskCategoryConfig[risk.category as RiskCategory] ?? fallbackColor
```

Audit-found maps that break (every one needs the fallback before opening its dropdown):
- `riskCategoryConfig` (`risks/page.tsx:67`), `riskCategoryLabelKeys:82`, `riskCategoryBarColors` (`executive/page.tsx:60`)
- `riskStatusConfig` (`risks/page.tsx:75`), `statusOrder:314`, `uiStatusToStoreStatus:246`
- `auditStatusColors`/`auditPriorityColors`/`auditCategoryColors`/`auditFrequencyColors` (`reports/(tabs)/audits/page.tsx:53,60,66,74,83,91`)
- `severityConfig`/`statusConfig` (`observation-types.ts:134,164`); `severityOrder`
- `STATUS_COLORS` (`PolicyDetailsContent.tsx:50`), `POLICY_STATUS_COLORS` (`RegDocCard.tsx:84`), `tierLabels:129`, `TIER_COLORS` (`PolicyDetailsContent.tsx:43`, `RegDocCard.tsx:102`)
- `PRIORITY_COLORS`/`CIRCULAR_STATUS_COLORS` (`RegDocCard.tsx:47,54`)
- `advisoryStatusConfig`/`advisoryPriorityConfig` (`advisory/page.tsx:151,158`), `businessUnitLabels`
- `LETTER_EMAIL_SUBJECTS:45`, `typeColors:551`, `typeIcons:554`, `statusOrder:400`, `intros:99,107` (`sama-letters/page.tsx`)
- `trainingStatusConfig` (`employee-detail-modal.tsx:124`)

### 2.5 The "label-only" pattern (Bucket D refined)

For likelihood/impact/severity/status/priority and any enum that drives math or workflow:

```ts
// New store: src/stores/scale-labels-store.ts
interface ScaleLabelsState {
  // For each canonical enum key, hold an optional user override label per locale.
  riskLikelihood:        Record<1|2|3|4|5,                      { en?: string; ar?: string }>
  riskImpact:            Record<1|2|3|4|5,                      { en?: string; ar?: string }>
  observationSeverity:   Record<'critical'|'high'|'medium'|'low', { en?: string; ar?: string }>
  policyStatus:          Record<PolicyStatus,                   { en?: string; ar?: string }>
  // ...
  setLabel: (scale: string, key: string|number, lang: 'en'|'ar', value: string) => void
  resetLabel: (scale: string, key: string|number) => void
}
```

UI: `EditableSelect` variant where **add and delete are disabled** but **edit is enabled**, with a reset-to-default button per row.

### 2.6 Recommended tackle order (cheapest first)

Rebuilt from the audit's "easiest → hardest" list:

1. `RegDocFilterBar` authority filter (`RegDocFilterBar.tsx:71`) — swap 7 hardcoded `<option>`s for `frameworks.map(...)`. ~30 min.
2. Training department filter (`employee-table.tsx:114`) — wrap in EditableSelect bound to `useDepartmentStore`. ~30 min.
3. Onboarding pickers (`onboarding/page.tsx:432,452,475`) — EditableSelect with hybrid persistence to org metadata. ~1 hour.
4. SAMA sub-category — new `useSAMASubCategoryStore` + EditableSelect, no migration. ~1 hour.
5. Calendar event type, Correspondence type, Advisory businessUnit — hybrid (b); add fallback config block + EditableSelect; persisted seeds stay valid. ~2 hours each.
6. Priority + ComplianceThreshold (labels-only) — new `useScaleLabelsStore`; EditableSelect rename-only mode. ~half a day.
7. Likelihood/Impact 1–5 labels — same store; scale stays 1–5. ~1 hour.
8. MonitoringFrequency / AuditFrequency / ReviewCadence — labels-only first; defer "add custom cadence" until interval-math API exists. ~1 hour.
9. PolicyCategory / TrainingCategory / AuditCategory — hybrid (b) with generic neutral fallback config + central `getCategoryConfig(id)` helper. ~half a day each.
10. RiskCategory — phase-2 of #9; bigger blast radius. ~half a day.
11. Status enums (Audit, Observation, Risk, Policy, Circular, Correspondence, Training) and PolicyApprovalTier — recommend Bucket D label-edit only. Document explicitly as "fixed by design".

### 2.7 Persisted-data migration policy (the user's question)

The user asked: "are we going to append or edit old data so that it is represented by the correct new category, or will it be old category plus anything new?"

**Recommendation: append, never rewrite.**
- For Buckets A/B: existing records keep their old values. New records can pick from old + new options. The rendering layer falls back gracefully if a value doesn't match any current option (greyed-out chip with the raw string and the §2.4 fallback config).
- For Bucket C: when the user deletes an option that records still reference, two choices appear in a confirm dialog: "merge into another option" (rewrites those records) or "keep label, just remove from picker" (records stay, picker hides it). Default: keep label.
- For Bucket D: labels are pure presentation — old data is fine. The integer or canonical key on the record never changes.

### 2.8 Settings UI for managing options

A new Settings sub-tab, **"Lists & Categories"**, with one section per managed category. Each section shows the EditableSelect's content as a table (label, EN, AR, isSeed, usage count across stores, actions). Bulk reset-to-defaults per section. This is where users add/edit/delete entries in bulk; per-form EditableSelect popovers stay for inline edits where they're convenient.

---

## Section 3 — RBAC Permissions Matrix (post-final feature)

The user explicitly requested this be added to the backlog (not immediately implemented).

**Brief.** A new Settings page tab — **"Access Matrix"** — rendered as a 2-D table:
- Rows: every team member (from `team-store`).
- Columns: every module/feature in the application (audits, observations, policies, rules, SAMA letters, training, risk register, calendar, settings, team, dashboard, exports, etc.).
- Each cell: a checkbox or a small dropdown with `none | view | edit | full`. Default per role.
- Bulk actions: "Grant all view" / "Revoke" / "Apply role template".

**Scope hints.**
- New store: `permission-matrix-store.ts` keyed by `${userId}::${module}` → `'none'|'view'|'edit'|'full'`.
- Replace today's `hasPermission(user, 'observation:edit')` calls (currently no-ops since the strip in this sprint) with lookups against this matrix.
- 30+ modules — list needs to be enumerated up front. Best done by scanning the routes file.
- Tied to backlog item RBAC-NEW (added below).

**Acceptance.** Compliance officer can open the matrix, see "Mark Wallace — Audits: edit, Observations: full, Policies: view-only, all else: none", and toggle.

---

## Section 4 — Bug List (small things)

Append to the new "Bug List" backlog section (BUG-NEW-XXX series, see Backlog updates).

| # | What | Where | Severity |
|---|---|---|---|
| B-1 | `regulatoryUpdates.articles` i18n key missing in both en.json and ar.json | `src/lib/export.ts:1242` (only caller) | Med — Arabic CSV export shows literal key string |
| B-2 | `navigation.reportsHelp: "Reports"` still says "Reports" after rename | `src/i18n/dictionaries/en.json:120` + ar.json:120 | Low — appears in help-store but no callers found |
| B-3 | `settings.executiveView: "Executive"` still surfaces in user-preferences view dropdown | `src/components/settings/UserPreferencesSection.tsx:64` + en.json:2003 | Med — user-facing |
| B-4 | `viewExecutive: "Executive"` literal in dashboard view selector still says "Executive" | `src/i18n/dictionaries/en.json:212` | Med |
| B-5 | Stale unused i18n keys `audits.executiveView` (en.json:1374) and `reports.executiveView` (en.json:2326) — no callers, can delete | en.json + ar.json | Low |
| B-6 | ~50 non-translated English literals across new files (`compliance-review/page.tsx`, `PlaceholderPicker.tsx`, `PlaceholderDefEditor.tsx`, `inline-deadline-picker.tsx`, `editable-select.tsx`) — full list in i18n agent report | various | Med — Arabic users see English strings in new UI |
| B-7 | Risk-page row click doesn't open the drawer; only the eye-icon button does. (Confirmed via Playwright in May 7 demo.) Inconsistent with the rest of the app where row-click is the open action. | `src/app/(dashboard)/reports/(tabs)/risks/page.tsx` | Low |
| B-8 | Compliance Review has no per-department applicable rule filter — every dept gets every rule (covered by §1.1, listed here for completeness). | `compliance-review/page.tsx` | High |
| B-9 | Compliance Review pagination missing | same | Med |
| B-10 | Compliance Review rule rows aren't clickable | same | Med |
| B-11 | Risk drawer department-side workflow has no UI surface (covered by §1.2). | `risks/page.tsx` | High |
| B-12 | Rule workflow steps lack inline deadline picker (covered by §1.3). | `CircularDetailsContent.tsx` | High |
| B-13 | Audit/executive/detailed/risks tabs share `auditReports` page header which still says "Audit Reports" — should reflect the new "Compliance Review" umbrella (covered by §1.9) | various tab pages | Low |
| B-14 | "Draft New Letter" modal does not let user pick a template (covered by §1.6) | `sama-letters/page.tsx` | High |
| B-15 | Letter placeholders presented in a side panel rather than inline in the body (covered by §1.5) | `sama-letters/page.tsx` | High — UX miss |
| B-16 | Policy Owner dropdown allows add/edit but the user explicitly confirmed delete should also persist via the department store (already wired — verify on QA pass; if any UI hides delete for non-default depts, surface it) | `PolicyDetailsContent.tsx`, `useDepartmentStore` | Low — verify only |

---

## Section 5 — Backlog Mirror

Every brief in §1, §2, §3 has a matching `📋 To Do` row appended to `PRODUCT-BACKLOG.md` under the appropriate epic. Every bug in §4 is a `📋` row in a new "Epic 26: Bug List & UX Polish" section. Every feature shipped this sprint is a `✅ Done` row in its existing epic.

See `PRODUCT-BACKLOG.md` (updated in this same commit) for the canonical IDs assigned (`COMPREV-*`, `RSK-*`, `RUL-*`, `POL-*`, `LETTER-*`, `DRP-*`, `RBAC-*`, `BUG-*`).
