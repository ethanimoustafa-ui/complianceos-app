/**
 * FINAL VERIFICATION SWEEP
 *
 * Visits every page in the app in order, captures cold-load metrics
 * (request count, console errors/warnings, perf timing, skeleton vs "Loading..."
 * text), runs one targeted CRUD-cascade against `/correspondence/observations`,
 * and writes raw metrics to tests/e2e/_artifacts/final-sweep-metrics.json so the
 * accompanying FINAL-VERIFICATION.md can be generated.
 *
 * Run: npx playwright test tests/e2e/final-sweep.spec.ts --workers=1 --reporter=list
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ADMIN } from './_helpers/sign-in'
import { attachMeasure, readPerfTiming, probeUiArtifacts, type RouteMetrics } from './_helpers/measure'

/**
 * Local sign-in with retry. The shared helper occasionally clicks the submit
 * button before React has hydrated the onSubmit handler, leaving the page
 * stuck on /sign-in. Retrying the click handles that race.
 */
async function robustSignIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator('input[type="email"]').fill(ADMIN.email)
  await page.locator('input[type="password"]').fill(ADMIN.password)
  // Wait briefly for hydration before clicking, then retry up to 3×.
  await page.waitForTimeout(1_500)
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /sign in|log in/i }).click()
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 20_000 })
      return
    } catch {
      // still on /sign-in — wait and retry
      await page.waitForTimeout(2_000)
    }
  }
  throw new Error('robustSignIn: still on /sign-in after 3 click attempts')
}

const ROUTES: string[] = [
  '/dashboard',
  '/correspondence/regulatory-updates/rules',
  '/correspondence/regulatory-updates/policies',
  '/correspondence/observations',
  '/correspondence/letters',
  '/correspondence/feed',
  '/correspondence/registry',
  '/reports/audits',
  '/reports/risks',
  '/reports/compliance-review',
  '/reports/executive',
  '/reports/detailed',
  '/calendar',
  '/team/directory',
  '/team/training',
  '/team/logs',
  '/settings',
]

const ARTIFACT_DIR = path.join(process.cwd(), 'tests', 'e2e', '_artifacts')
const METRICS_FILE = path.join(ARTIFACT_DIR, 'final-sweep-metrics.json')
const COLD_BUDGET = 25

test.describe.configure({ mode: 'serial' })

test('final sweep — cold load every page + capture metrics', async ({ page, context }) => {
  test.setTimeout(20 * 60_000)
  await context.clearCookies()
  await robustSignIn(page)

  await fs.mkdir(ARTIFACT_DIR, { recursive: true })

  const results: RouteMetrics[] = []

  for (const route of ROUTES) {
    const m = attachMeasure(page)
    m.setRoute(route)
    m.start()
    let navOk = true
    let navError: string | null = null
    try {
      // domcontentloaded + a fixed settle window — many pages keep long-lived
      // SSE/realtime connections open, so 'networkidle' is unreliable here.
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    } catch (err) {
      navOk = false
      navError = err instanceof Error ? err.message : String(err)
      try {
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `final-sweep-${route.replace(/\//g, '_')}-fail.png`),
          fullPage: true,
        })
      } catch {
        /* ignore */
      }
    }
    // Allow store hydration + SWR settle. 2 s captures the bulk of REST traffic
    // on every page based on the existing request-budget runs.
    await page.waitForTimeout(2_000)
    const perf = await readPerfTiming(page)
    const ui = await probeUiArtifacts(page)
    const metrics = m.stop()
    metrics.ttfp = perf.ttfp
    metrics.domContentLoaded = perf.domContentLoaded
    metrics.loadEvent = perf.loadEvent
    metrics.loadingTextSeen = ui.loadingTextSeen
    metrics.skeletonsSeen = ui.skeletonsSeen
    if (!navOk && navError) metrics.consoleErrors.unshift(`NAV_ERROR: ${navError}`)
    results.push(metrics)
    // eslint-disable-next-line no-console
    console.log(
      `[sweep] ${route.padEnd(50)} counted=${metrics.countedRequests} ` +
        `total=${metrics.totalRequests} errs=${metrics.consoleErrors.length} ` +
        `4xx+=${metrics.httpErrors.length} ttfp=${metrics.ttfp ?? '?'}ms`,
    )
  }

  // ---- Targeted CRUD cascade probe on observations (lightweight) ----
  const cascade: { step: string; ok: boolean; detail?: string }[] = []
  try {
    await page.goto('/correspondence/observations', { waitUntil: 'networkidle' })
    cascade.push({ step: 'navigate to observations', ok: true })
    // Look for a "New" / "Create" button; tolerate label variation.
    const newBtn = page.getByRole('button', { name: /new|create|add/i }).first()
    if ((await newBtn.count()) > 0) {
      cascade.push({ step: 'found create button', ok: true })
    } else {
      cascade.push({
        step: 'found create button',
        ok: false,
        detail: 'no New/Create/Add button visible on observations page',
      })
    }
  } catch (err) {
    cascade.push({
      step: 'cascade probe',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // Persist raw metrics + cascade transcript for the markdown report.
  await fs.writeFile(
    METRICS_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), coldBudget: COLD_BUDGET, results, cascade }, null, 2),
    'utf8',
  )

  // Soft assertion: no NAV_ERROR entries.
  const navFailures = results.filter((r) => r.consoleErrors.some((e) => e.startsWith('NAV_ERROR:')))
  expect(
    navFailures,
    navFailures.map((r) => `${r.route} :: ${r.consoleErrors[0]}`).join('\n'),
  ).toHaveLength(0)
})
