# FORENSIC — Why the Rules page kept manifesting the same bug family

Meta-analysis across Waves 3–16 of `qa-walkthrough.md`. Not a per-bug retrospective —
the recurring **root-cause patterns** that made "looks correct in the UI, gone after a
hard refresh" (and its cousins) resurface wave after wave. Read §3 and §5 before porting
this page's patterns to policies / observations / letters.

---

## 1. Pattern catalogue

**P1 — Read-path hydration gap.** The server persists the data and the GET returns it,
but the client row-mapper doesn't hydrate that field from the response — or a
`previous?.x` fallback masks the missing read.
→ Bug 5, Bug #3, Bug #4, HANI-1, GAP-17. *(Also the amplifier of every other pattern — see §3.)*

**P2 — Zod `.default()` leaks through `.partial()` into the UPDATE path.**
`UpdateSchema = CreateSchema.partial()` keeps inner `.default()`s; a PATCH that omits a
field gets the default injected and writes it, clobbering real data.
→ Bug 2 (progress → 0 on edit), HANI-3 (departments + framework_ids wiped by a PDF upload).

**P3 — "Clear a field" never reaches the DB.** The client omits emptied optional fields
(or sends `""`, which `min(1)` rejects), so the PATCH never carries the key and the
column keeps its stale value.
→ Bug #5 (clear URL doesn't null), GAP-3, GAP-4.

**P4 — Parent/child parity gap.** A capability built for the circular level was never
mirrored to the article/implementation level — or a UI surface was built with no API
behind it.
→ GAP-1 (CAP/Remediation upload UI, zero API route), GAP-11 (circular versions written,
article versions not), GAP-19 (article had a Version-History tab, circular didn't).

**P5 — Divergent / duplicated write paths for one action; one of them is lossy.**
The same user action is served by different code depending on context, and the paths
don't agree.
→ W15-4 (first PDF via legacy `pdf_url`, no filename; later PDFs via the attachments
table, with filename), GAP-10 (Edit modal always PATCHes all 12 fields), GAP-12
(client-computed `sort_order` trusted over the server's authoritative `MAX+1`).

**P6 — Write-side message not derived from a true before/after diff.** Activity/version
text reflected "what was sent" or a hardcoded constant, not "what actually changed."
→ GAP-2 (hardcoded `"Circular updated"`), GAP-7 (lists every field in the payload),
GAP-13 (no field-level Field/From/To diff).

**P7 — Retroactive / lifecycle gap.** A new write-path behavior fixes future rows, but
nothing reconciles rows that already exist or entities that never get re-touched.
→ GAP-18 (applicability only flips inside `recomputeCircularProgress`; idle circulars
stayed `pending`), W15-3 (Wave-14 `{k,p}` translation applied only to new rows; legacy
English activity rows never translated).

**P8 — Optimistic temp-id used before server-UUID reconciliation.** A child mutation
fires before its parent's create resolves and PATCHes a client temp id → Postgres
rejects the non-UUID → 500 (the retry "works" because the id reconciled meanwhile).
→ Bug 6 (inline checklist `nanoid` → 500), GAP-20 (fresh-creation first checklist toggle → 500).

**P9 — "Reported-green probe vs. broken-handler" regression.** A test (vitest unit OR
HTTP probe) reports clean while the actual mounted route returns 500 / HTML error
page, OR a UI component crashes on mount. Caused by the test exercising a helper
function in isolation rather than the route, OR asserting only "non-500" so a 500
silently passes, OR mocking the rendering layer. **Twice in the same week** —
escalates from "pattern" to "discipline failure."
→ W17.2 (child-route tautology), W19.6-BUG-1 (workflow/undo cursor-semantics + 500
risk), W19.7-BUG-1 (`useSyncExternalStore` infinite loop crashed Settings on mount).
Fix: every probe MUST hit the actual mounted HTTP route; every non-2xx assertion
MUST name the SPECIFIC expected code (`401` / `403` / `409` / `412`); every UI
surface MUST RENDER the component in the smoke test, not just import its module.

*Not a pattern:* GAP-15 (timeline newest-first + Load More) was a genuine feature gap,
not a recurring root cause — listed for completeness only.

---

## 2. Most-instructive example per pattern

- **P1 → GAP-17.** `mapImplementationRow` did `versions: previous?.versions` with no read
  of `row.versions`. Fix: read the nested embed first, fall back to `previous` only when
  absent, default `?? []` — the GET embed is now authoritative.
- **P2 → HANI-3.** `departments: z.array().default([])` survived `.partial()`; a `{pdf_url}`
  PATCH injected `departments: []`. Fix: default-free Update schema + raw-body
  key-presence gate so an unsent array column is never written.
- **P3 → GAP-4.** Emptied Reference URL was dropped from the payload. Fix: client
  `toUpdatePayload` sends explicit `null` for cleared fields; schema `.nullable()`; the
  route lets `null` through (only `undefined` is skipped).
- **P4 → GAP-11.** The circular PATCH wrote `circular_versions`; the implementations
  PATCH route simply never did. Fix: mirror the per-field-diff + version-write block into
  the article route.
- **P5 → W15-4.** First PDF went through legacy `setPdfUrl` (`pdf_url`, no name); the rest
  through `circular_pdf_attachments` (with name). Fix: route every upload through the one
  attachments flow.
- **P6 → GAP-7.** Timeline title listed `Object.keys(update)` (the whole edit form). Fix:
  snapshot the row `before`, diff field-by-field `after`, name only changed fields.
- **P7 → GAP-18.** The applicability flip was correct *going forward* but never ran on
  existing rows. Fix: a one-time backfill migration (051) — the code needed no change.
- **P8 → GAP-20.** Child mutations PATCHed a not-yet-reconciled temp id. Fix: an
  `isPersistedId` UUID guard — child calls skip/await until parent + item are real UUIDs.
- **P9 → W19.6-BUG-1.** The `tests/probes/workflow-undo-reset.ts` probe DID hit the
  mounted route + asserted specific status codes (200/412) — but it only counted
  completed steps, never the cursor flip. The "completed count -1" invariant
  trivially passed whether the handler dual-flipped (correct) or just popped the
  step to pending (wrong). On top of that, the W17.2 atomic-on-parent guard was
  miswritten as a no-op `.eq('circular_id', circularId)` on the step UPDATE — a
  tautology that silently lost the parent-token race. Fix: assert the dual-flip
  state shape directly (`promoted step is 'current'`, `previously-current step is
  'pending'`, `exactly one 'current' after undo`) AND rewrite the parent guard as
  a conditional UPDATE on `circulars.updated_at` that returns 0 rows → 412 when
  the token doesn't match. The probe now exercises both invariants.

---

## 3. Why the same pattern kept reappearing — the part Hani must internalise

**A. Optimistic UI is a bug-concealer.** P1, P2, P3 and P8 all produce "the UI looks
right." The optimistic update renders the intended end-state from *local* state, so a
broken read or write path is invisible until a hard reload + DB check. Early-wave QA
didn't hard-reload, so these bugs *shipped green*. The "looks correct, gone after
refresh" signature is not many bugs — it is one verification gap exposing many causes.
Hard-reload + `SELECT`-from-DB only became standard QA mid-project; that single change
caught more than any code fix.

**B. Architectural patterns were retrofitted route-by-route, never swept exhaustively.**
`cache:'no-store'` (W3), per-field diff (W7/9), the `optimisticMutation` helper (W11),
the `{k,p}` timeline payload (W14), the `recomputeCircularProgress` call-sites (W12) —
each was introduced *mid-project* and then had to be applied to ~17 API routes / every
mapper / every writer **individually**. Every subsequent wave found another un-migrated
site. P4 (parity gap) and P7 (retroactive gap) are the literal fingerprints of an
incomplete fan-out. A pattern isn't "done" when the helper exists — it's done when every
call site is migrated and a grep proves it.

> **Closed loop, Wave-19.3 (Policy port):** the exact same pattern recurred on
> Policy — `mapPolicyRow`'s `previous?.activityLog ?? []` / `previous?.versionHistory ?? []`
> fallbacks dropped the GET's nested arrays whenever a list response (which
> omits the embed) overwrote a previously-hydrated row. Same mapper-drop, fresh
> entity, no grep sweep was done at port time. The standing remediation is now
> codified as a hard pre-component-work step in `PORTING-TEMPLATE.md §1.6.a`.

> **Closed loop, Wave-19.5 (per-branch-within-a-file fan-out):** P6 recurred at
> sub-file granularity — Wave-19.4 / Item-3 migrated the Policy PATCH handler's
> version writer to `renderBilingual` but left the activity-log writer in the
> SAME handler composing `text_en` / `text_ar` from raw DB column names. The
> fan-out failed *within one route file*, not across files. Even "sweep every
> call site" isn't enough if "site" means "file" — it has to mean "branch."

> **Re-recurring pattern — P9 (Wave-19.6 + 19.7):** P9 fired TWICE in one week:
> first when the workflow/undo probe reported green while the handler shipped
> a broken cursor model and a no-op atomic-token guard; second when the Settings
> page crashed on mount with a Zustand `getSnapshot should be cached` loop that
> NO probe surfaced because there was no UI smoke test that actually rendered
> the component. The lesson escalates from pattern to **discipline failure**:
> "every probe hits the mounted route AND asserts the specific status code"
> isn't optional, and "every UI surface gets a render-mounting smoke test"
> needs to become a porting-template entry, not a wave-by-wave reminder.

**C. Three-layer fan-out with hand-kept parity.** The same logic lives in 2–3 layers —
Zustand store ↔ API route ↔ Postgres — and must be kept identical *by hand*. The progress
formula existed in both `recalcProgress` (client) and `recomputeCircularProgress`
(server) and drifted across W5/6/9/12. The nested-children bug was fixed at the **server**
layer (Bug 5: GET wasn't selecting them), resurfaced at the **client** layer (HANI-1: the
mapper dropped them), then the client fix **regressed** (GAP-17) — one bug, three layers,
three waves. A fix at one layer is not a fix.

**D. The failure modes are silent by construction.** P2/P3 hinge on the Zod
`.default()`/`.partial()` interaction, which throws no warning and no type error. P5's
two upload paths both compiled cleanly. Nothing fails loudly — so every instance had to
be hit by a human before anyone knew it existed. The same `.default()` leak recurred for
`progress`, then `departments`, then `framework_ids` because the first fix was treated as
a one-off, not "sweep every `.default()` in the Create schema."

**E. Diagnosis and fix were separated across waves.** Early waves logged bugs as
"REPRODUCED + DIAGNOSED" (e.g. Bug 2) with the fix landing a wave or two later — so the
bug shape stayed open in the gap, and similar instances were authored against
still-buggy patterns in the meantime.

> **Port checklist for policies/observations/letters:** before declaring a pattern
> applied — (1) grep every API route and every store mapper for the old shape;
> (2) hard-reload + DB-SELECT every mutation in QA, never trust the optimistic paint;
> (3) for any derived/persisted value, verify client and server compute it identically;
> (4) sweep *all* `.default()`s out of every Update schema, not just the one that bit you;
> (5) when you add a write-path behavior, ask "what about the rows that already exist?"

---

## 4. "Kill-it-once" countermeasures already in the codebase

These are the architectural changes that should stop the patterns recurring **if the new
pages reuse them**:

- **`optimisticMutation` helper (`src/lib/optimistic.ts`) + `toast-store`** (W11) — one
  apply→request→reconcile→revert path for every mutation. *Closes ad-hoc optimistic drift;
  bounds P8's blast radius.*
- **`cache: 'no-store'` on every entity GET** (W3) — *closes stale-read, the original P1 trigger.*
- **Default-free Update schemas + raw-body key-presence gate** (`schemas/circulars.ts`,
  W6) — *closes P2.*
- **`.nullable()` on clearable fields + client sends explicit `null`** (GAP-3) — *closes P3.*
- **Zod `.strict()` on all Create/Update schemas** (SEC-8) — *closes P2's cousin: unknown
  keys silently reaching the DB.*
- **Server-side per-field `before`/`after` diff + `field_changes jsonb` + Edit modal
  sends only changed fields** (W7/9/10) — *closes P5's GAP-10 variant and P6.*
- **`recomputeCircularProgress` as the single server authority** for progress + status +
  applicability, invoked by every count/phase-changing route (W12/16) — *closes the
  client/server derived-state drift behind P7/§3-C.*
- **`isPersistedId` UUID guard on child mutations** (GAP-20) — *closes P8.*
- **Hardened `mapRow` / `mapImplementationRow`** — read the nested embed first, fall back
  to `previous` only when absent, `?? []` (GAP-17) — *closes P1.*
- **Server-authoritative `sort_order` (`MAX+1`, client value ignored)** + the `reference`
  DB sequence (GAP-12 / SEC-11) — *closes P5's "client value trusted" variant.*
- **Dual-store bilingual timeline (`text_en` + `text_ar`)** (Wave-19.1 / Q8) — every
  timeline / activity-log row persists BOTH languages at write time (rendered
  server-side via `renderBilingual(key, params)` against the existing `en.json` /
  `ar.json` dictionaries). The reader picks the column matching the current locale.
  *Closes P6 for messages and P7's W15-3 variant; obsoletes the transitional `{k,p}`
  JSON + display-time regex parser.* This is the platform convention (already used
  by `policy_activity_log`).
- **Dual-store also on version-history tables** (Wave-19.4 / Item-3, migration 057) —
  `circular_versions`, `article_versions`, and `policy_versions` now persist
  `text_en` + `text_ar` at write time too (the structured `field_changes` jsonb
  is unchanged). The `{k,p}` JSON payload is FULLY retired across the platform —
  not a single producer or consumer remains. `renderBilingual` now accepts a
  per-locale param shape (`{ en, ar }`) so the `{fields}` placeholder in the
  version-history wrapping key resolves to the LOCALIZED field-label list per
  language. *Kills the last `{k,p}` site; readers are now a flat
  `isRTL ? textAr : textEn` pick everywhere.*
- **`If-Match` ↔ `updated_at` optimistic concurrency, 412 on conflict** (`validate.ts`,
  SEC-1) — *closes silent lost-update (the multi-writer hole adjacent to P5).*
- **`assertUuid` at every route entry** (SEC-5) — non-UUID → 400, not a 500.
- **Docs as countermeasures:** `STATCARD-DEFINITIONS.md` (derived-field definitions to
  copy verbatim), `PRODUCTION-READINESS.md` (deferred work that must not be lost).

---

## 5. Gotchas still live — do NOT copy-paste these blindly

- ~~**SEC-1 covers only `circulars`.**~~ **Resolved Wave-17.1** — migration 052
  added `updated_at` + `BEFORE UPDATE` trigger to all 6 mutable child tables
  (`circular_articles`, `article_checklist_items`, `circular_workflow_steps`,
  the 3 attachment tables). The 4 child PATCH/DELETE routes now do the atomic
  conditional UPDATE → 412 pattern (matching the parent circular route), and
  the client store threads `If-Match` per child entity. The P4 parity gap on
  optimistic locking is closed.
- ~~**W15-3 legacy translation is a display-time regex parser, not a data backfill.** Any
  legacy activity string that matches no pattern falls through as raw English. A new
  message family must be added in **two** places — the writer's `{k,p}` key set **and**
  the legacy parser's regex list.~~ **Resolved Wave-19.1 (Q8)** — Rules timeline migrated
  to dual-store `text_en` / `text_ar` columns. Legacy regex parser deleted; rows store
  both translations at write time (rendered via `renderBilingual` against the existing
  dictionaries). Migration 056 truncated the transitional `{k,p}` rows. The two-place
  add is gone — a new message family is just a new entry in the i18n dictionaries.
- ~~**`field_changes` field-label translation is incomplete.** At least one field-name
  param (e.g. "affected departments") still renders untranslated in the activity log —
  the diff *values* are data, but the field *labels* must each be a key.~~
  **Resolved Wave-19.4** — Policy field-label keys (`policies.field.*`) added
  (already present in `en.json` / `ar.json`) and the Policy Version-History
  renderer now wires `entry.changes` through `renderFieldLabelsInText` so any
  embedded `policies.field.*` or `regulatoryUpdates.timelineField.*` token
  resolves through `t()`. Rules residual swept: `SELECT DISTINCT field FROM
  circular_versions / article_versions.field_changes` returns 100 % namespaced
  keys (no hardcoded English labels). The "affected departments" exemplar
  flagged at write-time was already a `regulatoryUpdates.timelineField.departments`
  key; no Rules code change required.
- ~~**Version-history `changes` still uses `{k,p}` JSON.** Two readers
  (`VersionHistoryList` for Rules + `PolicyDetailsContent` for Policies) still
  parse a JSON payload (or substitute embedded keys) at display time, the last
  surviving `{k,p}` consumers on the platform.~~ **Resolved Wave-19.4 Item-3**
  (migration 057) — `circular_versions`, `article_versions`, and `policy_versions`
  are now dual-store `text_en` + `text_ar`. Writers compose both languages at
  write time via `renderBilingual`; readers do `isRTL ? textAr : textEn`. The
  `timelineMessage` / `renderTimelineMessage` / `renderFieldLabelsInText` /
  `VERSION_CHANGES_MAP` helpers are DELETED. Only `renderFieldLabel` survives,
  and only for translating the namespaced `field` key on the per-field diff
  table (`field_changes` jsonb, never `{k,p}`).
- **Enum values render through per-site label maps, not a shared formatter.** The article
  status chip needed wiring through the same status map *twice* (modal, then row-card —
  W15-6). Any **new** render site of an enum value is English-by-default until explicitly
  routed through the label map.
- ~~**`recomputeCircularProgress` is mutation-triggered only.** It computes progress +
  status + applicability, but only when a mutation route runs it. Anything
  **time-dependent** (overdue status, deadline-driven state) goes stale on an idle entity
  — that was the root of P7/GAP-18. Time-based state needs a read-time eval or a cron.~~
  **Resolved Wave-19** — pg_cron `regdocs_derived_state_daily` (`30 0 * * *`) + per-row
  `before insert or update` triggers populate `policies.is_expired` and `circulars.is_overdue`
  columns at the SQL layer (migration 055). Time-dependent derived state no longer drifts
  on idle rows; the StatCard / list queries read the persisted flag in O(1) via a partial
  index. The generalised invariant (every time-dependent derived flag belongs in a
  triggered + cron-resynced bool column) is now the Day-1 expectation in PORTING-TEMPLATE §3.
- **The progress formula is duplicated** in `recalcProgress` (client) and
  `recomputeCircularProgress` (server) and kept identical **by hand**. Any change must
  touch both, or it drifts (it did, repeatedly).
- **`circular_versions` has `field_changes` and `approved` as NOT NULL** — every insert
  must supply them (`field_changes` defaults to `[]`).
- **Legacy `circulars.pdf_url` still exists** alongside `circular_pdf_attachments` — the
  multi-file migration (W15-4) left a legacy single-PDF column for backward-compat. Two
  sources of "the circular's PDF"; don't assume one.
- **PR-1 / PR-5 / PR-6 in `PRODUCTION-READINESS.md` are deferred, not done** — rate
  limiting, child-table optimistic locking, and tightening permissive `*_timeline`
  INSERT RLS policies. Known-open before go-live.
