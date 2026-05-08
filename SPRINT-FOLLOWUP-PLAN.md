# Sprint Follow-Up Plan — May 2026 (round 3)

**Source:** Live demo review (May 8 2026) of the work that landed in commit `49f3a75` ("Sprint follow-up round 2 — pending visual, dashboard parity, auto-tick, inline chips, universal editable dropdowns"). Round 2 closed the demo-review reworks (§1.A–H) and the universal editable-dropdown migration (§2). Round 3 is the corrections list from the May 8 demo.

**Purpose:** Hand off to a fresh session. This document supersedes the round-2 plan. The next session should (a) audit each bug below in code before fixing, (b) land fixes in §1, (c) execute the architectural corrections in §2 — these reverse a chunk of round-2 work that the user found incorrect on review, (d) the consistency sweep in §3, (e) the propagation work in §4, (f) the framework/sub-category Settings refactor in §5. There is no §6 RBAC matrix in this round — that remains deferred per the original sequencing.

---

## Section 0 — What's locked / approved

These items shipped in `49f3a75` and survived the May 8 review. Do not retouch unless §1–§5 explicitly asks:

1. §1.A pending bucket visual (amber `Pending` pill + `+N pending` caption).
2. §1.B `overallByRecords` dashboard ↔ Compliance Review parity.
3. §1.C derived-on-read auto-tick (rule + policy workflow completion → `compliant` with `AUTO` pill).
4. §1.D revert of `settings.executiveView` / `dashboard.viewExecutive` to "Executive".
5. §1.G "Choose Template" reads from `useSAMATemplateStore` — wiring is correct in code, but see BUG-R3-04 for the user's contrary report; audit before re-touching.
6. §1.H `placeholderPicker.*` i18n sweep on `PlaceholderPicker` + `PlaceholderDefEditor`.
7. The new stores from §2 — they are not deleted. They are kept; what changes is **which** ones are exposed in the UI, and how (see §2 below).
8. The new "Lists & Categories" Settings sub-tab framework — kept. Its **content** is what gets reshuffled in §2 + §5.

---

## Section 1 — Bugs to fix (round-2 regressions discovered May 8)

### BUG-R3-01 — `InlineChipEditor` synchronous unmount race (console error)

**Symptom.** Console error during render: *"Attempted to synchronously unmount a root while React was already rendering. React cannot finish unmounting the root until the current render has completed, which may lead to a race condition."* Stack:
```
at InlineChipEditor.useCallback[rebuild] (InlineChipEditor.tsx:245)
at InlineChipEditor.useEffect (InlineChipEditor.tsx:305)
at SAMALettersPage (sama-letters/page.tsx:1583)
```

**Root cause.** `InlineChipEditor.tsx:240–290` calls `r.unmount()` synchronously inside `rebuild()`, which is invoked from a `useEffect`. React 18+ blocks synchronous root unmounts during the parent's commit phase. The `try/catch` swallows the warning but doesn't prevent the race.

**Fix.** Defer the unmount to the next microtask:
```ts
for (const r of chipRootsRef.current) {
  const root = r
  queueMicrotask(() => { try { root.unmount() } catch {} })
}
chipRootsRef.current = []
```
Or schedule via `setTimeout(() => root.unmount(), 0)`. Either pulls the unmount out of React's render phase.

Audit the second `useEffect` (`InlineChipEditor.tsx:318+`) for the cleanup-on-unmount path — same pattern; same fix.

**Acceptance.** Open `/correspondence/sama-letters`, click any saved draft, type into the body, switch language EN ↔ AR, navigate away. No console errors at any step.

---

### BUG-R3-02 — `PlaceholderPicker` popup is visually clipped

**Symptom (see screenshot in user message).** The picker popover renders the chip header *"TEST {{TEST}}"* but the right edge is cut off; same for long labels.

**Likely cause.** The popover container in `PlaceholderPicker.tsx` uses a fixed width / `whitespace-nowrap` / overflow-hidden, or sits inside an overflow-clipped parent. Audit the popover container's CSS chain from `LetterBodyEditor` outward. Likely fix: `whitespace-normal` on the header label, `min-w-[260px]` on the popover, raise `z-index`, and ensure the popover's `position: fixed` (not `absolute` inside a clipped parent) so it can escape the editor's bounding box.

**Acceptance.** Click any chip with a long token (`{{my_long_reference_id}}`) in either language. The popover renders with the full header visible, no clipping, no horizontal scroll.

---

### BUG-R3-03 — Placeholder picker labels don't translate to Arabic

**Symptom.** When the app language is Arabic, the `PlaceholderPicker` and chip labels still render English strings (e.g., the kind label "Text" / "Date" / "Reference").

**Likely cause.** Round-2's i18n sweep added `placeholderPicker.*` keys to both `en.json` and `ar.json`. Verify the `ar.json` entries are populated AND the picker's `useTranslation()` hook actually re-renders when the language switches. If a value falls through to the EN fallback, the AR key is probably missing or whitespace-only.

**Audit checklist.**
1. Open `src/i18n/dictionaries/ar.json` → confirm `placeholderPicker.*` block has 16 entries with non-empty Arabic strings.
2. Open `PlaceholderPicker.tsx` → confirm every visible string goes through `t(...)` (no leftover JS string literals).
3. Confirm the chip placeholder text inside the contentEditable also renders via `t(...)` — that's the part the user might be seeing as English.
4. Verify `<div dir="rtl">` wraps the popover when `language === 'ar'`.

**Acceptance.** Toggle language to العربية. Open a draft. Click a chip. Every visible string in the popover (kind label, header, hints, button captions) renders in Arabic.

---

### BUG-R3-04 — "Choose Template" still doesn't show user-created templates

**User report.** The "Choose Template" dropdown in the Draft New Letter modal does not list templates the user has created.

**Code state.** `sama-letters/page.tsx:2737–2748` filters `allTemplates` from `useSAMATemplateStore` by `t.type === selectedType && t.status === 'Active'`. This *should* be correct — round 2 verified it. BUT the user found it broken. Two probable causes:

1. **Status mismatch.** User-created templates may save with status `'active'` (lowercase) or `'Draft'` instead of `'Active'`. Audit the create-template flow's status field and align the filter.
2. **Type mismatch.** User-created templates may save the letter-type **label** ("Inquiry") instead of the **id** (`inquiry`). With `SAMALetterType` widened to string, a label vs id confusion would silently fail the filter. Audit the template create form's type field and the seed template `type` values for shape consistency.

**Fix.** First reproduce the bug: create a brand-new template, assign letter type "Inquiry", save, return to Draft New Letter modal, pick "Inquiry" type — verify the new template appears or doesn't. Then trace the data path. The filter should be tolerant: `t.type === selectedType || t.type?.toLowerCase().replace(/\s+/g, '-') === selectedType`.

**Acceptance.** Create a template "My Test Template" of type "Inquiry". Open Draft New Letter, set Letter Type to "Inquiry", open the Choose Template select — "My Test Template" appears in the list along with seed inquiry templates.

---

### BUG-R3-05 — New letter types added in Draft modal don't show in template registry

**Symptom.** Adding a new letter type via the EditableSelect inside Draft New Letter persists to `useSAMALetterTypeStore`, but when the user opens the Letter Templates section / template-create form, the new letter type doesn't appear in the type filter or the type picker.

**Likely cause.** The template editor surface (search the codebase for the template create/edit modal — likely a sibling component on the same `sama-letters/page.tsx`) reads letter types from a hardcoded array or from the OLD `SAMALetterType` literal union, not from `useSAMALetterTypeStore`.

**Fix.**
1. Find the template create/edit modal. Search `sama-letters/page.tsx` for `Letter Type` or the seed letter-type strings in JSX context.
2. Replace the hardcoded select with an `EditableSelect` (or a read-only custom-styled select per §3 below) bound to `useSAMALetterTypeStore`.
3. Same applies to the template-list **filter** dropdown if present.
4. Ensure the template editor passes the letter-type **id** when saving (not the label) — tied to BUG-R3-04.

**Acceptance.** Add a new letter type "Internal Memo" via Draft New Letter modal. Open the Letter Templates section / template editor. The "Internal Memo" type is selectable when creating a new template. Saving a template with that type and reopening Draft New Letter with type = "Internal Memo" surfaces it in Choose Template.

---

### BUG-R3-06 — Free-text option in placeholder picker is awkward; remove it

**User feedback.** "Doesn't accept text as gracefully as I wanted it to be. So remove the option of free text. Feels useless when they could just write it up without having to use their braces."

**Decision.** Remove the `kind: 'text'` placeholder option entirely from `PlaceholderDef.kind` and from the `PlaceholderPicker` UI. The valid kinds become **`'date'` and `'reference'`** only.

**Implication.** A user who wants to embed an arbitrary string in a letter just types the string directly in the editor — no braces, no chip. The chip mechanism is reserved for two cases where structure matters: a date (so we can format it consistently and show a date picker) or a reference (so we can link to an observation/audit/letter/rule/policy by id).

**Fix scope.**
1. `src/types/index.ts` → narrow `PlaceholderDef['kind']` from `'text' | 'date' | 'reference'` to `'date' | 'reference'`.
2. `src/lib/letter-placeholders.ts` → `autoPromoteTypedTokens` currently defaults newly-typed `{{tokens}}` to `kind: 'text'`. Change default to `kind: 'date'` (or surface an inline picker on first save asking the user to choose date vs reference). Recommended: default `'date'`, the user can change to reference via `PlaceholderDefEditor`.
3. `PlaceholderPicker.tsx` → remove the `'Text'` tab/option from the kind switcher. Drop the corresponding free-text input.
4. `PlaceholderDefEditor.tsx` → remove "Free text" from `TYPE_OPTIONS`.
5. `PlaceholderChip.tsx` → drop the text-rendering branch. Unfilled chips render with the same dashed amber style; clicking opens the date or reference picker per the def's `kind`.
6. Migration: any existing letter draft with `kind: 'text'` placeholders should auto-upgrade to `'date'` on next save (or warn the user with a toast).
7. i18n: remove `placeholderPicker.kindText` key from both dictionaries.

**Acceptance.** Open Draft New Letter. Type `{{my_ref}}` in the body. Save → reopen → chip is present and clicking it opens a chooser between "Date" and "Reference" only (no "Free text"). The placeholder def editor on the right shows only those two kinds.

---

## Section 2 — Architectural correction: revert calculation-bound editability

The user's hard rule (paraphrased): *"any field whose value drives a calculation must not be user-editable."*

Round 2 introduced `useScaleLabelsStore` (§2.5) for likelihood/impact/frequency labels. The user rejects this for any field that is calculation-bound. The store stays in the codebase for now (no destructive deletion until the next session implements §2 fully) but **its UI surface gets removed and its consumers revert to the canonical i18n labels**.

### 2.1 Calculation-bound enums — REVERT to non-editable

These are **fixed by design** and must not be user-editable in any way (no add, no rename, no delete):

| Field | Type | Where used |
|---|---|---|
| Likelihood (1–5) | `1\|2\|3\|4\|5` | Risk register, risk matrix |
| Impact (1–5) | `1\|2\|3\|4\|5` | Risk register, risk matrix |
| Severity | `'critical'\|'high'\|'medium'\|'low'` | Observations |
| Criticality | similar 4-bucket scale | Audits, observations |
| Priority | `'critical'\|'high'\|'medium'\|'low'` | Audits, observations, advisory, circulars |
| Approval Tier | tier 1 / tier 2 / tier 3 (or whatever the policy store defines) | Policy workflow |
| Article risk-level | similar bucket | Circular articles |
| MonitoringFrequency / AuditFrequency / ReviewCadence | enum (daily, weekly, monthly, …) | Audits, policies, monitoring tasks |
| All status enums | per-entity union | Audits, observations, risks, policies, circulars, correspondence, training |
| ComplianceThreshold | numeric scale | Compliance scoring |

**Action items.**
1. **Delete `useScaleLabelsStore` consumers** (likelihood/impact display, frequency display) and revert their rendering to direct `t(risk.likelihoodLabel.<n>)` style i18n keys. The store file may stay on disk pending §6 of round 4 (RBAC) but with no callers.
2. **Audit every Settings → Lists & Categories table** and remove the rows for: likelihood, impact, severity, criticality, priority, approval tier, status enums, frequencies. Keep the table framework — just hide these specific lists.
3. **`EditableSelect`** must continue to render in **read-only mode** wherever a calculation-bound field needs a picker (so the UI looks the same as the editable selects per §3) — but the Add/Edit/Delete affordances are absent. The read-only mode already exists conceptually; `mode="labels-only"` from round 2 hides Add/Delete but allows label editing — instead introduce or reuse a `mode="locked"` (or `addable={false} editable={false} deletable={false}`) that renders zero CRUD affordances, just the dropdown.

### 2.2 Onboarding pickers — REMOVE from Settings UI (keep code)

User: *"remove any onboarding drop down customs from the settings, but you can keep the UI if there is any."* Translation: hide the onboarding-industry / onboarding-region / onboarding-headcount sections from the Settings → Lists & Categories tab. Keep the stores in code for the future admin/user split (RBAC round, post-§6).

**Action.** In `ListsAndCategoriesSection.tsx`, remove (or feature-flag off) the three `<ListSection>` blocks for onboarding industry/region/headcount. The stores stay; their consumer is the onboarding page itself.

### 2.3 Configurable categories MUST allow deleting seeds

User: *"Why can't I delete the premade departments? Maybe there are too many of them and I want to delete some of the ones that the system has as default. That needs to be configurable."*

**Action.** For these stores **only** (configurable lists, not calculation-bound):
- `department-store`
- `policy-category-store`
- `training-category-store`
- `audit-category-store`
- `risk-category-store`
- `business-unit-store`
- `correspondence-type-store`
- `calendar-event-type-store`
- `sama-letter-type-store`
- `sama-sub-category-store`
- `authority-dept-store`

→ Drop the `isDefault` deletion guard. Allow delete of any entry. Keep the `isDefault` flag for **display** (a "SEED" badge in the Lists & Categories table) but not for enforcement.

**Orphan protection (still needed).** If a category id is referenced by N records, on delete the user should see a confirm modal: *"3 risks reference this category. Delete it anyway? Records will retain the label as text-only."* — same pattern §2.1 of round 2 specified for Bucket C (open string).

**Acceptance.** Open Settings → Lists & Categories → Department. Hit the trash icon on a seed department ("Compliance"). Confirm dialog warns about N referencing records. Confirm. Department is removed from the store. Existing records that referenced it keep showing the raw label string (no crash).

---

## Section 3 — Visual consistency sweep: every dropdown gets the custom UI

User: *"all drop downs have the similar UI. So that consistency across the page and the website lands on. … the priority drop down is your default drop down which feels goofy."*

**Action.** Audit every `<select>` (native HTML) and `<EditableSelect>` and any other dropdown variant in the codebase. Replace native `<select>` with the custom `EditableSelect` component in **read-only mode** (per §2.1) wherever the field is calculation-bound. Where the field is configurable, use full `EditableSelect`.

**Audit script.**
```bash
grep -rn "<select" src/app src/components | grep -v ".test.\|node_modules"
```
Every hit needs to either become `<EditableSelect>` (with the appropriate `mode`) or be flagged in this section as "intentionally native, here's why."

**Known offenders called out in May 8 review.**
- Advisory page (`correspondence/advisory/page.tsx`): the **priority** dropdown next to the **business unit** dropdown — business unit is custom (round 2 ✅), priority is native ❌. Make priority a read-only custom dropdown bound to a hardcoded `['low','medium','high','critical']` list.
- Rules creation modal: priority dropdown is native. Same fix.
- Policy creation modal: approval tier is native. Same fix.
- Observation create modal: severity is native. Same fix.
- Any status pickers: native. Same fix.

**Don't break the read-only contract.** A locked `EditableSelect` must:
- Not show Add Entry button
- Not show pencil/trash icons on rows
- Not allow inline rename
- Render the dropdown trigger and options visually identical to the editable variant
- Accept `value` and `onChange` props as a normal controlled select

If `EditableSelect` doesn't currently support this combination cleanly, refactor it to add a `locked` boolean prop that disables every CRUD affordance.

---

## Section 4 — Department single source of truth (cross-page propagation)

User: *"compliance review page. If we add a department, that corresponding department should be on the store. And it should be represented in the compliance review. And it should appear on all of the corresponding pop up models. From affected departments, to business owners and so much more."*

**Goal.** `useDepartmentStore` is the single source of truth for every department dropdown in the app. Adding a department in Settings → Lists & Categories → Department appears immediately in:

1. Compliance Review per-department cards (`reports/(tabs)/compliance-review/page.tsx`)
2. **Affected Departments** multi-select on:
   - Rules creation modal
   - Rules edit modal
   - Policy creation modal
   - Policy edit modal
   - Observation creation modal
   - Observation edit modal
   - Audit creation modal
   - Audit edit modal
   - Calendar event create modal
   - SAMA letter draft modal (if applicable)
3. **Business Owner** single-select on:
   - Rules creation modal (NEW per user — currently missing)
   - Policy creation modal
   - Risk register
4. Department filter dropdowns on:
   - Compliance Review
   - Risks page
   - Audits page
   - Observations page
   - Training page (already done in round 1)
   - Advisory page
5. RegDocFilterBar department filter
6. Team directory department picker
7. Member detail drawer department field

**Audit script.**
```bash
grep -rn "department\|Department" src/app src/components --include="*.tsx" --include="*.ts" \
  | grep -iE "options|seed|hardcoded|select|<option" \
  | grep -v "department-store\|useDepartmentStore"
```
Every hit that picks departments must read from `useDepartmentStore().departments` (or its seed-aware accessor). No hardcoded arrays. No local copies of department names. No compile-time literal unions.

**Specific user-called-out gaps.**
- Rules creation modal lacks an **affected departments** picker AND a **business owner** picker. Add both, both bound to `useDepartmentStore`.
- Policy creation modal: verify both pickers exist and are wired correctly.

**Acceptance.** Open Settings → Lists & Categories → Department. Add a custom department "Special Projects". Open Rules Create modal — "Special Projects" appears in both Affected Departments multi-select and Business Owner single-select. Save a rule with that owner. Open Compliance Review — a new card "Special Projects" appears with the rule listed under it. Delete "Special Projects" from Settings — the warning surfaces "1 rule references this department"; on confirm, the Compliance Review card disappears, the rule keeps the raw "Special Projects" label.

---

## Section 5 — Framework / sub-category Settings refactor

User feedback (paraphrased):
1. Compliance frameworks (SAMA, CMA, IA, ZATCA, CITC, …) are already configured in Settings → Frameworks via the existing `FrameworkConfigModal`. **Do not** add a "Compliance Framework" dropdown to Lists & Categories — it would duplicate.
2. SAMA sub-category and any other per-framework taxonomy: don't list every framework's sub-categories inline on the Settings page (it would clutter). Instead, surface a single button per framework: *"Configure SAMA sub-categories"* → opens a modal with the sub-category EditableSelect inside it.

**Action.**
1. Remove the "Compliance Framework" row from `ListsAndCategoriesSection.tsx` if one exists. The `framework-config-store` already drives that picker via `FrameworksSection` and `FrameworkConfigModal`.
2. Replace the inline "SAMA Sub-Category" list section with a single row that says "Sub-categories" + per-framework buttons (e.g., "Configure SAMA…", "Configure CMA…"). Clicking opens a modal hosting the EditableSelect for that framework's sub-categories.
3. The existing `useSAMASubCategoryStore` is the right shape — generalize it so each framework gets its own sub-category list, OR keep one store with a `frameworkId` discriminator. Recommended: extend `useSAMASubCategoryStore` to `useFrameworkSubCategoryStore` keyed by `(frameworkId, id)`. Migration: existing sub-category entries get `frameworkId: 'sama'` on the next persist version bump.
4. Letters drafted for non-SAMA authorities (CMA, ZATCA, CITC, etc.) currently might not have a sub-category picker. Either (a) only show sub-category when `authority === 'sama'`, or (b) show whatever sub-category list matches the authority. Decision: (b), per-authority. The picker reads `useFrameworkSubCategoryStore.list(authorityId)`.

**Acceptance.** Open Settings → Lists & Categories. There is no "Compliance Framework" row. The "Sub-categories" row shows one button per enabled framework. Clicking "Configure SAMA…" opens a modal with the SAMA sub-category list. Switching the SAMA letters Authority dropdown to "CMA" and opening the Sub-Category select shows CMA-specific sub-categories (initially empty — the user adds the first one).

---

## Section 6 — Audit checklist for the new session (run BEFORE coding)

The user said *"After auditing the bugs"*. Before writing code, the new session must:

1. **Reproduce every BUG-R3-XX** in §1 against the current build. For each:
   - Confirm the symptom matches the user's report
   - Capture a screenshot or console log
   - If the bug is not reproducible, document why before closing
2. **Run `grep -rn "<select" src/app src/components`** and produce a punch list. Tag each hit as: needs-conversion / intentionally-native / already-EditableSelect.
3. **Run `grep -rn "department" src/app src/components`** filtered for hardcoded option arrays. Produce a punch list of every place that needs to read from `useDepartmentStore`.
4. **Verify the §2.1 list of calculation-bound fields** matches what the codebase uses today. If a field listed there isn't actually calculation-bound, demote it to configurable. If a configurable field IS calculation-bound, promote it.
5. **Reproduce the "Choose Template missing" report (BUG-R3-04)** against a brand-new template. The round-2 commit verified the wiring works for seed templates; the bug must be reproduced against a user-created template specifically. If it can't be reproduced, document and skip.
6. **Smoke-check the framework config**. Confirm `useFrameworkConfigStore` already covers what §5 says (SAMA, CMA, ZATCA, CITC, IA, Sharia Board, Internal). If a framework the user mentioned isn't there, open a sub-task before §5.

Once the audit is captured (a short markdown report appended to the bottom of this file is fine), proceed to code.

---

## Section 7 — Suggested execution order for the new session

1. **§1 bugs first** — they're discrete and unblock the user. Single-agent or two parallel:
   - Agent X: BUG-R3-01 (chip race), BUG-R3-02 (popup clip), BUG-R3-03 (Arabic), BUG-R3-06 (drop free-text)
   - Agent Y: BUG-R3-04 (template select), BUG-R3-05 (letter type → template registry)
2. **§2 reverts** — single agent, sequential. Ordering:
   1. Remove §2.5 scale-labels-store consumers (revert displays to direct i18n)
   2. Hide §2.2 onboarding sections from Lists & Categories tab
   3. Drop `isDefault` deletion guard for §2.3 configurable stores
3. **§3 consistency sweep** — fork-style: produce the `<select>` audit punch list first, then one agent per ~10 hits.
4. **§4 department propagation** — one agent. This is structural; sequence after §3 because it overlaps with the same modals that §3 touches.
5. **§5 framework / sub-category refactor** — one agent. Touches `ListsAndCategoriesSection.tsx` and the SAMA letters page.
6. **Audit + commit + Playwright** — single commit per major section so the user can roll back cleanly if any one section regresses.

---

## Section 8 — File-conflict map

The same shared files round 2 hit will get hit again. The big ones:

- `src/i18n/dictionaries/{en,ar}.json` — every agent. Each agent must add to a unique top-level section. New top-level sections introduced by round 3: `roundThree.*` is fine, or per-feature like `frameworkSubCategory.*`.
- `src/types/index.ts` — §1.6 (kind union narrow) and §5 (framework sub-category type). Sequence to avoid stomp.
- `src/components/ui/editable-select.tsx` — §2.1 (`locked` mode) and §3 (consumers). Land §2.1 first.
- `src/components/settings/ListsAndCategoriesSection.tsx` — §2.2 (remove onboarding), §2.3 (drop default-guard rendering), §5 (sub-category modal launcher). Land in that order.
- `src/app/(dashboard)/correspondence/sama-letters/page.tsx` — §1.4, §1.5, §1.6, §5. Sequence: §1.6 first (type narrow), then §1.4/§1.5, then §5.

---

## Section 9 — What's NOT in scope for round 3

- §3 RBAC matrix from earlier rounds — still deferred. Implement after round 3 user-approves §1–§5.
- Heavyweight editor library (Lexical / Slate / Tiptap) for the chip editor — `InlineChipEditor` is sticking with contentEditable; only the BUG-R3-01 race fix is in scope.
- New translations beyond the keys explicitly added by §1–§5.
- Any change to the calculation engine itself (§2 only changes label-rendering paths; the underlying scale values stay).

---

## Section 10 — Quick reference

- **Last green commit:** `49f3a75` on `main` (May 8 2026).
- **Round-2 closures still standing:** §0 list above.
- **Round-3 scope:** 6 bugs, 3 architectural reverts, a consistency sweep, department propagation, framework sub-category refactor.
- **Round-3 touches a lot of the same files round 2 did.** Be careful with the file-conflict map (§8) and sequence per §7.
- **Calculation-bound fields are not user-editable.** Period. (§2.1.)
- **Departments + categories must be fully editable, including seed deletion.** (§2.3.) With orphan-protection warning, not refusal.
- **Single source of truth for departments.** (§4.)
- **Visual consistency: every dropdown looks identical.** (§3.)

---

## Section 11 — Pre-coding audit report (May 8 2026)

This audit was run before any §1–§5 code changes. Four parallel code-audit agents + Playwright reproduction against `localhost:3000`. Findings below revise the assumptions in §1, §2.1, §3, §4 — read this section before writing any fix.

### 11.1 — §1 bug status (corrected)

| Bug | Plan claim | Audit reality | Critical files |
|---|---|---|---|
| R3-01 | unmount race | **partially fixed** — cleanup `useEffect` (lines 318-330) already uses `queueMicrotask`. Race source is `rebuild()` callback at `InlineChipEditor.tsx:240-246` calling `r.unmount()` synchronously inside the effect that calls `rebuild()` (lines 295-315). Apply the same `queueMicrotask` pattern to lines 240-246. | `src/components/correspondence/sama-letters/InlineChipEditor.tsx:240-246` |
| R3-02 | clipped popup | **confirmed.** Popover lives in `PlaceholderChip.tsx:101-110`, not `PlaceholderPicker.tsx`. `position: absolute`, `w-72` (288px), `top-full mt-1`, sits inside an `inline-flex` chip span inside a `contenteditable` editor. With long tokens the right edge clips. Header has no `whitespace-normal`. Plan's fix (position fixed, raise z-index, widen) is correct — just edit `PlaceholderChip.tsx`. | `src/components/correspondence/sama-letters/PlaceholderChip.tsx:101-114` |
| R3-03 | Arabic strings missing | **confirmed but plan diagnosis is wrong.** `placeholderPicker.*` keys exist in BOTH `en.json:3244-3261` AND `ar.json:3244-3261` with non-empty Arabic strings. The bug is that `PlaceholderPicker.tsx`, `PlaceholderChip.tsx`, `PlaceholderDefEditor.tsx` have **zero `useTranslation`/`t(...)` calls** — every visible string is a hardcoded English literal. Round 2 added the keys but never wired the components. Fix: introduce `useTranslation()` in all three components and replace literals with `t('placeholderPicker.…')`. Specific literal sites listed in agent report: `PlaceholderPicker.tsx:34, 120, 150, 156`, `PlaceholderChip.tsx:94, 133`, `PlaceholderDefEditor.tsx:16, 31, 53, 80`, `letter-placeholders.ts:104-110` (`REF_KIND_LABELS`). | as listed |
| R3-04 | "Choose Template" missing user templates | **confirmed. Mismatch is `status` only, not `type`.** `sama-letters/page.tsx:2740` filters `t.status === 'Active'`. Create form at `:3238` defaults `useState<TemplateStatus>(template?.status \|\| 'Draft')`. `'Active'` is only ever set if user clicks the Active pill at line 3431. Save handler `:612-621` further defaults `'Draft'`. Even seed `tmpl-004` is `status: 'Draft'` and is also invisible. Type is consistent (id form on both sides). Fix: drop the `status === 'Active'` clause OR widen to `t.status !== 'Archived'`. Round-2 §1.G note "wiring is correct" is incorrect — the filter is incompatible with the form default. | `sama-letters/page.tsx:2740, 3238, 3431, 612-621` |
| R3-05 | new letter type missing in template registry | **confirmed in 2 places.** Draft modal Letter Type at `sama-letters/page.tsx:2901-2918` correctly reads `useSAMALetterTypeStore`. But (a) **template create/edit form** at `:3399-3408` is a hardcoded `<select>` with the four seed `<option>` values; (b) **template-list filter** at `:980-990` is the same hardcoded `<select>`. Both must be replaced with EditableSelect bound to `useSAMALetterTypeStore`. | `sama-letters/page.tsx:980-990, 3399-3408` |
| R3-06 | drop free-text | **not fixed; plan terminology is wrong.** The field is `PlaceholderDef.type` not `.kind`. `PlaceholderType = 'text' \| 'date' \| 'reference'` at `types/index.ts:415`. `PlaceholderValue` discriminated union at `:438` includes `{ type: 'text'; value: string }`. `reconcilePlaceholderDefs` at `letter-placeholders.ts:41` defaults new tokens to `type: 'text'`. The "Text" tab is the first entry in `TYPE_OPTIONS` at `PlaceholderDefEditor.tsx:16`. `PlaceholderPicker.tsx:28-37` has the text-input branch. `InlineChipEditor.tsx:270` and `sama-letters/page.tsx:2509, 2641` also fall back to `type: 'text'`. EN/AR `kindText` keys at `*.json:3253` must be removed. (Note: `page.tsx:2464, 2470, 2476, 2591, 2596, 2600` use a separate `kind: 'text' \| 'chip'` discriminator — unrelated text-segment splitter; **leave alone**.) Visual confirmation: the right-panel "Configure Placeholders" toggle in the draft view (screenshot `audit-03-draft-detail.png`) still shows **Free text \| Date \| Reference**. | as listed |

### 11.2 — §2.1 calc-bound list (corrections)

The plan's calc-bound list overshoots. Verified against `compliance-engine.ts`:

| Field | Plan | Reality | Action |
|---|---|---|---|
| Likelihood, Impact | calc-bound | **calc-bound** ✓ — `compliance-engine.ts:168` (`risk.likelihood * risk.impact`) | keep locked |
| Severity | calc-bound | **calc-bound** ✓ — `SEVERITY_WEIGHT:76-81`, `calcObservationClosure:143`, deductions `:337,350,389` | keep locked |
| Status enums | calc-bound | **calc-bound** ✓ — engine branches on status throughout (`:115,143,170,190,264-266,337,363`) | keep locked |
| Priority | calc-bound | **partially calc-bound** — `CIRCULAR_PRIORITY_WEIGHT:242-247` only. Audit/Advisory priority is label-only. | keep locked (one path is enough) |
| Approval Tier | calc-bound | **NOT calc-bound** — engine never reads `approvalTier`; only drives workflow steps. | **demote to configurable** |
| Article risk-level | calc-bound | **NOT calc-bound** — engine reads circular-level `priority`, never article `riskLevel`. | **demote to configurable** (or keep locked for UX consistency) |
| MonitoringFrequency / AuditFrequency / ReviewCadence | calc-bound | **NOT calc-bound** — none referenced in engine. | **demote to configurable** |
| ComplianceThreshold | calc-bound | **NOT calc-bound today** — stored on `FrameworkConfig` but never read by engine. | safe to keep locked, but isn't actually math-bound |
| Criticality | calc-bound | **does not exist** in `src/types/index.ts` (zero hits). | drop from list (likely an alias for severity) |

### 11.3 — §2.1 useScaleLabelsStore consumers

Three import sites; only **one** is a real consumer:
- `src/stores/scale-labels-store.ts` — definition.
- `src/components/settings/ListsAndCategoriesSection.tsx:65` — defensive lazy import, never used in render. Effectively dead reference.
- `src/app/(dashboard)/reports/(tabs)/risks/page.tsx:19, 160-168` — `scaleLabels.getLabel('riskLikelihood'|'riskImpact', n, lang)` wraps the default i18n keys. **The only file that needs reverting.**

### 11.4 — §2.2 onboarding sections

`ListsAndCategoriesSection.tsx`:
- Industry — `<ListSection>` lines **409-420**.
- Region — `<ListSection>` lines **421-432**.
- Headcount — `<ListSection>` lines **433-444**.

Remove or feature-flag all three. Stores stay on disk.

### 11.5 — §2.3 isDefault deletion guards

All eleven stores listed in §2.3 (except `authority-department-store`) guard delete via `filter((x) => x.isDefault || x.id !== id)`. Lines: `department-store:43`, `policy-category-store:62`, `training-category-store:68`, `audit-category-store:59`, `risk-category-store:57`, `business-unit-store:57`, `correspondence-type-store:58`, `calendar-event-type-store:55`, `sama-letter-type-store:62`, `sama-sub-category-store:66`. Plus UI-side disable at `ListsAndCategoriesSection.tsx:223-228`. Both layers must be torn out and replaced with the orphan-confirm modal.

**Flag:** `authority-department-store.ts` exists but has a different shape — **no `remove` action and no `isDefault` field**. Confirm with user before touching; the plan may be referencing a renamed store.

### 11.6 — §3 native `<select>` punch list

**105 native `<select>` hits across 38 files. Zero are intentional.** Top files (full list in agent report):
- `correspondence/advisory/page.tsx` — 7 hits (status/priority/businessUnit/timeframe filters + create modal pickers)
- `correspondence/regulatory-updates/policies/page.tsx` — 5 hits (approvalTier, owner, template — both create + edit)
- `correspondence/regulatory-updates/rules/RegisterCircularModal.tsx` + `EditCircularModal.tsx` — 8 hits (authority, priority, dept, officer)
- `observations/observation-form-fields.tsx`, `observation-filters.tsx`, `edit-observation-modal.tsx` — 8 hits (severity, status, source, assignee)
- `reports/audits/add-audit-modal.tsx` + `edit-audit-modal.tsx` — 8 hits (status, priority, assignee, template)
- `reports/(tabs)/risks/page.tsx` — 7 hits (monitoringFreq, category, status)
- `correspondence/sama-letters/page.tsx` — 7 hits (incl. Choose Template at :2925, type filter at :94, template-list filters at :980, :996; template editor pickers at :1811, :1858, :3399)
- `correspondence/feed/page.tsx` — 5 hits
- Settings sub-components — `UserPreferencesSection.tsx` (5), `PolicyTemplatesSection.tsx` (5), `AuditTemplatesSection.tsx` (6), `FrameworkConfigModal.tsx` (1)
- Team — `team/logs/page.tsx` (3), `team/directory/page.tsx` (1), `edit-member-modal.tsx`, `member-detail-drawer.tsx`, `employee-table.tsx`
- Calendar — `edit-event-modal.tsx`
- Misc — `correspondence/registry/page.tsx` (2), `add/edit-correspondence-modal.tsx`, `RegDocFilterBar.tsx` (4), `PolicyDetailsContent.tsx` (2), `ArticleDetailModal.tsx` (4), `ReviewSchedulePicker.tsx`

**Visual confirmation:** the Draft New Letter modal itself currently uses **native `<select>` for "Regulatory Authority" and "Choose Template"** while "Letter Type", "Sub-Category", "Target Department" are custom `EditableSelect` — proven via Playwright snapshot showing `combobox` (= native `<select>`) at refs e504 and e516.

**Recommendation for §3 execution:** before touching any consumer, add a `locked` boolean prop to `EditableSelect` that disables every CRUD affordance (no Add Entry button, no row pencil/trash, no inline rename) while keeping the trigger and option visuals identical. Then sweep the 105 hits in batches grouped by file.

### 11.7 — §4 department propagation

| Question | Answer |
|---|---|
| `useDepartmentStore` is single source of truth in Compliance Review? | **YES** — `compliance-review/page.tsx:52, 57, 62-74` iterates the store. |
| Rules creation modal — Affected Departments multi-select? | **YES** — `RegisterCircularModal.tsx:241-253` checkbox list reading `allDepartments`. |
| Rules creation modal — Business Owner single-select? | **YES** — line 165 (currently a native `<select>` reading store; needs §3 conversion). |
| Policy creation modal — Affected Departments multi-select? | **NO — MISSING.** `policies/page.tsx:754-849` has no affected-departments picker. Must be added per §4. |
| Policy creation modal — Business Owner department single-select? | **PARTIAL.** Conflated with the team-member `OWNERS` picker (`{name} — {department}`). No independent dept picker. Needs decoupling per §4. |

**Hardcoded department arrays still in code:**
- `observation-form-fields.tsx:13-23` — `departmentKeys` map + exported `departments` array of 7 hardcoded keys. **Must be replaced** with `useDepartmentStore().departments`.
- Seed data in `circular-store.ts:173,242,276,315` and `framework-config-store.ts` (13 sites) — string seeds, acceptable but flag for v2 id-ref migration.

**No `<option value="dept-string">` literal-union dropdowns exist** — search returned 0 hits. The only meaningful gap in JSX is the observation-form-fields export.

### 11.8 — §5 framework / sub-category

- **Regulators** in `framework-config-store.seedFrameworks` — **19 total**: 8 correspondence-based (sama, citc, cma, zatca, misa, safiu, ia, sharia-board) + 11 self-assessment (nca-ecc, ndmo-pdpl, nca-cscc, nca-ccc, sdaia-pdpl, iso-27001, iso-22301, iso-31000, coso-ic, coso-erm, saso). Default pinned: `['sama', 'cma', 'sharia-board']` at line 359.
- **"Compliance Framework" row in Lists & Categories** — **does not exist.** §5 requirement (don't add it) is already satisfied.
- **SAMA Sub-Category inline?** — **YES** at `ListsAndCategoriesSection.tsx:354-364` via `useSAMASubCategoryStore`. Per §5 this needs to become a per-framework "Configure…" launcher modal.
- **`useSAMASubCategoryStore` shape** — flat list `subCategories[]` with `{id, label, labelAr, isDefault}`. No `frameworkId` discriminator. §5 generalisation will need a v2 persist migration adding `frameworkId: 'sama'` to existing entries.

### 11.9 — Audit conclusions

- All 6 §1 bugs reproducible from code inspection alone. Two (R3-01, R3-04) need the plan's fix description revised; one (R3-03) needs the plan's diagnosis revised; the other three match the plan.
- §2.1's calc-bound list overstates by 4 fields and includes one non-existent field. Approval Tier, Article risk-level, the three Frequency enums, and ComplianceThreshold should be demoted; Criticality dropped.
- §3 has 105 hits, not the handful implied by the May-8-review callouts. Add `locked` prop to `EditableSelect` first, then sweep.
- §4 gap is real but smaller than the plan suggests — only the policy-create modal is genuinely missing pickers.
- §5 wiring is already cleaner than the plan assumes (no duplicate framework row exists).
- `authority-department-store` is structurally different from the §2.3 list — confirm scope with user.

Audit complete. Ready to code per the §7 execution order, with the corrections above applied.

---

## Section 12 — Round 3 completion log (May 8 2026)

All §1–§5 work landed across 9 commits on `main`:

| Commit | Phase | Scope | Files |
|---|---|---|---|
| `b0acf13` | §3-prep | Add `locked` prop to `EditableSelect` | 1 |
| `f05579d` | §2 | Scale-labels revert + onboarding pickers removal + isDefault deletion guards drop + orphan-confirm modal in `ListsAndCategoriesSection` | 14 |
| `3f6c4e2` | §1A | InlineChipEditor `queueMicrotask` race fix; `PlaceholderChip` popover → `position:fixed` + dynamic dir + min/max width; i18n wiring in 3 placeholder components; drop `'text'` placeholder kind everywhere | 7 |
| `c75a50b` | §1B | Widen `Choose Template` filter (drop `status === 'Active'`); bind template editor + filter Letter Type to `useSAMALetterTypeStore` (BUG-R3-04, R3-05) | 1 |
| `dbdc5fd` | §3 Group 3 | Native `<select>` → `EditableSelect` in 10 files (settings/team/calendar) | 10 |
| `f3f2966` | §3 Group 1 + §4-obs | Native `<select>` → `EditableSelect` in 9 files (observations/audits/risks/reports); `observation-form-fields` `departmentKeys` array → `useDepartmentStore` | 9 |
| `da6202e` | §5 | `useSAMASubCategoryStore` → per-framework `useFrameworkSubCategoryStore` (v1→v2 migration); per-framework Configure Sub-Categories launcher modals in Lists & Categories; SAMA letters Sub-Category picker is now authority-aware | 6 |
| `8a37ff1` | §3 Group 2 + §4-pol | Native `<select>` → `EditableSelect` in 12 correspondence files; **policy create + edit modals now have Affected Departments multi-select + Business Owner Department single-select** (new fields on `Policy` type) | 13 |
| `8ee7589` | Cleanup | 6 native selects in `sama-letters/page.tsx` missed by §1B (Authority dropdown, Choose Template in Draft modal, list filters, sidebar pickers) | 1 |

**Net stats:** ~62 files changed. Native `<select>` count across `src/app` + `src/components`: **0 remaining**. `npx tsc --noEmit` clean.

### Verified live on localhost:3000
- ✅ §1.A — Draft modal renders with consistent custom dropdowns end-to-end (Authority, Letter Type, Choose Template, Sub-Category, Target Department).
- ✅ §1.06 — Right-panel "Configure Placeholders" no longer shows "Free text" tab; only Date | Reference.
- ✅ §2.2 — Settings → Lists & Categories: no Onboarding Industry / Region / Headcount sections.
- ✅ §2.3 — Trash icon on seed entries no longer disabled (orphan-confirm modal wires through `getReferenceCount`).
- ✅ §3 — Advisory page filters, Risks page MONITORING FREQUENCY, Settings sub-pages, Policy create modal — all use the unified `EditableSelect` styling.
- ✅ §4 — Policy Create/Edit modal renders both **Affected Departments** (checkbox list) and **Business Owner Department** (single-select), both bound to `useDepartmentStore`.
- ✅ §5 — Lists & Categories shows **"Configure SAMA Sub-Categories (9)"**, **"Configure NCA ECC-1:2018 Sub-Categories (0)"**, **"Configure Sharia Board Sub-Categories (0)"** — one launcher per enabled framework. No "Compliance Framework" duplicate row.

### Known follow-ups (out of scope this round)
- **§2.1 calc-bound list corrections.** The plan listed Approval Tier, Article risk-level, MonitoringFrequency / AuditFrequency / ReviewCadence, ComplianceThreshold as calc-bound, but the audit (§11.2) found none of these are actually used in `compliance-engine.ts`. They remain `locked` in the §3 sweep for visual consistency; demote to editable in a future round only if the user needs admin-side configurability.
- **`authority-department-store`** — different shape (no `remove`, no `isDefault`); deliberately skipped per audit §11.5 flag. Confirm scope before touching.
- **§6 RBAC matrix** — still deferred per round-3 §9.
- **`observation-form-fields` team picker (`leadAuthor`, risk `owner`, etc.)** — Group 1 used `locked` mode for these because team membership isn't manageable through inline rename (members come from invites). If the user wants editable team pickers, a "Manage team" affordance needs design work.
