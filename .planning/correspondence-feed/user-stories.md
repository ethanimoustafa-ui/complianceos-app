# Correspondence Feed — User Stories

**Route:** `/correspondence/feed` (landing tab — `/correspondence` redirects here)
**Primary roles:** compliance officer · compliance manager · org admin · auditor · business owner · viewer
**Domain entity:** unified inbox view over `correspondence` (the registry table) plus aggregated read-only references to `circulars`, `sama_letters`, `observations`, `policies`, `training_courses`, `risks`, `team_members`, and `correspondence_types`

## What this page is for

This is the **landing tab** for the entire Correspondence module — `/correspondence` redirects here. It is the daily "inbox" view of every regulator interaction that has hit the org: outbound letters, inbound circulars, observation drafts, advisory threads, internal notes — sorted newest-first with relative-time stamps. Each row must say at a glance: *"what type, what subject, who from, what status, how old, and where do I go to act on it"* — **without opening a detail panel**. The feed is the busiest aggregator surface in the app (~1300 lines), pulling from 9 stores to render: a 4-tile metric strip, a regulatory-tracker section (top 3 active circulars), the correspondence list (with type + active/archived filters), a policy/circulars status panel, a risk heatmap sidebar, a team-capacity panel, and an "Upcoming Submission" stack mixing circulars, letters, and observations. Cross-module navigation flows back through this page constantly — the URL `?id=<correspondenceId>` deep-links into a specific row's detail modal.

## Primary user journeys

### Story 1 — Scan recent correspondence sorted by recency

**As a** compliance officer at the start of the day
**I want to** see every recent piece of correspondence in one chronological list with a relative-time stamp ("just now", "3h ago", "5d ago")
**So that** I know what arrived overnight without opening eight separate modules.

**Acceptance criteria** (every one observable end-to-end):
- Landing at `/correspondence/feed` renders the `correspondenceFeed` section within < 200ms of hydration (the section header is `correspondence.correspondenceFeed`)
- Rows render newest-first using the `date` field (matches the store's default `sort = { field: 'date', direction: 'desc' }`)
- Each row uses the `CommunicationLogItem` component which shows: a directional icon (`lucide:arrow-up-right` for status=`sent`, `lucide:pencil` for status=`draft` or `received`), subject (bold), a body preview line, the relative-time stamp, and the server-minted `reference` after the dash
- Relative-time logic is observable: `< 1h → "just now"`, `< 24h → "Nh ago"`, `< 7d → "Nd ago"`, `≥ 7d → formatted date via `useUserPreferencesStore.dateFormat`
- When `status='draft'` the time slot reads "Draft" instead of relative-time
- The assignee badge ("Assigned to: …") renders below when `assignee` is set
- The section caps at `max-h-[380px]` with internal scroll; a "View All (N)" button at the bottom opens the full feed modal (`isFeedAllOpen`)
- Hard-reload → the same rows return in the same order; no flicker; the `useCorrespondenceStore.fetchAll()` cascade (plus 9 sibling stores) re-hydrates from the server

### Story 2 — Row-level data without opening anything

**As a** compliance manager scanning during the morning standup
**I want to** read every key fact for each feed item — type, subject, from-party, status, reference, age, assignee — directly on the row card
**So that** I don't have to click into 20 modals to triage what needs attention today.

**Acceptance criteria**:
- Each `CommunicationLogItem` shows, in this order (left → right, mirrored in RTL): directional icon avatar, subject (font-bold), body preview (text-[10px]), age + reference line, optional assignee badge, and the action row ("View" / "Archive" or "Unarchive")
- Type is visually encoded by the icon background color: `sent` → blue; `draft` / `received` → slate
- Reference appears as `- REF: <reference>` next to the age, only when the row has a server-minted reference (created via `POST /api/correspondence` returns `reference`)
- The full feed modal (`isFeedAllOpen`) renders the same component, no row-shape divergence between the embedded list and the modal
- All this data is on the **list response** (`GET /api/correspondence`); no per-row `fetchById` is needed to render the row fully
- Hard-reload → every visible field on every row renders identically before any modal opens; no skeleton placeholders flash on already-loaded rows

### Story 3 — Click a feed item to navigate to its detail

**As a** business owner who clicked a notification link
**I want to** click any feed item and have its detail open (either a modal on this page or the source module's detail page)
**So that** I can read the full thread and act without losing context.

**Acceptance criteria**:
- Clicking the "View" link on a `CommunicationLogItem` calls `handleViewLetter(letter)` which sets `selectedLetter`, opens `isLetterDetailOpen`, AND writes `?id=<correspondenceId>` to the URL via `router.replace` (so the state survives reload)
- Hard-reload at `/correspondence/feed?id=<correspondenceId>` re-opens the same detail modal automatically (see Story 4)
- The Regulatory Tracker `CircularRow` items navigate to `/correspondence/regulatory-updates/rules?id=<circularId>` (not the modal — circulars own their own detail page); URL changes; the rules page header renders; hard-reload at that URL keeps the circular pre-selected
- The "Upcoming Submission" panel routes to module-specific URLs per `handleReviewItem(item)`: `registry → /correspondence/registry?id=<id>`, `sama-letter → /correspondence/letters?id=<id>`, `observation → /correspondence/observations?id=<id>` — destination page opens with the item pre-selected
- Closing the detail modal removes the `?id=` param; back-button restores the previous selection state
- Unknown / soft-deleted ids degrade to the unfiltered feed view (no crash, no "Not Found" flash) — the store's `fetchById` returns null on `ApiClientError.code === 'not_found'`

### Story 4 — Deep-link to a specific correspondence

**As a** compliance officer who shared a feed URL with a peer
**I want to** visit `/correspondence/feed?id=<correspondenceId>` and land directly on that item's detail modal
**So that** the shared URL is the contract for what they'll see.

**Acceptance criteria**:
- Visiting the URL with `?id=<id>` runs the `useEffect` that scans `correspondenceStore.correspondence` and auto-calls `handleViewLetter` when a match is found
- The modal header renders **instantly** from the list-row data (`byId[id]` wins, falling back to the array, then to the local `selectedLetter` state) — no "Not Found" flash on freshly-created rows
- Deferred sections (full body, attachments thread) show 3–5 `<Skeleton>` placeholders briefly, then real content — driven by `isDetailLoaded(id)` from the store
- Removing the `?id=` param returns to the unfiltered feed; the modal closes
- Unknown id (or RLS-hidden id) degrades to the list view with no crash; an inline toast may surface the error from `correspondenceStore.error`
- Browser back/forward buttons restore the modal state in lockstep with the URL

### Story 5 — Filter the feed by type (circular / letter / observation / advisory / internal / custom)

**As a** compliance officer focused on SAMA work only this week
**I want to** filter the feed by correspondence type
**So that** I see only what's relevant.

**Acceptance criteria**:
- Two `EditableSelect` filter controls are visible above the list: an **active/archived/all** selector (locked, defaults to "active") and a **type** selector (defaults to "all")
- The type selector enumerates `correspondenceTypes` from `useCorrespondenceTypeStore` — both the seeded defaults (sama / internal / external / cma / etc.) AND any user-added types (see Story 11 vocabulary management) — sorted with defaults first
- Changing either filter re-derives `filtered` synchronously via the IIFE in the section render — no network call needed for client-side filters
- The result count is reflected in the "View All (N)" button label at the bottom (`filtered.length`)
- The full-feed modal (`isFeedAllOpen`) inherits the filter selection and exposes its own copy of the same two `EditableSelect` controls
- Hard-reload → filter state resets to defaults (active + all); this is acceptable for MVP per the open-questions section below
- Empty filtered result renders the `correspondence.noCorrespondence` localized placeholder, not a broken layout

### Story 6 — Filter the feed by framework / authority (cross-module)

**As an** auditor preparing a SAMA inspection brief
**I want to** narrow the feed to only items whose framework/authority matches the org's currently-pinned frameworks
**So that** I export only what the inspector asked for.

**Acceptance criteria**:
- The framework filter reads from `useFrameworkConfigStore` so only the org's pinned frameworks (per `/settings`) appear as filter options
- When applied, the Regulatory Tracker section and the correspondence list both narrow to authorities matching the pinned set (resolved via `resolveAuthorityCode(authority, frameworks)`)
- Pinning an authority on `/settings` and returning to the feed reflects the new pin within < 1s (no manual refresh required — the store is shared)
- An unpinned authority's items still render in the feed but are visually de-emphasized (lower opacity) and have a "Pin authority" affordance on hover
- "Clear filters" restores the unfiltered view including any framework pins applied via the filter bar
- Hard-reload → framework pins persist (stored in DB via `framework_config`); the active filter set re-applies on first paint

### Story 7 — Send a quick reply or draft a new letter from the feed

**As a** compliance officer who just opened an inbound circular
**I want to** click "Log Communication" and send a quick outbound letter without leaving the feed
**So that** the reply is captured in the same registry as the original.

**Acceptance criteria**:
- A "Log Communication" button is visible in the page header, gated by `Manage Audit Findings`
- Clicking opens the New Correspondence Modal (`isNewCorrespondenceOpen`) with fields: Type (`EditableSelect` over correspondence types), To (free-text recipient), Subject, Assigned To (team member picker), Message (textarea)
- Required fields are Subject + To; saving without them surfaces the `correspondence.fillRequiredFields` toast (no save)
- Two save actions: **Send** (sets `status='sent'`) and **Save Draft** (sets `status='draft'`); both call `correspondenceStore.create(...)`
- Each save button shows a busy spinner via `sendBusy` / `saveDraftBusy` and disables the other to prevent double-fire
- After save, the modal closes, a success toast appears, and the new row appears at the top of the feed (the store's `create` does an optimistic `correspondence: [created, ...]` then triggers `fetchAll()`)
- The created row gets a server-minted reference (e.g. `CORR-2026-0042`); the reference appears on the row card per Story 2
- Hard-reload → the new row is still at the top, with its assignee, type, subject, and reference intact
- `audit_logs` records the create event with the actor's user id (per the append-only audit-log pattern)

### Story 8 — Archive / un-archive correspondence

**As an** org admin cleaning up the feed of resolved threads
**I want to** archive a row and have it disappear from the default "active" view, then un-archive when needed
**So that** the active feed stays focused on what's still open.

**Acceptance criteria**:
- Every `CommunicationLogItem` exposes an "Archive" link (or "Unarchive" if already archived) in its action row
- Clicking calls `handleArchive(letterId)` which calls `correspondenceStore.update(id, { archived: !current })` — optimistically flips the flag, then `POST /api/correspondence/[id]/archive` (or `.../unarchive`) persists
- The row disappears from the default "active" filter view immediately (optimistic); a success toast confirms (`correspondence.letterArchived` or `correspondence.letterUnarchived`)
- The "archived" filter view shows the row; the "all" filter view shows both
- Network failure → the row reappears (optimistic rollback per the store's snapshot/restore pattern), and an inline error surfaces via `correspondenceStore.error`
- Hard-reload → archived state persists; the row appears or hides in the same filter view it was in
- The `correspondence` table row has `archived=true`; verifiable in Supabase Studio
- An `audit_logs` row records the archive/unarchive action

### Story 9 — Hard-delete correspondence (and its attachments)

**As an** org admin who logged a duplicate or test row
**I want to** permanently delete a correspondence row
**So that** the registry doesn't have ghost entries.

**Acceptance criteria**:
- The detail modal exposes a "Delete" button gated by `Manage Audit Findings` + the `delete` permission
- Clicking opens a `DeleteConfirmModal` with a strong warning: "This will permanently delete this correspondence, its attachments, and its thread history. This cannot be undone."
- Confirming calls `correspondenceStore.delete(id)` which optimistically removes the row from the feed and calls `DELETE /api/correspondence/[id]`
- An `audit_logs` row records the deletion BEFORE the row is physically removed (so the audit trail survives the cascade)
- Hard-reload → the row is gone from the feed, from search, from the deep-link URL, AND from `correspondence` + `correspondence_attachments` in Supabase Studio (cascade via migration 046 — verified by the implementer via MCP SQL `SELECT * FROM correspondence WHERE id = '<deleted-id>'` returning empty)
- The associated Supabase Storage objects in the `correspondence_attachments` bucket are also removed (per the storage-cascade trigger added in migration 046)
- Failed delete → the row reappears at its original index (the store snapshots `prevIndex` for restore); an inline error surfaces

### Story 10 — Skeleton loading on cold load

**As any** user landing on a fresh tab
**I want to** see skeleton placeholders instead of a flash of empty state while the 10 source stores hydrate
**So that** the page feels alive and I know data is coming, not absent.

**Acceptance criteria**:
- First-fetch detection uses `isLoading && correspondence.length === 0` (per the store's documented contract at the top of `correspondence-store.ts`)
- During cold load, the correspondence section renders 3–5 `<Skeleton>` rows shaped like `CommunicationLogItem`; the regulatory-tracker section renders 3 skeleton `CircularRow`s; the metric strip renders 4 skeleton tiles
- The `useCorrespondenceStore.fetchAll()` is TTL-guarded (30s): back-navigation within 30s skips the network and re-renders from store immediately — no skeleton flash
- Cached visits → no skeleton; rows render instantly from the in-memory store
- Each of the 9 sibling fetches (`fetchCirculars`, `fetchLetters`, `fetchRisks`, `fetchTeam`, `fetchObservations`, `fetchPolicies`, `fetchEmployees`, `fetchCourses`, `fetchCorrespondenceTypes`) renders its own skeleton in its own section — partial-failure tolerant (one store's failure does not block the others)
- Network failure on any single store surfaces an inline retry button in that section only; the rest of the page still renders

### Story 11 — Search across all correspondence

**As a** compliance manager looking for a circular reference she half-remembers
**I want to** type into a search box at the top of the feed and have rows filter live by subject / reference / from-party / body snippet
**So that** I find what I need without scrolling 200 rows.

**Acceptance criteria**:
- A search input is visible above the correspondence filter selectors (placeholder: `t('correspondence.searchPlaceholder')`)
- Typing debounces 300ms then either (a) filters client-side over `correspondence[]` for the current page, OR (b) calls `correspondenceStore.fetchAll({ filters: { search } })` to push the `q` param to `GET /api/correspondence?q=...` for cross-page search
- Search matches against `subject`, `reference`, `from_party`, and `body` (case-insensitive; matches the server `q` param behavior)
- Result count visible: "Showing X of Y matching '<query>'"
- Clearing the input restores the unfiltered feed
- Search state persists in the URL (`?q=<query>`) so a shared search URL renders the same result set on a fresh tab
- Empty result renders the `correspondence.noMatchingCorrespondence` localized placeholder + a "Clear search" affordance

### Story 12 — Manage correspondence-type vocabulary inline

**As an** org admin noticing a missing correspondence type ("Sharia Inquiry")
**I want to** add a new type from the type filter dropdown without leaving the feed
**So that** I don't have to leave the feed to fix a vocabulary gap.

**Acceptance criteria**:
- The type `EditableSelect` exposes `onAdd`, `onEdit`, and `onDelete` callbacks (gated by `Manage Audit Findings`; viewers see the dropdown read-only)
- Adding writes via `POST /api/settings/correspondence-types` and persists to the `correspondence_types` lookup table; the new entry immediately appears in the dropdown
- The new type also appears in the New Correspondence Modal's type picker and in any other module that lists correspondence types (read from the shared `useCorrespondenceTypeStore`)
- Editing updates `label` + `labelAr` (Arabic localization required)
- Deleting an in-use type asks for confirmation; choosing "block" prevents the delete; choosing "reassign to <fallback>" updates affected rows in a single transaction
- Default types (`isDefault: true`) cannot be edited or deleted by anyone
- Hard-reload → the new/edited type persists; deleted types are gone; rows referencing a soft-deleted type fall back to "Uncategorized"

### Story 13 — RTL (Arabic) support

**As an** Arabic-speaking compliance officer
**I want to** the feed to mirror cleanly when language is switched to Arabic
**So that** I can read the page natively without layout breakage.

**Acceptance criteria**:
- Switching language to AR (via the language switcher) sets `isRTL=true` from `useTranslation()`
- The page header buttons (`logCommunication`, tab pills) flip order: icon on the right, label on the left
- The `CommunicationLogItem` flips: directional icon on the right; subject + body preview on the left; action row right-aligned
- The Regulatory Tracker `CircularRow` mirrors: title block on the right, due/status block on the left
- Relative-time strings render in Arabic ("منذ ٣ ساعات", "منذ ٥ أيام") via the `correspondence.hoursAgo` / `correspondence.daysAgo` translation keys with Arabic-Indic digits respected
- The "View All →" arrow flips to "← View All" in RTL (per `isRTL ? '←' : '→'`)
- Correspondence types render their `labelAr` field when AR is active (not `label`)
- Hard-reload at AR language → entire page renders RTL on first paint with no LTR flash

## Edge cases the page should handle

- **Empty state**: a brand-new tenant with no correspondence shows the `correspondence.noCorrespondence` panel in the list section AND the 4 metric tiles render at zero (not "loading…")
- **Polling for new items**: MVP uses **poll-on-mount only** — the `useEffect` cascade fires once per navigation; no live websocket / Supabase Realtime subscription. The 30s TTL guard in `fetchAll` prevents thrash. (See open question on live polling.)
- **Partial store failure**: one of the 10 fetches failing (e.g. `risks` returns 500) renders that section's error state but the rest of the page continues to function — `Promise.all` is **not** used; each fetch is independent `void fetch...()`
- **Mutation in flight**: Send / Save Draft / Archive / Delete buttons disable via `sendBusy` / `saveDraftBusy` / `archiveBusy` flags; double-click is impossible; an `aria-busy` attribute is set
- **Network failure on optimistic mutation**: the store's snapshot/restore pattern rolls back the row to its prior state, the original position in the list, and surfaces an inline error
- **RBAC**:
  - viewers see the feed, can open detail modals, can navigate, but cannot create / archive / delete / manage types (buttons hidden via `Gate perm="..."`)
  - business owners can archive items assigned to their department but cannot delete
  - compliance officers + managers can create, archive, edit, manage types
  - org admins can delete + manage all vocabulary
- **RTL**: full RTL parity — every flex container has its direction respected; the modal close button moves to the left; the type/active filter selectors flip
- **Deep-link to a hard-deleted correspondence**: shows a "Not found" inline panel in the detail modal + a link back to the unfiltered feed
- **Soft-deleted correspondence (if ever introduced)**: filtered out by RLS at the API layer; the feed never shows them
- **Very long subjects** (> 80 chars): truncate with ellipsis on the row card; full subject visible in the detail modal
- **Time-zone drift**: relative-time uses `new Date(letter.date)` parsed in the user's local TZ; the server stores UTC; the relative-time stamps update on each render (no live ticker for MVP)

## Out of scope for this page

- **Creating circulars, letters, observations, advisory threads, policies, training courses, or risks** — each module owns its own create flow with its own field set + workflow (the feed only creates entries in the unified `correspondence` registry table)
- **Real-time push** of new items via Supabase Realtime — MVP is poll-on-mount only; live-poll is documented as an open question below
- **Full-text search across attachment file contents** — the `q` param matches metadata (subject/reference/from/body), not the PDF body bytes
- **Export per-row PDF** — bulk CSV export only via `exportCorrespondenceLocalized`; per-row PDF lives in the source module (e.g. letters → `/api/letters/[id]/pdf`)
- **Cross-tenant feed views** — single-tenant MVP per the HANDOFF constraint
- **Email/SMS notifications of new feed items** — in-app `notifications` rows only; email needs SMTP integration deferred post-pilot
- **Bulk archive / bulk delete** — single-row operations only for MVP

## Open questions

- **Live polling**: should the feed live-poll every N seconds (cheap server query) OR subscribe to Supabase Realtime on `correspondence` (more expensive, requires RLS-aware filtering)? Currently poll-on-mount only.
- **Date format precedence**: when a user's `useUserPreferencesStore.dateFormat` says `DD/MM/YYYY` but the authority (e.g. SAMA) prefers `YYYY-MM-DD`, which wins on a row authored by that authority? Currently user-preference wins.
- **Type-deletion semantics**: when deleting a correspondence type that has 200 rows referencing it — block, soft-delete the type with a ghost label, or force a reassign to another type? Currently soft-delete to "Uncategorized" is the proposed default.
- **Cross-module feed search scope**: should `?q=...` search ONLY the `correspondence` table, OR fan out across `circulars` + `sama_letters` + `observations` to find any matching entity (and surface a heterogeneous result list)? Currently scope is `correspondence` only.
- **Sticky filter state**: should the `correspondenceFilter` (active/archived/all) + `typeFilter` persist across navigations (in localStorage or as URL params) or reset on every page load? Currently resets.
- **Deep-link target ambiguity**: when an item id collides across tables (theoretical — UUIDs make this practically impossible, but the type prefix could be embedded), how does the feed disambiguate? Currently the `?id=` param is assumed to target a `correspondence` row only; circular / letter / observation deep-links use their own module URLs.
- **Read receipts**: should the feed track which user has "seen" each item (per-user unread badge) or only org-wide status? Out of scope for MVP; would need a `correspondence_read_receipts` table.
- **Threading**: the store has `thread_id` plumbing but the feed currently renders each row independently — should replies collapse under their parent in the list view, or stay flat-sorted by date? Currently flat.
