# AI.md — Orientation for AI agents (and the humans driving them)

You are working on **ComplianceOS**, a bilingual (English/Arabic, RTL) Governance, Risk & Compliance
platform for Saudi financial institutions. Read this whole file before changing anything. It's written
to give an agent with no prior context enough to make correct changes on the first try.

**Status, so you calibrate:** a fast-built, **single-tenant MVP** (one org per deployment). Code is
real and typed, but conventions drifted across many build "waves". An engineer-led rebuild and a move
to GCP Dammam for data residency are planned ([docs/operations/FIREBASE-MIGRATION.md](docs/operations/FIREBASE-MIGRATION.md)).
When docs and code disagree, **the code wins**. Many docs are dated snapshots (see `docs/history/`).

---

## 1. Commands

```bash
npm install
cp .env.example .env.local      # fill in Supabase keys (see §9)
npm run dev                     # http://localhost:3000
npx tsc --noEmit                # type-check: the primary "did I break it" signal
npm test                        # vitest unit tests (tests/unit), no server needed
npm run lint                    # eslint (next core-web-vitals + typescript)
npm run build                   # production build
npx playwright test tests/e2e/<spec>.ts --workers=1 --reporter=list   # e2e (auto-starts dev server)
npx tsx tests/probes/<probe>.ts # API probes (dev server must already be running)
```

Before you say a change is done: `npx tsc --noEmit` clean + `npm test` green. For UI changes, also
exercise the page in a browser (real clicks; see §8). More in [tests/README.md](tests/README.md).

---

## 2. Stack

Next.js 16 (App Router, `src/` dir) · React 19 · TypeScript strict · Tailwind CSS 4 · Zustand 5 ·
Zod 4 · React Hook Form · Supabase (Postgres + Auth + Storage + RLS) · `@iconify/react` (lucide icons) ·
`@react-pdf/renderer` + an external xelatex container for PDFs · Resend for email · Vercel (hosting + cron).

Path alias: `@/*` → `src/*`.

---

## 3. Repository map

```
src/
  proxy.ts                  Page auth gate (Next 16 "proxy" = old middleware). MUST live in src/.
  app/
    (auth)/                 sign-in, sign-up (disabled notice), forgot/reset-password, verify-email, onboarding
    (dashboard)/            All signed-in pages. layout.tsx mounts Sidebar, LookupHydrator, toast hosts.
      dashboard/            Executive / managerial / officer persona views
      correspondence/       feed, letters, observations, advisory, registry,
                            regulatory-updates/{rules,policies}
      reports/              (tabs)/{compliance-review,audits,risks,executive,detailed}, [auditId]
      team/                 directory (+ access matrix), logs, training
      calendar/, settings/
      observations/, regulatory-updates/, sama-letters/   Legacy redirects only
    welcome/                Post-login splash
    api/                    ~211 Route Handlers, grouped by resource (see §5)
  components/
    ui/                     Shared primitives (Button, Modal, Drawer, EditableSelect, Skeleton, …)
    auth/                   Gate, EntityGate, RoleGuard, ForbiddenPanel, AuthListener, RBAC toast
    layout/                 Sidebar, header, LookupHydrator
    <domain>/               One folder per feature area (observations, correspondence, team, settings, …)
  stores/                   47 Zustand stores. Client-side cache of server state (see §6)
  hooks/                    Dashboard data hooks, deep-link hooks, navigation-loading, etc.
  i18n/                     useTranslation hook, LanguageProvider, dictionaries/{en,ar}.json
  types/index.ts            Main domain types (~150 interfaces). NOT the only place types live.
  config/                   Feature switches (help-center.ts)
  lib/
    api/                    SERVER: route helpers (auth, validate, response, errors, audit, cache),
                            schemas/ (Zod), services/ (shared DB logic), services/scoring/ (compliance engine)
    supabase/               Supabase clients: client.ts (browser), server.ts (RLS, per request), middleware.ts
    rbac/                   permissions.ts (client role→perm resolution), permissions-registry.ts (keys/labels),
                            rbac-store-gate.ts (store-side permission check), rbac-error.ts
    pdf/                    SERVER: react-pdf templates + latex/ (xelatex .tex builders)
    export/                 CLIENT: CSV/print exports, pdf-client.ts (enqueue + poll PDF jobs), report data mappers
    email/                  SERVER: provider-agnostic email (Resend | log). Has its own README.
    escalation/             SERVER: overdue-item escalation scan + daily digest
    format/                 Date/time/bytes/enum/audit-log formatting helpers
    letters/                Letter authorities, approval roles, template placeholders
    workflow/               Circular progress formula, review cadence, deadline rules, default workflow steps
    i18n/server.ts          Render translation keys server-side as {text_en, text_ar}
    auth/                   Session persistence helper
    api-client.ts           CLIENT: the ONLY way the browser calls /api (see §6)
    optimistic.ts           Optimistic-mutation helpers (temp ids, apply → request → reconcile/rollback)
    utils.ts                cn() (clsx + tailwind-merge) and small date helpers
    avatar.ts, category-config.ts, authority-display.ts, …   Small shared helpers
supabase/migrations/        125 ordered SQL migrations (schema, RLS, RPCs, seeds). The DB source of truth.
services/latex-renderer/    Standalone Express + xelatex container (deployed on Render). POST /render.
tests/                      unit/ (vitest) · e2e/ (playwright) · probes/ (tsx scripts). See tests/README.md
scripts/                    One-off generators (backend spec .docx, sample letter PDF)
docs/                       architecture/ · operations/ · product/ · help-center/ · history/. See docs/README.md
vercel.json                 Cron: /api/cron/jobs-run every minute, /api/cron/daily at 12:00 UTC
```

---

## 4. How a request flows

```
Page (client component)
  └─ Zustand store action  (optimistic update first; rbac-store-gate check)
       └─ api-client.ts    (/api prefix, cookies, {data} unwrap, GET dedupe, 401 refresh+retry)
            └─ src/app/api/**/route.ts
                 ├─ requireUser() / requirePerm('x:edit')   ← JWT claims (custom access token hook)
                 ├─ parseJson / parseQuery (Zod .strict())  ← rejects unknown keys with 400
                 ├─ Supabase query with the USER's client  ← RLS enforces has_permission() again
                 ├─ writeAudit(...) + timeline write
                 └─ ok(data, { cache: 'no-store' })        → { data } | { error: { code, message } }
```

Permissions are enforced **twice** on the server: in the route (`requirePerm`) and in Postgres RLS
(`public.has_permission()`). The client-side checks (`useCan`, `<Gate>`, `requirePermission` in stores)
are UX only; they hide buttons and fail fast, but they aren't security.

---

## 5. Backend

### Route handler skeleton (the pattern ~all 211 routes follow)

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ fooId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { fooId } = await params
    assertUuid(fooId)                                       // 400 on bad id
    const { supabase, user } = await requirePerm('foo:edit') // 401 / 403
    const ifMatch = readIfMatch(req)                        // optimistic locking
    const patch = await parseJson(req, UpdateFooSchema)     // Zod, .strict()
    const { data: before } = await supabase.from('foos').select(FOO_COLUMNS).eq('id', fooId).maybeSingle()
    assertNotStale(ifMatch, before?.updated_at)             // 412 if stale
    let q = supabase.from('foos').update(patch).eq('id', fooId)
    if (ifMatch) q = q.eq('updated_at', ifMatch)
    const { data, error } = await q.select(FOO_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) throw ifMatch ? PreconditionFailed() : NotFound()
    await writeAudit({ actor_id: user.id, action: 'foo.update', entity_type: 'foo', entity_id: fooId, supabase })
    revalidateAll([cacheTags.foos(), cacheTags.foos(fooId)])
    return ok(data, { cache: 'no-store' })
  } catch (e) { return handle(e) }                          // ApiError → JSON envelope
}
```

Helpers: `src/lib/api/auth.ts` (`requireUser`, `requirePerm`, `requireAnyPerm`, `requireAllPerms`,
`hasEditOrOwnership`, `canDriveWorkflow`), `validate.ts`, `response.ts` (`ok`, `err`, `paginate`),
`errors.ts` (`ApiError`, `NotFound`, `Forbidden`, `PreconditionFailed`, `handle`), `audit.ts`, `cache.ts`.

- **Schemas** (`src/lib/api/schemas/*`): Zod only. Objects are `.strict()`; free text goes through `stripHtml`.
- **Services** (`src/lib/api/services/*`): shared column lists, detail loaders, existence asserts,
  timeline writers, ref-code minting. Routes still query Supabase directly; there's no "thin route" rule.
- Reference codes (`OBS-…`, `SAMA-NOB-YYYY-NNNN`, …) are **minted server-side**. Never send them in POST bodies.

### Supabase clients — pick the right one

| Client | Use | RLS |
|---|---|---|
| `lib/supabase/client.ts` | Browser only (auth, a few direct writes) | yes |
| `lib/supabase/server.ts` | Routes, via `requireUser()`. One per request | yes |
| `lib/api/admin.ts` `getAdminClient()` | Cron, job runners, audit writes, scoring RPC, escalation | **bypasses RLS** |

Without `SUPABASE_SERVICE_ROLE_KEY`, jobs don't run and the scoring RPC fails. Use the admin client
only where the user's client genuinely can't work, and never pass it user-controlled filters unchecked.

### Auth, roles, permissions

- `src/proxy.ts` gates **pages only**. `/api/*` is excluded on purpose: routes return 401 JSON
  themselves and cron authenticates with a bearer secret. The matcher fails closed (explicit static
  extension allowlist). Sign-in consumes `?next=` through `safeNext()` (same-origin only).
- Roles (migration 108): `auditor` < `officer` < `manager` < `admin`. DB keys equal client values.
  `manager` is admin-level and the escalation target.
- The custom access token hook (migration 028; **must be enabled by hand** in Supabase Studio →
  Auth → Hooks) puts `role` + `permissions[]` in the JWT. **A role change takes effect only after the
  user's next token refresh/login.**
- Two vocabularies: backend keys are lowercase (`observation:edit`, `edit`, `workflow:advance`,
  `settings:edit`). UI labels (`'Manage Settings'`) live in `lib/rbac/permissions-registry.ts`, which
  maps them to keys. **Never pass a label to `requirePerm`.** The canonical list is the `permissions`
  table (migrations 018, 115, 117).
- `edit` and `workflow:advance` are deliberately separate (`canDriveWorkflow`).

### Background jobs

`jobs` table, `unique(kind, idempotency_key)`. Enqueued by `/api/pdf/generate`, `lib/email/enqueue.ts`,
scoring. Worker = `/api/cron/jobs-run` (Bearer `CRON_SECRET`, claims 5 per tick via `rpc('claim_jobs')`,
exponential backoff). Kinds handled: `pdf.generate`, `pdf.latex`, `email.send`. Client polls
`GET /api/jobs/[id]`. In local dev (no `VERCEL` env + service key present) PDF/email jobs run inline.
`/api/cron/daily`: escalation scan → daily digest email → prune notifications.

### PDFs

`lib/export/pdf-client.ts` → `POST /api/pdf/generate` (202 `{jobId}`) → worker →
`engine: 'latex'` ⇒ `lib/pdf/latex/run-latex-job.ts` builds `.tex` (hand-rolled builders, `escapeLatex`
is the injection gate) and POSTs to `LATEX_RENDER_URL` (the `services/latex-renderer` container).
Otherwise ⇒ react-pdf templates in `lib/pdf/templates/`. Output lands in the `pdf-renders` bucket and
downloads via `/api/pdf/download/[jobId]`. LaTeX gotchas (load `polyglossia` last, Amiri font setup,
`\textenglish{}` for LTR tokens) are documented in [docs/architecture/latex-pdf-generation-design.md](docs/architecture/latex-pdf-generation-design.md).

### Email + escalation

`enqueueEmail()` → `email.send` job → `lib/email/send.ts`. Resend if `RESEND_API_KEY` is set,
otherwise a console logger, so dev never throws. `EMAIL_OVERRIDE_TO` redirects all mail (sandbox).
`lib/escalation/scan.ts` buckets checklist items into due7/due3/due1/overdue and writes in-app
notifications. `digest.ts` sends one role-aware daily digest per opted-in user. See `src/lib/email/README.md`.

### Compliance scoring

`lib/api/services/scoring/`: `compliance-engine.ts` (5 weighted components + per-framework scores),
`dashboard-health.ts` (7 components), `gather-inputs.ts` (one RPC via admin client, RLS fallback).
Exposed by `GET /api/compliance/score` and `/api/compliance/dashboard-health`, cached in
`compliance_scores_cache` (1h TTL). Two different thresholds exist: the company-wide target score
(compliance-settings singleton, gates the dashboard hero) vs per-framework thresholds.

### Database & migrations

- `supabase/migrations/NNN_snake_name.sql`, applied in order. **Never edit an applied migration.**
  Add the next number (currently 126). Write migrations idempotently (`if not exists`, `create or replace`).
- No Supabase CLI config is checked in. Migrations have been applied with the Supabase MCP
  `apply_migration` tool or the SQL editor. Ask a human before applying to a shared project.
- Seeds live in migrations (018, 022, 024, 034, 035, 090…). Seeded dev accounts all use one shared
  dev password (see `tests/e2e/_helpers/sign-in.ts`). `admin@complianceos.local` is the test admin.
  **Rotate these before any real deployment.**
- Hard deletes cascade by FK and still leave an `audit_logs` row ([OPTIMIZATION-PATTERNS §4](docs/architecture/OPTIMIZATION-PATTERNS.md)).
- No generated DB types. API row shapes are hand-written `*ApiRow` interfaces in each store.

---

## 6. Frontend

### Stores (Zustand) — the canonical shape

```ts
interface XState {
  items: X[]; byId: Record<string, X>; selectedX: X | null
  isLoading: boolean; isMutating: boolean; error: string | null; lastFetched: number | null
  fetchAll(force?: boolean): Promise<void>; fetchById(id: string); create; update; delete
}
fetchAll: async (force = false) => {
  if (!force && get().lastFetched && Date.now() - get().lastFetched! < 30_000) return   // 30s TTL
  set({ isLoading: true, error: null })
  const res = await api.get<Paginated<XApiRow>>('/xs', { page: 1, pageSize: 100 })
  const items = res.items.map(mapRow)                    // snake_case API row → camelCase domain type
  set({ items, byId: Object.fromEntries(items.map(i => [i.id, i])), isLoading: false, lastFetched: Date.now() })
}
```

- Mutations are **optimistic**: apply to the store → request → reconcile or roll back with a toast.
  Use `runOptimistic` / `optimisticMutation` from `lib/optimistic.ts` in new code (only some stores do today).
- PATCH/DELETE send `If-Match` with the row's `updatedAt` (`ifMatchHeader`). Handle 412 as "someone else changed this".
- Only 6 stores `persist` to localStorage (language, user-preferences, help, onboarding-*). Everything else is server state.
- `fetchById` must not reopen a closed or deleted modal: `selectedX: state.selectedX?.id === id ? fresh : state.selectedX`.

### `api-client.ts`

`api.get/post/patch/delete`. It adds `/api`, sends cookies, unwraps `{data}`, throws `ApiClientError`
(`code`, `status`, `details`), dedupes identical in-flight GETs, refreshes the session once on 401
(then redirects to sign-in), and toasts on 403 for writes. Don't call `fetch('/api/…')` directly.

### i18n + RTL

```tsx
const { t, tCount, isRTL } = useTranslation()      // src/i18n/hooks/useTranslation.ts
<h1>{t('dashboard.title')}</h1>
<p>{tCount('regulatoryUpdates.circularsFound', n)}</p>   // _one / _other keys
```

- **Every user-visible string goes through `t()`.** Add each key to BOTH `src/i18n/dictionaries/en.json`
  and `ar.json`. `TranslationKey` is derived from `en.json`, so a missing EN key is a type error.
- Bilingual DB columns are `name_en`/`name_ar` (see `use-localized-name.ts`; server: `lib/api/i18n.ts`).
  Server-written timeline text uses `renderBilingual()` from `lib/i18n/server.ts`.
- Prefer logical Tailwind utilities (`ms-`, `me-`, `ps-`, `start-`, `end-`) over `ml-`/`left-`, so RTL works.
- Dates: use the helpers in `lib/format/`. **Watch out:** `format-date.ts` and `time-utils.ts` both
  export `formatRelativeTime` and `formatLocalizedDate` with *different signatures*. Check which one a
  file imports before reusing it.

### UI conventions

- Icons: `<Icon icon="lucide:name" />` from `@iconify/react`. Classes: `cn()` from `lib/utils.ts`.
- Colors: raw Tailwind `emerald-*` etc. are what's actually used. The `@theme` tokens in `globals.css` are mostly unused.
- Primitives in `components/ui/` (import each file directly; the `index.ts` barrel is unused):
  `Modal` renders `role="dialog"` + `aria-label={title}`. `EditableSelect` portals its listbox
  to `document.body` (`role="listbox"`/`"option"`), so click-outside handlers must allow `[role=listbox]`.
- Loading: per-section skeletons gate on `detailLoading && sectionEmpty`. A spinner must span the
  **whole** operation (mutation + awaited refetch + onSuccess) via a local busy flag, never the store's
  `isMutating`. See [OPTIMIZATION-PATTERNS](docs/architecture/OPTIMIZATION-PATTERNS.md) §1–3.
- List endpoints don't hydrate detail-only arrays (e.g. `workflowSteps`). Derive list-row display
  from list columns (`progress`, `currentPhase`), not from recomputing over empty arrays.
- Calendar → item deep links use `stores/deep-link-store.ts` + `hooks/useDeepLink.ts` + `data-highlight-id`.
  **Never put sub-item ids in the URL** (it caused refresh loops).
- Error copy: specific, no blame, says how to fix ([INPUT-ERROR-MESSAGING-AUDIT](docs/architecture/INPUT-ERROR-MESSAGING-AUDIT.md)).

---

## 7. Recipes

**Add an API endpoint**
1. Zod schema in `src/lib/api/schemas/<resource>.ts` (`.strict()`, `stripHtml` on text).
2. `src/app/api/<resource>/…/route.ts` following the skeleton in §5. Use the lowest permission that
   makes sense (`requireUser` for reads, `requirePerm`/`requireAnyPerm([granular, 'edit'])` for writes).
3. Make sure RLS on the table agrees (new migration if not).
4. Per-user / mutable GETs return `ok(data, { cache: 'no-store' })`. A cached header served stale data after saves.
5. Add a probe in `tests/probes/` if it has security-relevant behaviour (401/403/400/412).

**Update schemas carefully:** `UpdateSchema = CreateSchema.partial()` re-applies the create schema's
`.default()` values on PATCH and silently overwrites untouched columns. Override those keys as plain `.optional()`.

**Add a DB change:** new `supabase/migrations/126_<name>.sql` (idempotent). Include RLS policies and
grants. If it adds a permission, also update `permissions-registry.ts` and `role_permissions` seeds.

**Add a page:** `src/app/(dashboard)/<route>/page.tsx` (client component). Add a sidebar entry in
`components/layout/`, i18n keys in both dictionaries, a store in `src/stores/` if it holds server state,
and a skeleton for the loading state. Auth is automatic via `src/proxy.ts`.

**Add a PDF:** LaTeX path: a builder in `lib/pdf/latex/render-<name>.ts` reusing `report-base.ts`,
register it in the `BUILDERS` map in `run-latex-job.ts`, add the template's export permission in
`/api/pdf/generate`, call `downloadPdf({ template, engine: 'latex', locale })` from the page.

**Add a background job kind:** enqueue with an idempotency key, add a `case` in the `dispatch()`
switch in `src/app/api/cron/jobs-run/route.ts`, and write the runner next to its domain.

**Change roles:** touch `src/types/index.ts` (`User['role']`), `lib/rbac/permissions.ts`,
`lib/api/schemas/team.ts` (`RoleKey`), Team UI (drawer, invite, AccessMatrix), i18n role labels, and DB
`roles`/`role_permissions` + check constraints.

---

## 8. Verifying UI work

- Drive the UI with **real mouse events** (Playwright `page.click`). `el.click()` in page JS skips
  pointer handlers and has hidden real bugs here.
- E2E sign-in uses `tests/e2e/_helpers/sign-in.ts`, which retries for the dev-mode hydration race.
  Don't simplify it.
- Specs create and delete their own rows. If a run dies, clean up rows titled `E2E TEST%` before rerunning.
- If an e2e step fails, first check whether the **spec** encodes old behaviour (`tests/e2e/verification/`
  specs especially). Then check the app.
- Verify auth gating with cookie-free `curl` (expect `307 → /sign-in` on pages, `401` JSON on `/api`),
  not a browser that may still hold a session.

---

## 9. Environment

See [.env.example](.env.example). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Optional: `LATEX_RENDER_URL`/`LATEX_RENDER_SECRET` (LaTeX
PDFs), `RESEND_API_KEY` + `EMAIL_*` (email). Never commit `.env.local`. Never print secret values in logs or docs.

---

## 10. Known issues and tech debt (verified 2026-10)

Fixing these is fair game, but treat each as its own change:

1. **`compliance.recompute` jobs are never processed.** `services/compliance.ts` enqueues them, but
   `cron/jobs-run` `dispatch()` has no case, so they fail as "Unknown job kind". A cold cache that
   times out returns 202 "computing" and never completes in the background.
2. **Cache tags are no-ops.** ~160 routes call `revalidateAll(...)`, but nothing is cached with tags
   (`'use cache'`/`cacheTag`/`unstable_cache` unused) and routes are `force-dynamic`.
3. `/api/compliance/score` and `/dashboard-health` use `Schema.parse()` instead of `parseQuery`,
   so bad query params return 500 instead of 400.
4. Duplicate migration numbers `025_*` and `026_*` (two files each). Don't "fix" by renaming applied files.
5. Duplicate date helpers (`lib/format/format-date.ts` vs `time-utils.ts`; plus `date-format.ts` and `utils.formatDate`).
6. Types are spread out: `src/types/index.ts`, `*ApiRow` in stores, `components/*/…-types.ts`, and
   page-local duplicates in reports pages.
7. Several pages are monoliths (letters ~2.9k lines, `reports/[auditId]` ~2k). ~22 pages define a
   local `Toast` although `pushToast` + `ToastHost` exist globally.
8. Some stores mint `tmp-` ids that `isTempId()` (which expects `temp-`/`local-`) doesn't recognise.
9. `circular-store.ts` hardcodes its own initial workflow steps instead of using `lib/workflow/workflow-defaults.ts`.
10. `/api/settings/policy-categories` duplicates `/api/policy-categories` and has no callers.
11. `components/DemoReset.tsx` (in the root layout) renders `null` until mounted, so pages don't SSR.
    It also wipes localStorage keys from the old mock-data era when `DEMO_SEED_VERSION` changes.
12. Comments still mention `.planning/*.md` files and a root `middleware.ts`; neither exists any more.
13. The `cron/daily` header comment says 03:00, but `vercel.json` schedules it at 12:00 UTC.
14. Unused: `components/ui/tabs.tsx`, `progress.tsx`, `reports/schedule-report-modal.tsx`, `team/invite-member-modal.tsx`.

Production go-live work that's deliberately deferred (rate limiting, HSTS, CSP tightening, RLS tightening, …)
is tracked in [docs/operations/PRODUCTION-READINESS.md](docs/operations/PRODUCTION-READINESS.md).

---

## 11. Working agreements for agents

- Read the surrounding code and match its idiom: comment density, naming, error handling.
  Comments often cite `BACKEND-API-MAP §N`, `OPTIMIZATION-PATTERNS §N`, `PR-N`. Those live in `docs/`.
- Keep server-only code (`lib/api`, `lib/pdf`, `lib/email`, `lib/escalation`, anything using
  `getAdminClient`) out of client components.
- Don't apply migrations, flip feature switches, or send email against a shared Supabase/Resend
  project without a human's go-ahead.
- Don't trust `docs/history/*`, `docs/product/PRODUCT-BACKLOG.md`, or old comments for current
  counts or paths. `git log` and the code are current.
- Small, verifiable changes: type-check + unit tests after each. Mention anything you couldn't verify.
