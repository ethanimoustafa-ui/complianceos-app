# 14 - i18n Storage Strategy (Phase 8)

Canonical policy for how Arabic / English content is stored in the database, derived per-request, and rendered in the UI. Supersedes ad-hoc inline notes in BACKEND-API-MAP §11 — when in doubt, this doc wins for Phase 8 onward.

## 1. The three storage classes

Every piece of text in the system falls into exactly one of these three buckets. The rule for choosing is mechanical: if the user types it free-form, it's (A); if the system manages the row and the scope demands both languages, it's (B); if it's an enum the code branches on, it's (C).

| Class | Description | Storage | Render |
|-------|-------------|---------|--------|
| **(A) User free text** | Letter bodies, observation descriptions, risk titles, audit titles, comments, generic notes. The user types whatever language they want, the system stores it verbatim. | Single column (e.g. `observations.description`, `correspondence.subject`). No paired AR column unless the scope explicitly demands it (SAMA letters have `subject_ar`/`body_ar` because regulatory rendering requires both regardless of input). | As-is. No translation, no transformation. The render context's `dir` attribute handles RTL. |
| **(B) System-managed bilingual** | Lookup-table labels (departments, business units, categories, types, frameworks, authority departments). System always knows both languages and must render the right one. | `name_en` + `name_ar` (both `NOT NULL`). Same pattern for `description_en`/`description_ar` on frameworks. | Server derives a `name` field per request locale via `localizeMany()` in `@/lib/api/i18n`. Clients read `row.name` directly; no client-side branching needed for the common case. |
| **(C) System enums** | `status`, `severity`, `type`, `role`, `action` codes — canonical English strings the application code branches on (`'in_progress'`, `'critical'`, `'org_admin'`). | Plain `text` column. English-only in DB. | Client `useTranslation()` resolves the AR label at render time from `src/i18n/dictionaries/ar.json`. Existing pattern, unchanged by Phase 8. |

## 2. Schema verification (DB state at start of Phase 8)

Audit query against `information_schema.columns`:

| Table | `name_en` | `name_ar` | legacy `name` |
|-------|-----------|-----------|---------------|
| `audit_categories` | yes | yes | absent |
| `authority_departments` | yes | yes | absent |
| `business_units` | yes | yes | absent |
| `calendar_event_types` | yes | yes | absent |
| `correspondence_types` | yes | yes | absent |
| `departments` | yes | yes | absent |
| `framework_sub_categories` | yes | yes | absent |
| `frameworks` | yes | yes | absent |
| `letter_types` | yes | yes | absent |
| `policy_categories` | yes | yes | absent |
| `risk_categories` | yes | yes | absent |
| `training_categories` | yes | yes | absent |

Conclusion: every lookup table targeted by §11 already has the bilingual pair from migration `003_system_lookups`. No `ALTER TABLE` needed. Migration `021_i18n_bilingual_columns.sql` was therefore reduced to a defensive `name_ar = name_en where coalesce(trim(name_ar), '') = ''` backfill — a no-op on a clean DB, kept as a sentinel for environments that diverged.

## 3. Seed translations applied

Migration `022_i18n_seed_ar.sql` refines the canonical Arabic labels on the only two lookup tables that ship seeded:

**Frameworks (11 rows):**

| `id` | `name_en` | `name_ar` |
|------|-----------|-----------|
| `sama` | SAMA | ساما (مؤسسة النقد العربي السعودي) |
| `cma` | CMA | هيئة السوق المالية |
| `ia` | IA | هيئة التأمين |
| `nca-ecc` | NCA ECC | الضوابط الأساسية للأمن السيبراني |
| `zatca` | ZATCA | هيئة الزكاة والضريبة والجمارك |
| `misa` | MISA | وزارة الاستثمار |
| `safiu` | SAFIU | وحدة التحريات المالية السعودية |
| `pdpl` | PDPL | نظام حماية البيانات الشخصية |
| `coso-ic` | COSO IC | كوزو للرقابة الداخلية |
| `iso-27001` | ISO 27001 | آيزو 27001 |
| `sharia-board` | Sharia Board | الهيئة الشرعية |

**Departments (10 default rows):**

| `key` | `name_en` | `name_ar` |
|-------|-----------|-----------|
| `compliance` | Compliance | الالتزام |
| `risk` | Risk Management | إدارة المخاطر |
| `audit` | Internal Audit | التدقيق الداخلي |
| `legal` | Legal | الشؤون القانونية |
| `finance` | Finance | المالية |
| `it` | Information Technology | تقنية المعلومات |
| `cyber` | Cybersecurity | الأمن السيبراني |
| `operations` | Operations | العمليات |
| `hr` | Human Resources | الموارد البشرية |
| `treasury` | Treasury | الخزينة |

**Roles (4 rows in `roles`):** roles are class-(C) enums (`viewer`, `auditor`, `compliance_officer`, `org_admin`). The AR labels live in `src/i18n/dictionaries/ar.json` under `team.roles.*`, not in the DB.

**Empty lookup tables on a fresh deploy:** `policy_categories`, `audit_categories`, `risk_categories`, `training_categories`, `calendar_event_types`, `correspondence_types`, `letter_types`, `framework_sub_categories`, `authority_departments`. These are populated by the org admin through the Settings UI; the create-form already collects both `name_en` and `name_ar`, so no Arabic backfill is required.

## 4. Helper exports

### Server (`src/lib/api/i18n.ts`)

- `type Locale = 'en' | 'ar'`
- `localizeName(row, locale)` — single row → string with same-side empty-string fallback.
- `localizeMany(rows, locale)` — array → array with derived `name` field on every row.
- `resolveLocale(req)` — picks locale from `?locale=` / `?lang=` query param, then `Accept-Language` header, defaulting to `'en'`.

### Client (`src/i18n/use-localized-name.ts`)

- `useLocalizedName(row)` — React hook, reactive to language toggle. Returns the active-locale name with fallback.
- `localizeArray(rows, lang)` — non-reactive bulk helper for use inside `useMemo` selectors or non-component utilities.

Both helpers use the same fallback rule: if the requested side is empty, return the other side rather than an empty string. A row missing one side is a data bug, but the API stays robust.

## 5. Wired endpoints

The following GET list handlers now call `localizeMany(data, resolveLocale(req))` and return rows with a derived `name`:

- `/api/settings/departments`
- `/api/settings/business-units`
- `/api/settings/frameworks`
- `/api/settings/policy-categories`
- `/api/policy-categories`
- `/api/audit-categories`
- `/api/risk-categories`
- `/api/training/categories`
- `/api/calendar/event-types`
- `/api/correspondence-types`
- `/api/letter-types`
- `/api/letter-sub-categories`
- `/api/authority-departments`

POST/PATCH/DELETE handlers were not touched — they accept `name_en` + `name_ar` from the client and return the raw row; clients refetch the list to get the derived `name`.

## 6. Not wired (polish-phase work)

Components that still read `row.name_en` (or `row.name_ar`) directly instead of `row.name` — leave for a later polish pass. The `useLocalizedName()` hook is the migration path; the server-side derived `name` field handles the 80% common case automatically once the component reads the API response unchanged.

Specifically out of scope for Phase 8:
- Component-level sweep to swap `name_en` → `name`.
- Store-level normalization (Zustand stores still hold raw `name_en`/`name_ar`; this is fine because they hydrate from the localized server response).
- Sorting AR labels with `COLLATE "ar-x-icu"` — defer until users report sort-order complaints. The current `ORDER BY name_en` is intentional: stable across locale toggles, since `name_en` doesn't change.
- Full-text search localization — MVP uses `ILIKE` on `name_en`; switch to a per-locale FTS index when search load justifies it.
- AR translations for the 9 user-managed lookup tables — they're empty on deploy, get populated through the Settings UI with both sides at create-time.

## 7. Open questions / follow-ups

- **PDF templates:** rendering choice (`\setmainlanguage{english}` vs `\setmainlanguage{arabic}`) is driven by `meta.locale` in the PDF compile job. The lookup-row `name` field uses the same resolve helper at job-prep time. Already in scope for the PDF pipeline (`.planning/13-pdf-pipeline.md`).
- **Profile language preference:** `profiles.preferred_language` is currently authoritative only on first login (via `/api/team/me`). The toggle button persists to localStorage only; cross-device sync is a known polish-phase task documented in `src/stores/language-store.ts`.
- **Caching:** lookup endpoints set `Cache-Control: public, s-maxage=3600`. Because the response body now varies by locale, downstream CDN caches must either key on locale or honor `Vary: Accept-Language`. The route handlers return a `Cache-Control` header but no `Vary` — acceptable for Vercel's per-function cache where the URL+headers are part of the cache key, but worth confirming if a CDN is added between Vercel and the client.
