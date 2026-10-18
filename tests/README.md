# Tests

Three kinds, each with its own runner. All of them except unit tests expect a dev server
(`npm run dev`) on `http://localhost:3000`, pointed at a Supabase project that has the
migrations applied.

| Folder | What | Runner | Needs a server? |
|---|---|---|---|
| `unit/` | Pure-function tests (formatting, LaTeX builders, escalation rungs, refcodes…) | Vitest: `npm test` | No |
| `e2e/` | Browser end-to-end flows | Playwright: `npx playwright test` | Yes (auto-started) |
| `probes/` | Standalone HTTP scripts that hit the API (security, RBAC, concurrency, i18n leaks…) | `npx tsx tests/probes/<name>.ts` | Yes (must already be running) |

`fixtures/` holds shared test files (e.g. a signature image used for uploads).

## Unit (`tests/unit`)

```bash
npm test              # vitest run
npm run test:watch
```

Config is `vitest.config.ts`: Node environment, `@/` maps to `src/`. Keep these free of
network, DB and React rendering. If a test needs any of those, it belongs in e2e or probes.

## E2E (`tests/e2e`)

```bash
npx playwright test tests/e2e/circulars-e2e.spec.ts --workers=1 --reporter=list
```

- `playwright.config.ts` sets `testDir: ./tests/e2e`, and `reuseExistingServer: true` reuses a running `npm run dev`.
- Sign in with `_helpers/sign-in.ts`. It has a click-retry loop for the dev-mode hydration race, so don't replace it with a single click.
- Default test admin: `admin@complianceos.local` / `ComplianceOS!2026` (seeded by migrations 024/090, **dev only**).
- Specs create and hard-delete their own rows. If a run dies midway, clean leftovers with SQL (`title LIKE 'E2E TEST%'` and similar) or step counts compound and time out.
- Prefer stable selectors: `role="dialog"` + `aria-label` on modals, `role="listbox"` / `role="option"` on dropdowns (they're portalled to `document.body`).
- Screenshots and other outputs go to `e2e/_artifacts/` (git-ignored).

Layout:

| Path | Contents |
|---|---|
| `*-e2e.spec.ts` | Per-domain suites (audits, calendar, circulars, letters, observations, policies, risks, training). The **core green suites** are `circulars-e2e`, `policies-e2e`, `observations-e2e`. |
| `walk-*.spec.ts` | Discovery walks. Each visits every page in a group and records console errors and non-2xx responses. |
| `smoke.spec.ts`, `final-sweep.spec.ts`, `request-budget.spec.ts` | Cross-cutting checks: pages render, console/network cleanliness, and a request-count budget per page (`REQ_BUDGET`, default 20). |
| `crud.spec.ts` | Diagnostic CRUD flows. They soft-skip on UI label drift, so a skip is not a failure. |
| `verification/` | One-off specs written to confirm a specific fix wave (`fix-*`, `wave*`, `us01-04-*`). Kept for regression value, but **may encode old behaviour**. When one fails, check whether the spec or the app is wrong before changing app code. |
| `_helpers/` | `sign-in.ts`, `measure.ts` (perf/request metrics), `pull-logs.ts`. |

## Probes (`tests/probes`)

Each file is a self-contained script with a `USAGE:` comment at the top. Common inputs:

- `BASE_URL`: defaults to `http://localhost:3000`.
- `--cookie="sb-…-auth-token=…"` or `COOKIE=…`: a signed-in session cookie. Copy it from the browser's dev tools.
- Some probes sign in themselves with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Entity-specific probes take ids (e.g. `--letter=<uuid>`).

Probes exit non-zero on any failed assertion. Vitest doesn't pick them up.
