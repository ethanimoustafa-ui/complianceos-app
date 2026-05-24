# PORTING-TEMPLATE — Apply the Rules-page hardening to a new entity

This is the canonical spec for porting the **Rules (Circulars)** patterns to a
new regulatory-updates entity (Policies → Observations → Letters → …).

Every numbered countermeasure in §2 is required on Day 1; every gotcha in §3
must be wired in from the first commit; every probe in §6 must pass on
localhost at the HTTP layer before declaring done.

Source of truth for *why* each item exists: `.planning/regulatory-updates-rules/FORENSIC.md`.
Source of truth for *how* each is implemented: cited Rules files in §2.

---

## §1 Scope & order of operations

1. Inventory the entity's DB tables and routes.
2. Apply the schema migrations needed (`updated_at` + trigger on every mutable
   child table; `field_changes jsonb` on the version table).
3. Harden the Zod schemas (countermeasures 3, 4, 5, 15, 16).
4. Harden the parent route (countermeasures 2, 7, 12, 13 — ETag, atomic UPDATE
   conditional on `If-Match`, recompute call).
5. Build any missing child routes with the same shape (GET-with-ETag + PATCH/DELETE-with-If-Match).
6. Retrofit the store (mappers populate `updatedAt`, every mutation goes
   through `optimisticMutation` and threads `If-Match`).
6.a. **Before component work on a freshly-ported entity, grep every new mapper
   (`mapRow`, `mapPolicyRow`, `mapImplementationRow`, etc.) for `previous?.X ?? []`
   patterns and confirm each one ALSO reads the GET's nested array.** The pattern
   is: read the response embed first, fall back to `previous` only when absent,
   default to `?? []` on the final unwrap. Skipping the embed read is the P1
   mapper-drop — same bug shape as Bug 5, GAP-17, and the Wave-19.3 Policy
   Activity / Version-History empty-state leak. One grep at the start of the
   port is cheaper than three sub-waves at the end.
7. Retrofit the components: every enum render → `formatEnum`; edit modals send
   only changed fields; Add/Edit/Delete affordances are optimistic.
8. Wire timeline messages through the platform's dual-store pattern —
   persist `text_en` + `text_ar` at write time via `renderBilingual(key, params)`
   from `src/lib/i18n/server.ts`; the reader picks the column for the current
   locale.
9. Add tests + HTTP probes. Run them against the dev server. **The unit test
   is meaningless on its own — the W17.2 lesson.**
10. Append a wave section to `qa-walkthrough.md`.

---

## §2 Day-1 countermeasures (every one is required)

Each item: what to do · which Rules file implements it (copy the shape).

1. **`optimisticMutation` for every mutation** — apply → request → reconcile → revert + keyed toast. Source: `src/lib/optimistic.ts`, threaded through `src/stores/circular-store.ts`. Closes P8 + the ad-hoc-optimistic-drift family.
2. **`cache: 'no-store'` on every entity GET** — never `sMaxAge`/`staleWhileRevalidate` on entity reads. Source: `src/app/api/circulars/[circularId]/route.ts`. Closes P1's stale-read trigger.
3. **Default-free Update schemas, `.strict()` on every schema** — hand-write `UpdateXSchema`; never `.partial(CreateXSchema)`. Source: `src/lib/api/schemas/circulars.ts`. Closes P2.
4. **`.nullable()` clearable fields + client sends explicit `null`** — every clearable optional must accept `null`; `toUpdatePayload` collapses `''` → `null`. Source: `circulars.ts` schema + `circular-store.ts` `toUpdatePayload`. Closes P3.
5. **Raw-body key-presence gate** — destructive array columns (`departments`, `framework_ids`) only persist when the raw JSON body explicitly carries the key. Source: `circulars/[circularId]/route.ts` PATCH. Closes P2's array-default variant.
6. **Server-side per-field diff + `field_changes jsonb` on the version table** — snapshot row before, diff field-by-field after, emit version row only when something changed; payload is `[{field, from, to}]` with `field` as an i18n key. Source: `services/circulars.ts` `insertArticleVersion` + the implementations PATCH route. Closes P5 (GAP-10) and P6.
7. **Single server-authoritative recompute** for derived state (status/progress/lifecycle flags), invoked by every count- or phase-changing route. Source: `recomputeCircularProgress` in `services/circulars.ts`. Closes §3-C client/server drift.
8. **`isPersistedId` UUID guard on child mutations** — child action skips/awaits until the parent + item are real UUIDs. Source: `circular-store.ts`. Closes P8.
9. **Hardened mappers** — `mapRow`/`mapXRow` read the GET response's nested embeds FIRST, fall back to `previous` only when the embed is absent, `?? []` not `?? undefined`. Source: `mapImplementationRow` in `circular-store.ts`. Closes P1.
10. **Server-authoritative `sort_order` + reference sequence** — `MAX+1` server-side, client-sent values ignored; `ref_code` from a Postgres sequence (not `SELECT max+1`). Source: `nextCircularReference` in `services/circulars.ts` + the workflow-steps POST. Closes GAP-12 + SEC-11.
11. **Dual-store bilingual on EVERY text column** (Wave-19.1 / Q8 + Wave-19.4 / Item-3) — every timeline / activity-log AND every version-history table has two NOT NULL `text` columns (`text_en` + `text_ar`). Writers call `renderBilingual(key, params)` from `src/lib/i18n/server.ts` to resolve the i18n key against `en.json` + `ar.json` and persist BOTH languages at write time. The reader picks the column matching the current locale (`isRTL ? row.text_ar : row.text_en`) — no JSON parse, no regex. Retroactive translation is free: when a user flips the language toggle the UI just reads the other column. A param value may itself be a per-locale pair (`{ en, ar }`) so placeholders like `{fields}` resolve to the LOCALIZED label list per language. Sources: `policy_activity_log` (long-standing), `circular_timeline` / `article_timeline` (migrated by 056), `circular_versions` / `article_versions` / `policy_versions` (migrated by 057). Closes P6 (messages) + W15-3; the `{k,p}` JSON pattern is fully retired across the platform.
12. **`If-Match` ↔ `updated_at` on every mutable table** — parent + every PATCH/DELETE-able child. UPDATE/DELETE is scoped to `WHERE id = $id AND updated_at = $clientToken` (NOT `$serverJustReadValue` — that was the W17.2 bug). 0 rows → `PreconditionFailed`. Single-resource GET attaches `ETag: W/"<updated_at>"`. Source: `circulars/[circularId]/route.ts` + the 4 child route files post-W17.2.
13. **`assertUuid` at every route entry** — every dynamic segment, before any DB access. Source: `validate.ts`.
14. **Security headers in `next.config.ts`** — inherited app-wide; verify per-page.
15. **URL scheme allowlist on every URL field** — only `http`/`https`. Source: `isSafeHttpUrl()` in `src/lib/api/sanitize.ts`, wired via the `HttpUrl` Zod refinement.
16. **Server-side HTML sanitization on every free-text field** — `sanitize-html` with an empty allowlist; applied in Zod `.transform()`. Source: `stripHtml()` in `sanitize.ts`, wired via the `PlainText` Zod helper.

---

## §3 Day-1 gotchas (wire from the FIRST commit, not later)

- Hand-write the Update schema. **Never** `CreateSchema.partial()`.
- Every enum render goes through `formatEnum(field, value, locale)` (`src/lib/format/enum.ts`) — not inline ternaries, not per-component label maps. Every NEW render site is English-by-default until routed through the formatter.
- Time-dependent state (`is_expired`, `days_until_review`, `overdue`) goes stale on idle entities — the mutation-triggered recompute only fires when someone writes. Either eval at read-time in the GET (cheap) **or** add a cron/scheduled-function. Don't pretend mutation-trigger covers it.
- Don't introduce any legacy convenience column alongside a relational shape (no policy equivalent of `circulars.pdf_url` orphaning attachments).
- Every `field_changes` field-label is itself an i18n key (NOT a stored English label) — the structured per-field diff in version history renders via `renderFieldLabel(field, t)`. Under the Wave-19.1 dual-store contract this is the ONLY remaining surface where this gotcha applies; activity-log message paramrefs are moot now that each row stores the fully-rendered English and Arabic strings at write time.
- The revert toast (and every other store-layer toast) uses an i18n KEY via `pushToast({key, params})`, never a hardcoded string.
- The Edit modal sends **only changed fields**, not the whole form — server-side per-field diff is defense-in-depth, the modal-side diff is the primary fix (P5/GAP-10).
- Add a Playwright/probe-style HTTP-layer test for any If-Match route. Unit-testing the helper is **not** enough — that was the W17.2 lesson.
- **Never write `useStore((s) => s.X ?? [])` or `useStore((s) => s.Y ?? {})`** — the fallback returns a fresh reference on every snapshot read, triggering React 18's `useSyncExternalStore` "The result of getSnapshot should be cached to avoid an infinite loop" error and crashing the component on mount (W19.7-BUG-1). Fix: declare a module-level stable constant outside the component (`const EMPTY_X: Foo[] = []`) and use it as the fallback (`?? EMPTY_X`), OR default the store state so the `??` branch is never taken, OR split the selector and use `useShallow` from `zustand/react/shallow`. Repro context: Wave-19.7 shipped this bug in three sites — `ApprovalTiersSection.tsx`, `RegisterPolicyModal.tsx`, `EditPolicyModal.tsx` — all selecting `s.byDomain['policy.approval_tier'] ?? []`; test policy IDs: `694fa590-55b5-4d79-820a-4c412ad38096` (Policy detail), circular `7f80986b-c6ae-4484-8968-24603cacd6e0` (workflow undo cursor verification).

---

## §4 Migration recipe (copy-paste)

```sql
-- updated_at + trigger on every PATCH/DELETE-able child table
alter table <child_table> add column if not exists updated_at timestamptz not null default now();
drop trigger if exists set_updated_at on <child_table>;
create trigger set_updated_at before update on <child_table>
  for each row execute function public.set_updated_at();

-- field_changes on the version table (mirror of article_versions)
alter table <entity>_versions add column if not exists field_changes jsonb;

-- Wave-19.1 / Q8 — dual-store bilingual columns on every timeline /
-- activity-log table. Both columns are NOT NULL so writers MUST populate
-- both languages (use `renderBilingual` from `src/lib/i18n/server.ts`).
alter table <entity>_timeline
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table <entity>_timeline
  alter column text_en drop default,
  alter column text_ar drop default;

-- Wave-19.4 / Item-3 — dual-store ALSO on version-history tables (kills the
-- last `{k,p}` JSON site). Same shape as the timeline migration above. If a
-- pre-existing single-language `changes` column needs replacing, truncate
-- the table first (version rows are append-only history; back-translating
-- the legacy JSON isn't worth the code).
delete from <entity>_versions;
alter table <entity>_versions
  drop column if exists changes,
  add column text_en text not null default '',
  add column text_ar text not null default '';
alter table <entity>_versions
  alter column text_en drop default,
  alter column text_ar drop default;
```

Append-only tables (versions, activity-log) get NO `updated_at` — no PATCH/DELETE.

---

## §5 Sweep checklist (FORENSIC §3-B — patterns are done only when grep proves it)

After implementation, grep across the entity's surface:

- `grep -rn "cache: 'no-store'" src/app/api/<entity>/` — every GET should match.
- `grep -rn "assertUuid" src/app/api/<entity>/` — every `[id]` route should match.
- `grep -rn "\.strict()" src/lib/api/schemas/<entity>.ts` — every schema should match.
- `grep -rn "If-Match\|readIfMatch\|ifMatch" src/app/api/<entity>/` — every PATCH/DELETE handler should appear.
- `grep -rn "ETag" src/app/api/<entity>/` — every single-resource GET should set one.
- `grep -rn "optimisticMutation\|pushToast" src/stores/<entity>-store.ts` — every mutation should appear.
- `grep -rEn "in-progress|pending|critical|high|medium|low|approved|draft" src/components/.../<entity>/*.tsx` — raw enum literals are RED, must route through `formatEnum`.

---

## §6 Verification probes (must pass on localhost HTTP layer)

Parameterize each probe for the new entity. **Vitest passing is not sufficient — the W17.2 lesson.**

> **Every verification probe MUST hit the actual mounted HTTP route, not a helper
> function.** Every non-2xx assertion MUST name the SPECIFIC expected code
> (`401` / `403` / `409` / `412`), never "any non-500" — a 500 silently passes a
> `status !== 200 ? failed : passed` check. That's the W17.2 / W19.6 / W19.7
> regression mode (FORENSIC P9). For UI components, every smoke test must
> RENDER the component (mount via Testing Library or Playwright snapshot), not
> just import its module. And probe assertions must check the BEHAVIOUR shape
> (e.g. "previously-current step is now pending AND new step is current"), not
> a coarse invariant ("completed count -1") that passes whether the handler did
> the right thing or only half of it (W19.6-BUG-1).

1. **SEC-3 — URL scheme:** PATCH a URL field with `javascript:alert(1)` → 400.
2. **SEC-4 — HTML strip:** PATCH a text field with `<img src=x onerror=…>` → stored value has the tag stripped.
3. **SEC-5 — UUID validation:** GET `/api/<entity>/abc` → 400 `invalid_uuid` (not 500).
4. **SEC-8 — Unknown-key rejection:** PATCH with `is_admin: true` → 400 `validation_failed` (not 500).
5. **W17-2 — Stale `If-Match`:** PATCH any mutable surface with `If-Match: W/"2020-01-01T00:00:00Z"` → 412.
6. **W17-2 — Concurrent same-token:** two PATCHes via `Promise.all` with the same fresh `If-Match` → exactly one 200 and one 412.
7. **SEC-9 — Auth bypass:** every endpoint (every verb) with `credentials:'omit'` → 401.
8. **SEC-11 — Reference sequence:** 10 concurrent POSTs → 10 unique monotonic `ref_code`s, zero 500s.
9. **SEC-10 — Path-traversal filename:** attachment upload with `../../etc/passwd.pdf` → stored name is sanitized basename.
10. **GAP-15 — Newest-first + Load More on activity tab:** initial 10 rows; "Load More" fetches next 10; spinner on the button.
11. **GAP-17 — Versions persist on hard reload:** edit the entity, version row appears, hard-reload, version row STILL there.
12. **RTL — Arabic pass + dual-store integrity:** every chip / StatCard / timeline body translates. Perform a mutation that writes a timeline row, then `SELECT id, text_en, text_ar FROM <entity>_timeline ORDER BY date DESC LIMIT 1` — both columns must be non-empty and contain the rendered English / Arabic strings (NO `{k:` JSON anywhere). Flip the language toggle and reload; the UI must render the Arabic column. Flip back; English. Zero console errors about `renderTimelineMessage`.

---

## §7 Open-questions queue (per port — surface to orchestrator/owner)

Each port has 3–6 entity-specific decisions that need stakeholder input. Examples for any port:

- **Activity log format**: dual-store `text_en` / `text_ar` (NOT optional — this is the platform convention; see §2.11). Confirm only the table name (`<entity>_activity_log` vs `<entity>_timeline`).
- **Workflow concept**: phase-based (Circulars-style) vs step-list (sort_order only) vs approval-chain?
- **StatCard predicates**: exact `WHERE` clauses for each StatCard, including any time-based ones.
- **Reference code generation**: server-derived sequence (`<ENTITY>-YYYY-NNNN`) vs user-supplied?
- **Enum constraints**: every status / category / tier enum must have its allowed values documented for Zod.
- **Time-dependent state**: read-time eval vs cron — confirm per derived field.

Don't block the port on these — ship the unambiguous parts, queue answers in the port's wave doc.

---

## §8 Platform invariant: configurable enums (Wave-19 Q4/Q5)

**Rule.** Enum values that represent user-domain concepts — `approval_tier`,
`status`, `priority`, `risk_level`, `step_state`, `category`, etc. — are
**NEVER** hardcoded in source. They are user-configurable through Settings.

What that means in practice:

- **Zod schemas validate the SHAPE, not the SET.** A user-domain enum field
  uses `z.string().min(1).max(N).strict()` (and HTML-strips if it is free text)
  — it does **NOT** use `z.enum([...])`. The set of allowed values lives in a
  Settings-managed lookup table at runtime, not in the schema file.
- **Labels never live in source.** No per-component `STATUS_LABELS = {…}` map,
  no inline ternaries (`status === 'high' ? 'High' : …`). Every render goes
  through a single resolver (`formatEnum` today; the production-grade
  `enum_value_definitions` table tracked under PR-10).
- **Migrations don't lock the set either.** No `check (status in ('a','b','c'))`
  on user-domain columns. A free-text column (`text`) with a Settings-managed
  lookup is the canonical shape.

**Grandfathered exceptions.** Some Rules-page schemas still lock enums with
`z.enum([...])` — notably `priority` in `CreateCircularSchema` and the
hardcoded workflow `actionType` set. These predate the invariant and are
grandfathered; **future ports leave them open** (open-string + Settings-driven
lookup) rather than copying the `z.enum` pattern.

**Establishing decisions.** Wave-19 Q4 (`approval_tier`) and Q5 (`step_state`):
both stay open-string with `.strict()` validation. No code change this wave —
the schemas already validate shape only. This §8 codifies the rule so future
ports start there by default. Long-form production work to back this with a DB
table + Settings UI is tracked under PR-10 in `PRODUCTION-READINESS.md`.

---

*This document is updated whenever a port reveals a new general-purpose pattern. Last update: Wave-19.4 / Item-3 (dual-store extended to version-history tables; `{k,p}` JSON pattern fully retired).*
