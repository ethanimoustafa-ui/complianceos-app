# Correspondence Registry — User Stories

**Route:** `/correspondence/registry`
**Primary roles:** auditor · compliance officer · compliance manager · business owner · org admin (read-only audience)
**Domain entity:** unified, **read-only** shelf view over `circulars` (regulator-issued rules) + `policies` (internal documents). Hydrates from `useCircularStore` + `usePolicyStore`. No writes.

## What this page is for

This is the single shelf an auditor opens when they ask *"show me everything that governs how you operate"*. It surfaces every active circular and every active policy side-by-side, with enough row-level data (reference, type, category/authority, status, phase, due date, progress) that you can answer most questions **without opening anything**. Clicking a row opens a lightweight preview drawer; the preview's "View Full Detail" CTA jumps to the source page (`/correspondence/regulatory-updates/rules` for circulars, `/correspondence/regulatory-updates/policies` for policies) with the item pre-selected. The page is intentionally **read-only** — creation, editing, workflow, attachments, and deletion all live on the dedicated module pages. Whenever a story below mentions a "write" action, it is *out-of-scope* and called out in the §Out-of-scope section.

## Primary user journeys

### Story 1 — Browse every circular and policy in one shelf

**As an** auditor preparing a regulatory inspection
**I want to** see every registered circular and every registered policy in a single unified table
**So that** I can sample the registry to spot gaps without bouncing between two module pages.

**Acceptance criteria** (every one observable end-to-end):
- Landing at `/correspondence/registry` renders one combined table whose rows are *both* circulars (rendered from `useCircularStore.circulars`) and policies (rendered from `usePolicyStore.policies`) — interleaved, not separated into sub-tabs
- On first mount the page calls `fetchCirculars()` + `fetchPolicies()` in parallel (per `useEffect` at `page.tsx:49–52`); two store hits, one render
- The header reads "Regulatory Requirements" with a subtitle "comprehensive list", a back-arrow to `/correspondence/feed`, and two quick-jump pills linking to `/correspondence/regulatory-updates/rules` and `/correspondence/regulatory-updates/policies`
- The row footer reads `<N> items` where N is the count of currently visible rows (post-filter)
- The page is read-only: **no** "Register", "Add", "Edit", "Delete", "Advance", or "Upload" buttons anywhere on this view — only "View" (eye icon) per row
- Hard-reload → the same rows in the same order; no flicker; no skeleton on already-cached stores (TTL-guarded fetch)

### Story 2 — Distinguish a circular from a policy at a glance

**As a** compliance officer scanning the registry
**I want to** instantly tell which rows are regulator-issued rules versus internal policies
**So that** I don't confuse "what the regulator demands" with "what we wrote ourselves".

**Acceptance criteria**:
- Each row has an **Item Type** column with a coloured chip: emerald `Rule / Circular` for `kind === 'rule'`, blue `Policy / Procedure` for `kind === 'policy'`
- A circular row shows the authority (SAMA / CMA / IA / ZATCA / Sharia Board) in the **Category** column; a policy row shows the policy category (compliance / it / operations / risk / hr / finance) in the same column
- A circular row's **Phase** column shows the current workflow phase chip (CAP / Corrective Action Plan / Remediation) with phase-tinted colour; a policy row shows `—` (no workflow phases for policies)
- A circular row's reference is the server-minted code (e.g. `SAMA-CIR-2026-0006`); a policy row's reference falls back to `policy.id`
- Each row's status chip uses a kind-aware palette: circular statuses (`pending` / `in-progress` / `completed` / `overdue`) and policy statuses (`draft` / `under-review` / `approved` / `expired`) all render with the right colour (per `registryStatusColors`)
- The translated labels follow the active locale (`statusLabels` / `categoryLabels` maps); switching to AR re-renders all chips in Arabic

### Story 3 — Read each shelf item's key facts from the row, without opening anything

**As a** compliance manager doing a morning sweep
**I want to** see reference, title, type, category/authority, phase, status, due date, and progress for every item on its row
**So that** I can identify what's overdue or off-track in 30 seconds.

**Acceptance criteria**:
- The table columns, in order, are: Reference (mono font, slate-500) · Name (line-clamp-2, bold) · Item Type · Category · Phase · Status · Due Date · Progress · Actions
- The **Progress** column renders a slim bar (`bg-emerald-500` fill on `bg-slate-200` track) + the percentage number to two characters' width on the right
- Progress for circulars is computed from workflow steps: `Math.round(completedSteps / totalSteps * 100)` (per `page.tsx:98–100`)
- Progress for policies is a rough heuristic: `approved → 100`, `under-review → 50`, else `25`
- The **Due Date** column renders the raw date string or `—` when absent; **overdue dates render in rose-600 inside the preview drawer** (see Story 5)
- The current circular phase is resolved by `workflowSteps.find(s => s.status === 'current')` and falls back to `(lastCompletedStep.phase + 1)` clamped to 2 — never crashes if no `current` step exists
- All this data comes from the **list response** of each store (`useCircularStore.circulars`, `usePolicyStore.policies`); no per-row `fetchById` happens during the table render
- Hard-reload → every cell renders identically before any preview opens

### Story 4 — Filter by type, status, and search

**As a** business owner who only cares about SAMA circulars that are in-progress
**I want to** narrow the shelf with a type filter, a status filter, and a free-text search box
**So that** the table only shows the rows I need.

**Acceptance criteria**:
- Above the table, the filter card holds three controls: a search input (left), a Status `EditableSelect` (middle), and a Type `EditableSelect` (right) — `locked` so users pick from the closed enum (per `page.tsx:226–258`)
- Search matches case-insensitively against `row.name` OR `row.reference` (per `filteredRegistryRows`)
- The Status selector lists `pending`, `in-progress`, `completed`, `overdue` (circular statuses) + `draft`, `under-review`, `approved`, `expired` (policy statuses) + a top "All Statuses" option that clears the filter
- The Type selector has three options: `All Types`, `Rule / Circular`, `Policy / Procedure`
- Setting any filter immediately reduces the rendered rows (no apply button); clearing returns the full set
- When the result set is empty, the table body shows a centred "No results" placeholder spanning all 9 columns (per `page.tsx:333–337`)
- The `<N> items` footer counter updates live to match the filtered count
- Filters do not persist across reloads (acceptable for v1; see §Open questions)

### Story 5 — Click a row to preview without leaving the page

**As an** auditor scanning many items
**I want to** open a quick preview pane for any row that surfaces the most important details — without losing my scroll position in the registry
**So that** I can triage 20 items in a minute, then deep-dive only the suspicious ones.

**Acceptance criteria**:
- Clicking the eye icon in the **Actions** column sets `previewRow` and opens a centered modal panel (max-width `md`, max-height 85vh, glass shadow, slate-900/30 backdrop with `backdrop-blur-sm`)
- The header shows: the row's `reference` (mono, slate-400) on the first line, the `name` (bold, leading-snug) on the second, and a row of chips below: type chip (emerald/blue), status chip (kind-aware colour), and phase chip (only when `phaseNumber >= 0`)
- The body shows a progress bar (with overdue rows tinted rose), then key-value rows: Category, Due Date (rose-600 if past), and **kind-specific rows** — policies surface Owner / Version / Next Review; circulars surface CAP Deadline (rose-600 if past) + Article count
- A description block (line-clamp-4) appears when the underlying `Circular` or `Policy` has a `description`
- The preview reads from the byId map first, then falls back to the list (`page.tsx:144–158`) — no "Not Found" flash on freshly created rows
- Clicking the backdrop OR the × button closes the preview; the registry scroll position and active filters are preserved exactly (no remount of the table)
- Hard-reload while the preview is open → preview closes (state is in-memory only); the registry re-renders at the top

### Story 6 — Jump from preview to the source page with the item pre-selected

**As a** compliance officer who spotted an overdue circular in the preview
**I want to** click "View Full Detail" and land on the rules-page with that circular already opened
**So that** I can advance its workflow without searching for it again.

**Acceptance criteria**:
- The preview footer has a single emerald primary button: "View Full Detail" with a directional arrow (`lucide:arrow-right` LTR / `lucide:arrow-left` RTL)
- For a circular row, clicking calls `setSelectedCircular(previewItem as Circular)` then `router.push('/correspondence/regulatory-updates/rules')`; the rules page mounts with that circular pre-selected and its detail panel open
- For a policy row, clicking calls `setSelectedPolicy(previewItem as Policy)` then `router.push('/correspondence/regulatory-updates/policies')`; the policies page mounts with that policy pre-selected
- The destination page renders the **same** data the preview showed (description, authority/category, due date, progress) — no contradiction between surfaces
- Browser **back** returns to the registry with filters preserved (Next.js router cache holds the page tree); the preview is closed, the table scroll is at the top (acceptable v1 trade-off)
- The button does nothing (no nav, no crash) if `previewItem` failed to resolve from either store — `openFullDetail` guards with `if (!previewRow || !previewItem) return`

### Story 7 — Skeleton loading on cold load and graceful empty state

**As a** new user opening the registry for the first time
**I want to** see a loading placeholder while the stores hydrate, then an empty-state message if my tenant has no items yet
**So that** I'm never staring at a half-rendered table.

**Acceptance criteria**:
- On first navigation, `fetchCirculars()` + `fetchPolicies()` run in parallel; while either is pending, the page renders the filter card immediately (no skeleton on controls) and the table body shows skeleton placeholder rows (≥5)
- Once both fetches resolve, the skeletons swap for real rows in a single render — no progressive flicker between the two stores
- For a fresh tenant (both stores returned `[]`), the table body shows the existing "No results" placeholder (per `page.tsx:333–337`), and the footer reads "0 items"
- The two quick-jump pills (rules / policies) remain clickable even when the registry itself is empty
- Network failure on either store does **not** blank the whole page — the other store's rows still render; an inline error band appears above the table; the user can retry by hard-reloading (no manual retry button in v1)
- Hard-reload after a successful hydrate → the TTL-guarded `fetchAll` short-circuits; the table renders from store cache in <100ms without a skeleton

### Story 8 — Render correctly in Arabic / RTL

**As an** Arabic-speaking compliance officer
**I want to** the registry to mirror itself for right-to-left reading and translate every chip / column header / placeholder
**So that** the page is usable in Arabic without visual hacks.

**Acceptance criteria**:
- When `isRTL` is true the root container gets the `rtl` class (per `page.tsx:177`); the table columns visually reverse order; the back-arrow in the header swaps to `lucide:arrow-right`
- The search input's icon swaps sides (`right-3` vs `left-3`) and padding mirrors (`pl-8 pr-4` in RTL); placeholder text is translated via `t('common.searchRecords')`
- Every column header pulls from `t(...)`; every chip label uses the `statusLabels` / `categoryLabels` translation maps; switching locale at runtime re-renders without a refresh
- The preview drawer also gets the `rtl` class on its panel (per `page.tsx:357`); the header text aligns right; the "View Full Detail" button's arrow swaps direction
- Numbers (percentage, item count) stay in Western digits (acceptable v1; localized digits deferred)
- Hard-reload in `?lang=ar` → all of the above survive

## Edge cases the page should handle

- **Empty state**: fresh tenant shows the existing "No results" row spanning all columns; counter reads "0 items"; quick-jump pills remain usable
- **Loading state**: skeleton rows in the table body while either store is hydrating; filters above the table remain responsive
- **Mixed populated/empty**: if circulars succeed but policies fail (or vice versa), only the successful set renders; an inline error band appears above the table
- **Stale store cache**: TTL on each store's `fetchAll` means repeat visits within 30s skip the network; if a sibling page just mutated a circular/policy, the registry may show stale data until next fetch — acceptable for an MVP read-only view
- **Deleted item from another tab**: if a row's underlying record was hard-deleted on another module page, opening the preview falls back to the list snapshot (no "Not Found" flash, but stale); navigating to source page may then show a "Not found" panel — acceptable
- **Filters reducing to zero**: "No results" placeholder; footer reads "0 items"; filters remain settable
- **Very long titles / Arabic titles with mixed scripts**: row's name column is `line-clamp-2`; preview drawer shows `leading-snug` and never truncates the title
- **Circular with no workflow steps**: progress = 0%; phase falls back to phase 0 (`CAP`) without crashing (per defensive resolution in `page.tsx:93–96`)
- **Policy with no `nextReviewDate`**: due-date cell renders `—`; preview's "Next Review" row is omitted (per conditional render)
- **Network failure on `setSelected*` then nav**: the destination page handles unknown selection by closing its detail panel — registry is no longer at fault
- **RBAC**: any user with `correspondence:read` permission can view the registry; the page does **not** gate anything (it has no writes); zero-permission users hit the dashboard middleware redirect before reaching the page

## Out of scope for this page

- **Any write action** — register, edit, delete, advance workflow, upload PDF, assign business owner, add article, set deadline, comment. All of these live on the source pages (`/correspondence/regulatory-updates/rules` and `/correspondence/regulatory-updates/policies`)
- **Promoting a circular to a policy** (no such write exists today; would belong on the rules page if introduced)
- **Creating a related/derived policy from a circular** (not modeled)
- **Cross-linking circulars to policies** (deferred; would need a junction table)
- **Bulk export of the unified registry** — *deferred from v1*. Each module page has its own localized export (`exportRulesLocalized`, similar for policies). A unified registry CSV/PDF export is **out-of-scope** for v1 — use the per-module exports; see §Open questions
- **Framework / authority / department / owner filters** beyond the three controls listed in Story 4 — **deferred to v2** per HANDOFF.md scope (the current implementation has only search + status + type)
- **Sorting columns** — table renders in the natural store order (circulars then policies, each in store-fetch order); column-header sort is deferred to v2
- **Pagination** — v1 renders all rows in one table (acceptable while N < ~200); pagination is deferred. If a tenant grows past that, add the same `paginate(filtered, currentPage, PAGE_SIZE=20)` pattern used on the rules page
- **Snapshot-at-date** for inspectors (freeze the registry as of a chosen day) — see §Open questions
- **Adding letters, observations, audits, or risks** to the shelf — registry is intentionally scoped to circulars + policies only
- **Inline-editable cells** of any kind — even where a column shows a status chip, the chip is **not** a control on this page

## Open questions

- Should the registry include `sama_letters` (regulator correspondence) or stay scoped to circulars + policies? Auditors often ask for letters too
- Should we add framework / authority / department filters now, or keep the registry minimalist until users complain? (HANDOFF doesn't commit either way)
- Sortable column headers — ship in v1 or wait for the first usability complaint?
- Should auditors get a "snapshot at date" affordance (freeze the registry view as of a chosen day for inspection prep)? Would require a `registry_snapshots` table or on-the-fly historical reconstruction from `audit_logs`
- Unified registry export — CSV vs PDF, single combined file vs side-by-side sections? Block of work that needs a small PR of its own; not v1
- Should the preview drawer be a slide-over (right edge / RTL-aware left edge) instead of a centered modal? Centered modal works but loses the spatial cue of "you're still on the registry"
- Should browser **back** from the rules/policies page return to the registry with the previous preview re-opened, or just to the registry table? V1 returns to the table only
- When a circular and a policy share a reference prefix (e.g. both start `POL-`), should the type chip be promoted to the **first** visual element on the row for faster disambiguation? Or is the existing left-side reference + middle type chip enough?
