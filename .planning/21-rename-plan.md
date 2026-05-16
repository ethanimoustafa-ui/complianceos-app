# 21 — `sama_letters` → `letters` rename plan

User reasoning: SAMA is one of many authorities (CMA, IA, CITC, ZATCA). The
`authority` column already discriminates. Legacy `sama_` prefix is misleading.

## Renames applied

### Database tables (6)
| Old | New |
| --- | --- |
| `sama_letters` | `letters` |
| `sama_letter_attachments` | `letter_attachments` |
| `sama_letter_observations` | `letter_observations` |
| `sama_letter_approval_steps` | `letter_approval_steps` |
| `sama_letter_timeline` | `letter_timeline` |
| `sama_letter_templates` | `letter_templates` |

Renamed via `ALTER TABLE ... RENAME TO` in migration `033_rename_letters.sql`.
Indexes, triggers, policies all renamed in place. FKs follow the table rename
automatically. Bucket `sama_letter_attachments` NOT renamed (storage data
persistence concern; rows still 0). Note: this is a storage bucket name, not a
table name — it stays.

### RLS policies (renamed, not dropped)
- `sama_letters_select|insert|update|delete` → `letters_*`
- `sama_letter_templates_select|modify` → `letter_templates_*`
- `sama_letter_approval_steps_select|modify` → `letter_approval_steps_*`
- `sama_letter_timeline_select|insert|no_update|no_delete` → `letter_timeline_*`
- `sama_letter_attachments_select|modify` → `letter_attachments_*`
- `sama_letter_observations_select|modify` → `letter_observations_*`

### Triggers
- `trg_sama_letters_ua` → `trg_letters_ua`
- `trg_sama_letter_templates_ua` → `trg_letter_templates_ua`
- `trg_sama_letters_invalidate_compliance` → `trg_letters_invalidate_compliance`
- `trg_sama_letter_timeline_block_update` → `trg_letter_timeline_block_update`

### Indexes
All `idx_sama_letter*` indexes renamed via `ALTER INDEX ... RENAME TO`.

### Grants
REVOKE/GRANT lines on `sama_letter_timeline` repointed to `letter_timeline`.

### TypeScript types (src/types/index.ts)
| Old | New |
| --- | --- |
| `SAMALetter` | `Letter` |
| `SAMALetterStatus` | `LetterStatus` |
| `SAMALetterType` | `LetterType` |
| `SAMALetterApprovalStep` | `LetterApprovalStep` |
| `SAMALetterTimelineEvent` | `LetterTimelineEvent` |
| `SAMASubCategory` | (kept — depends on framework auth) |
| `SAMADepartment` | (kept — domain dept name) |
| `NotificationModule.samaLetters` | `letters` |

### Stores
| File | Old export | New export |
| --- | --- | --- |
| `src/stores/sama-letter-store.ts` → `src/stores/letter-store.ts` | `useSAMALetterStore` | `useLetterStore` |
| `src/stores/sama-template-store.ts` → `src/stores/letter-template-store.ts` | `useSAMATemplateStore` | `useLetterTemplateStore` |
| `src/stores/sama-letter-type-store.ts` → `src/stores/letter-type-store.ts` | `useSAMALetterTypeStore` | `useLetterTypeStore` |
| `src/stores/sama-sub-category-store.ts` | (shim left in place — exports framework store) | unchanged |

### Cache tags
| Old | New |
| --- | --- |
| `cacheTags.samaLetters` | `cacheTags.letters` |
| `cacheTags.samaLetterAttachments` | `cacheTags.letterAttachments` |
| `cacheTags.samaLetterTimeline` | `cacheTags.letterTimeline` |
| `cacheTags.samaLetterPlaceholders` | `cacheTags.letterPlaceholders` |
| `cacheTags.samaLetterTemplates` | `cacheTags.letterTemplates` |

Tag string prefixes also renamed (`sama-letters:*` → `letters:*`).

### Pages
- `src/app/(dashboard)/sama-letters/page.tsx` redirect → updated to redirect from
  `/sama-letters` → `/correspondence/letters` (kept for legacy URL stability).
  Component name `SamaLettersPage` → `LegacySamaLettersRedirect`.
- `src/app/(dashboard)/correspondence/letters/page.tsx` — kept path, refactored
  internals (store imports, types, i18n keys).

### i18n keys
- Top-level `samaLetters.*` namespace → `letters.*` in both `en.json` and `ar.json`.
- `correspondence.tabs.samaLetters` "SAMA Letters" → `correspondence.tabs.letters` "Letters".
- The "SAMA Letter Overdue" notification key (`notifications.samaLetterOverdue`)
  KEPT — it refers specifically to overdue SAMA letters in the existing engine.
  Renamed key would orphan notifications stored with that source kind.
- `team.logActionSamaLetterApproval` / `team.logActionSamaLetterSent` — KEPT;
  these label persisted activity-log action strings.

### Components (src/components/correspondence/letters/)
- All `samaLetters.*` i18n calls → `letters.*`.
- `storeName: 'samaLetter'` → `'letter'` in audit-log emissions inside the store.

### API routes (src/app/api/letters/*, /api/letter-templates/*)
- All `.from('sama_letters')` → `.from('letters')`, etc.
- Cache tag calls updated.
- `entity_type: 'sama_letter'` → `'letter'` and `action: 'sama_letter.*'` → `'letter.*'`
  in audit-log writes. (These are NEW entries going forward; old rows keep their
  legacy `sama_letter` keys — that's intentional, historical record.)

### Things NOT renamed (intentionally)
- **Storage bucket** `sama_letter_attachments` — buckets contain persisted data;
  renaming requires copy-and-delete. Brief targets tables only. Bucket name is
  internal/opaque; UI never shows it.
- **Permission key** `'Approve SAMA Letters'` — persisted in `role_permissions`
  table. Renaming requires data migration. The permission name is internal
  string; not surfaced as page header.
- **PDF template id** `'sama-letter'` (file `src/lib/pdf/templates/sama-letter.tsx`)
  — SAMA-format-specific letter rendering template. The template name describes
  the visual format (SAMA-style cover sheet), not the resource. Other authorities
  (CMA, IA) would get their own templates.
- **Calendar source kind** `'sama-letter'` — domain enum (event-type), per brief.
- **Activity-log action keys** `samaLetter.approval_step_committed`,
  `samaLetter.sent` — these are values persisted in `user_activity_logs.action`;
  renaming would orphan historical rows. NEW writes in renamed code continue to
  emit the same strings (so historic UI filters keep working).
- **Author-side `authority` column values** (`sama`, `cma`, …) — domain enum.

## Files touched (code)
- `src/lib/api/cache.ts`
- `src/lib/api/services/letters.ts`
- `src/lib/api/schemas/letters.ts`
- `src/lib/api/services/audits.ts` (1-line comment)
- `src/types/index.ts`
- `src/stores/letter-store.ts` (renamed from sama-letter-store.ts)
- `src/stores/letter-template-store.ts` (renamed from sama-template-store.ts)
- `src/stores/letter-type-store.ts` (renamed from sama-letter-type-store.ts)
- `src/stores/sama-sub-category-store.ts` (unchanged compatibility shim)
- All routes under `src/app/api/letters/**` and `src/app/api/letter-templates/**`
- `src/app/api/observations/route.ts` (1 comment)
- `src/app/(dashboard)/correspondence/letters/page.tsx`
- `src/app/(dashboard)/correspondence/feed/page.tsx`
- `src/app/(dashboard)/correspondence/advisory/page.tsx`
- `src/app/(dashboard)/correspondence/regulatory-updates/rules/page.tsx`
- `src/app/(dashboard)/correspondence/regulatory-updates/policies/page.tsx`
- `src/app/(dashboard)/correspondence/observations/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/sama-letters/page.tsx`
- `src/components/correspondence/letters/CreateLetterForm.tsx`
- `src/components/correspondence/letters/TemplateEditForm.tsx`
- `src/components/correspondence/letters/ApprovalStepActions.tsx`
- `src/components/correspondence/letters/translateTimelineTitle.ts`
- `src/components/dashboard/ExecutiveView.tsx`
- `src/components/dashboard/ManagerialView.tsx`
- `src/components/dashboard/OfficerView.tsx`
- `src/components/settings/ListsAndCategoriesSection.tsx`
- `src/components/settings/NotificationsSection.tsx`
- `src/components/team/directory/burnout-detection-card.tsx`
- `src/components/team/directory/pending-approvals-card.tsx`
- `src/components/team/directory/stat-cards.tsx`
- `src/components/team/directory/member-detail-drawer.tsx`
- `src/hooks/useCalendarEvents.ts`
- `src/hooks/useDashboardMetrics.ts`
- `src/hooks/useNotificationEngine.ts`
- `src/hooks/useWorkload.ts`
- `src/lib/dashboard-pdf.ts`
- `src/lib/permissions.ts`
- `src/stores/user-preferences-store.ts`
- `src/i18n/dictionaries/en.json`
- `src/i18n/dictionaries/ar.json`
- `supabase/migrations/033_rename_letters.sql` (NEW)
- `supabase/migrations/033b_repoint_compute_compliance_inputs` (DB-applied; re-creates the RPC so its body references `public.letters` instead of `public.sama_letters`. The 027 source file was updated in place so a fresh-DB replay produces the correct function body without needing the b-migration.)
- `supabase/migrations/027_compute_compliance_inputs_rpc.sql` (source updated to use `public.letters`)

## Decisions log — internal identifiers kept as `samaLetters` / `samaLetter`

These references survived the pass intentionally; each carries persistence
concerns or a domain meaning beyond the rename charter:

- **`NotificationModule.samaLetters`** (src/types/index.ts) — enum value
  persisted as a key inside `user_preferences.notification_modules`. Renaming
  would require a data migration of every existing row's JSON.
- **`metrics.samaLetters.*`** (dashboard hooks, dashboard PDF, dashboard views)
  — the dashboard metric-shape key paired with the above enum.
- **`useUserLogStore` action types `'samaLetter.approval_step_committed'` and
  `'samaLetter.sent'`** — values persisted in `user_activity_logs.action`. The
  team-logs UI matches on these literal strings; renaming would orphan every
  historic row from its localised label.
- **i18n keys `team.logActionSamaLetter*`, `notifications.samaLetterOverdue`,
  `team.typeSamaLetter`, `calendar.sourceSamaLetter`,
  `settings.moduleSamaLetters`** — labels for the kept enums above. Renaming
  the key would also force renaming the persisted enum, which we declined.
- **Calendar source kind / PDF template id `'sama-letter'`** — domain enum
  (calendar event sub-type) and visual template format (`sama-letter.tsx`
  renders the SAMA-style cover sheet). Other authorities (CMA, IA) will get
  their own templates in a future pack.
- **Storage bucket `sama_letter_attachments`** — renaming requires copy-and-
  delete of storage data; brief targets tables only.
- **Permission key `'Approve SAMA Letters'`** — persisted in `role_permissions`;
  the permission name is an internal string never surfaced as a page header.

## Verification

- **DB state (post-rename):**
  - `to_regclass('public.letters')` → `letters` (non-null)
  - `to_regclass('public.letter_attachments')` → `letter_attachments`
  - `to_regclass('public.letter_observations')` → `letter_observations`
  - `to_regclass('public.letter_approval_steps')` → `letter_approval_steps`
  - `to_regclass('public.letter_timeline')` → `letter_timeline`
  - `to_regclass('public.letter_templates')` → `letter_templates`
  - `to_regclass('public.sama_letters')` → NULL  ✅
  - `count(*) FROM public.letters` → 4 (pre-rename count was 4)  ✅
  - `count(*) FROM public.letter_attachments` → 0  ✅
  - Policies: 16/16 renamed (verified via `pg_policies`)  ✅
- **TypeScript:** `npx tsc --noEmit` → exit 0  ✅
- **Dev server:** All routes hit return 200 / 401 (not 500)  ✅
- **Playwright smoke + fix-3 spec:** Sign-in form fills and submits; auth
  succeeds; dashboard renders. The specs *time out* on `networkidle` waits
  and `waitForURL` due to (a) cold-compile latency in dev mode and (b) a
  `PGRST303 "JWT issued at future"` clock-skew error pre-existing in the
  environment. These failures are NOT regressions introduced by the rename —
  every routed page returns 200 when fetched manually, and the renamed RPC +
  tables verified end-to-end via direct SQL.

