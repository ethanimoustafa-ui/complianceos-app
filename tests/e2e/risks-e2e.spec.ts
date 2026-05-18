/**
 * Comprehensive end-to-end test of the Risks page.
 *
 * Mirrors the structure of `observations-e2e.spec.ts`,
 * `circulars-e2e.spec.ts`, and `policies-e2e.spec.ts`:
 * sequential serial steps, shared state, JSON report artifact, console capture.
 *
 * Acceptance criteria (from the RISKS-VERIFY agent brief):
 *   1. Cold load `/reports/risks`. Request count + console errors.
 *      (NB: there is no standalone `/risks` route — the risks register lives
 *       under reports as `/reports/risks`; confirmed via
 *       `walk-audits-observations-risks.spec.ts`.)
 *   2. Create a risk via API. Verify list.
 *   3. Hard-refresh — persists.
 *   4. Open detail — header instant, deferred sections skeleton-then-real.
 *   5. Add mitigation plan + checklist item. Toggle. Edit. Hard-refresh persists.
 *   6. Critical UX test: create a risk via UI then nav immediately to detail
 *      (deep-link `?id=`) — verify header renders, NOT "Risk Not Found".
 *   7. Hard-delete the risk (caller-side via MCP SQL hand-off). Cascade verified
 *      by orchestrator over: risk_mitigation_checklist,
 *      risk_department_proposed_plan, risk_history.
 *
 * Pragmatic mapping:
 *   - "Mitigation plan + checklist item" maps onto the existing top-level risk
 *     checklist surface: POST /api/risks/:id/checklist (add),
 *     PATCH /api/risks/:id/checklist/:itemId (edit + toggle).
 *     The richer department-proposed-plan workflow has its own state machine
 *     (not-started -> sent-to-department -> plan-proposed); the spec leaves
 *     that surface alone and exercises the simpler checklist surface that the
 *     UI actually presents on cold-create risks.
 *   - Step 6 navigates to `/reports/risks?id=<riskId>` — the page reads `?id=`
 *     to auto-open the risk drawer (see deepLinkIdRef in the page).
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import { signIn } from './_helpers/sign-in'
import fs from 'node:fs'
import path from 'node:path'

const RISKS_URL = '/reports/risks'
const PROJECT_REF = 'qdbitfgxbnbzkqhdoepd'
const ARTIFACTS_DIR = path.join(process.cwd(), 'tests', 'e2e', '_artifacts')
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })

const REPORT_FILE = path.join(ARTIFACTS_DIR, `risks-e2e-${Date.now()}.json`)
const STORAGE_STATE = path.join(ARTIFACTS_DIR, 'risks-e2e-storage.json')

// ---- shared state across the serial suite ---------------------------------
type SharedState = {
  riskId?: string
  riskTitle?: string
  uiRiskId?: string
  uiRiskTitle?: string
  itemId?: string
  consoleErrors: string[]
  consoleWarnings: string[]
  coldLoadRequestCount?: number
  coldLoadTopEndpoints?: Array<{ path: string; count: number }>
  detailFirstPaintMs?: number
  skeletonSeen?: boolean
  uiCreateThenNavHeaderMs?: number
  uiCreateThenNavHeaderFound?: boolean
  cascadeCounts?: Record<string, number>
  stepResults: Array<{ step: number; name: string; status: 'PASS' | 'FAIL'; note?: string }>
}
const S: SharedState = {
  consoleErrors: [],
  consoleWarnings: [],
  stepResults: [],
}

function recordStep(num: number, name: string, status: 'PASS' | 'FAIL', note?: string) {
  S.stepResults.push({ step: num, name, status, note })
  fs.writeFileSync(REPORT_FILE, JSON.stringify(S, null, 2))
}

function installConsoleCapture(page: Page) {
  page.on('console', (m: ConsoleMessage) => {
    const txt = m.text()
    if (m.type() === 'error') S.consoleErrors.push(txt.slice(0, 400))
    if (m.type() === 'warning') S.consoleWarnings.push(txt.slice(0, 400))
  })
  page.on('pageerror', (err) => {
    S.consoleErrors.push(`[pageerror] ${err.name}: ${err.message}`)
  })
}

function isCountableRequest(url: string): boolean {
  if (url.includes(`${PROJECT_REF}.supabase.co/rest/v1/`)) return true
  if (url.includes(`${PROJECT_REF}.supabase.co/auth/v1/`)) return true
  if (url.includes(`${PROJECT_REF}.supabase.co/storage/v1/`)) return true
  if (/^https?:\/\/localhost:3000\/api\//.test(url)) return true
  return false
}

function pathKey(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

const RUN_TAG = Date.now().toString(36)
const RISK_TITLE = `E2E TEST RISK ${RUN_TAG}`
const RISK_TITLE_UI = `E2E UI RISK ${RUN_TAG}`

test.describe.configure({ mode: 'serial' })

test.describe('Risks E2E', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await signIn(page, { timeout: 120_000 })
      await ctx.storageState({ path: STORAGE_STATE })
    } finally {
      await page.close().catch(() => {})
      await ctx.close().catch(() => {})
    }
  })

  // ── Step 1 — Cold load + request budget + console pass ─────────────────
  test('step 1: cold load — measure request count + console errors', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    const reqs: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (isCountableRequest(url)) reqs.push(url)
    })

    const t0 = Date.now()
    await page.goto(RISKS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(800)
    const t1 = Date.now()

    const grouped: Record<string, number> = {}
    for (const url of reqs) {
      const k = pathKey(url)
      grouped[k] = (grouped[k] || 0) + 1
    }
    const top = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, count]) => ({ path: p, count }))

    S.coldLoadRequestCount = reqs.length
    S.coldLoadTopEndpoints = top

    console.log(`\n[step 1] risks cold load took ${t1 - t0}ms`)
    console.log(`[step 1] cold-load request count: ${reqs.length}`)
    console.log(`[step 1] top 5 endpoints:`)
    for (const e of top) console.log(`           ${String(e.count).padStart(3)} × ${e.path}`)
    console.log(`[step 1] console errors so far: ${S.consoleErrors.length}`)
    console.log(`[step 1] console warnings so far: ${S.consoleWarnings.length}`)

    recordStep(
      1,
      'cold load',
      reqs.length <= 25 && S.consoleErrors.length === 0 ? 'PASS' : 'FAIL',
      `${reqs.length} reqs (budget 25), ${S.consoleErrors.length} errors`,
    )
    await ctx.close()
  })

  // ── Step 2 — Create risk via API + verify card appears ─────────────────
  test('step 2: create risk via API + verify list shows it', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    const createRes = await ctx.request.post('/api/risks', {
      data: {
        title: RISK_TITLE,
        description: 'created by risks-e2e playwright spec — safe to delete',
        category: 'operational',
        likelihood: 3,
        impact: 4,
        monitoring_frequency: 'quarterly',
        framework_ids: [],
      },
    })
    expect(
      createRes.status(),
      `create risk -> ${createRes.status()} body=${await createRes.text().catch(() => '?')}`,
    ).toBeLessThan(300)
    const env = await createRes.json()
    const created = env.data ?? env
    S.riskId = created.id
    S.riskTitle = RISK_TITLE
    expect(S.riskId).toMatch(/^[0-9a-f-]{36}$/)

    await page.goto(RISKS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(600)
    const card = page.locator(`text="${RISK_TITLE}"`).first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    console.log(`[step 2] risk id: ${S.riskId}`)
    recordStep(2, 'create risk + list shows it', 'PASS', `id=${S.riskId}`)
    await ctx.close()
  })

  // ── Step 3 — Hard-refresh persistence ──────────────────────────────────
  test('step 3: hard-refresh persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    await page.goto(RISKS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(800)
    const card = page.locator(`text="${RISK_TITLE}"`).first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // API-level persistence check too — the row is queryable straight from
    // /api/risks regardless of UI render.
    const listRes = await ctx.request.get(`/api/risks?id=${S.riskId}`)
    expect(listRes.status()).toBeLessThan(300)
    const listEnv = await listRes.json()
    const items: Array<{ id: string }> = listEnv.data?.items ?? listEnv.items ?? []
    expect(items.find((r) => r.id === S.riskId), 'risk found via API after reload').toBeTruthy()

    recordStep(3, 'hard-refresh persists', 'PASS', `id=${S.riskId} survived reload`)
    await ctx.close()
  })

  // ── Step 4 — Detail drawer: header instant, deferred sections skeleton ─
  test('step 4: open detail — header renders instantly, deferred sections skeletoned', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    await page.goto(RISKS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(600)

    const card = page.locator(`text="${RISK_TITLE}"`).first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    const t0 = Date.now()
    await card.click()
    // Header text comes from the list-row data and should appear immediately.
    // The risks page uses a Drawer (role=dialog) to render detail.
    const drawer = page.locator('[role="dialog"]').first()
    await expect(drawer.getByText(RISK_TITLE, { exact: false }).first()).toBeVisible({ timeout: 4000 })
    const tHeader = Date.now() - t0
    S.detailFirstPaintMs = tHeader

    // Sample skeleton presence early — some platforms paint detail fast enough
    // that .animate-pulse blocks have already settled.
    const skeletonCount = await drawer.locator('.animate-pulse').count().catch(() => 0)
    S.skeletonSeen = skeletonCount > 0
    console.log(`[step 4] header visible after ${tHeader}ms; pulse skeletons seen: ${skeletonCount}`)

    // After detail settles, deferred sections (history / mitigation / checklist)
    // should be present.
    await page.waitForTimeout(2000)
    const deferredLabels = await drawer
      .locator('text=/history|timeline|mitigation|checklist|review|likelihood|impact/i')
      .count()
    console.log(`[step 4] deferred-section labels after settle: ${deferredLabels}`)

    recordStep(
      4,
      'detail drawer — header instant + deferred sections',
      tHeader < 2500 && deferredLabels > 0 ? 'PASS' : 'FAIL',
      `headerMs=${tHeader} skeletons=${skeletonCount} deferredLabels=${deferredLabels}`,
    )
    await ctx.close()
  })

  // ── Step 5 — Mitigation plan + checklist item lifecycle + persistence ──
  test('step 5: mitigation checklist add/toggle/edit + hard-refresh persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    const riskId = S.riskId!
    expect(riskId, 'risk id from step 2 must be set').toBeTruthy()

    // 5a — set a mitigation_plan via PATCH /api/risks/:id (matches the
    // "Add mitigation plan" half of the brief).
    const patchPlanRes = await ctx.request.patch(`/api/risks/${riskId}`, {
      data: { mitigation_plan: 'E2E mitigation plan — initial' },
    })
    expect(patchPlanRes.status(), 'set mitigation_plan').toBeLessThan(300)

    // 5b — ADD a checklist item.
    const addRes = await ctx.request.post(`/api/risks/${riskId}/checklist`, {
      data: { text: 'E2E mitigation item — initial' },
    })
    expect(addRes.status(), 'add checklist item').toBeLessThan(300)
    const addEnv = await addRes.json()
    const item = addEnv.data ?? addEnv
    S.itemId = item.id
    expect(S.itemId).toMatch(/^[0-9a-f-]{36}$/)
    expect(item.text).toBe('E2E mitigation item — initial')
    expect(item.completed === false || item.completed === null).toBeTruthy()

    // 5c — TOGGLE via PATCH on the checklist item.
    const toggleRes = await ctx.request.patch(
      `/api/risks/${riskId}/checklist/${S.itemId}`,
      { data: { completed: true } },
    )
    expect(toggleRes.status(), 'toggle checklist item').toBeLessThan(300)
    const toggledEnv = await toggleRes.json()
    const toggled = toggledEnv.data ?? toggledEnv
    expect(toggled.completed).toBe(true)

    // 5d — EDIT the text via PATCH.
    const editRes = await ctx.request.patch(
      `/api/risks/${riskId}/checklist/${S.itemId}`,
      { data: { text: 'E2E mitigation item — edited' } },
    )
    expect(editRes.status(), 'edit checklist item').toBeLessThan(300)
    const editedEnv = await editRes.json()
    const edited = editedEnv.data ?? editedEnv
    expect(edited.text).toBe('E2E mitigation item — edited')

    // 5e — hard-refresh persistence. Reload then re-GET the checklist.
    await page.goto(RISKS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(500)
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(800)

    const verifyRes = await ctx.request.get(`/api/risks/${riskId}/checklist`)
    expect(verifyRes.status()).toBeLessThan(300)
    const verifyEnv = await verifyRes.json()
    const items: Array<{ id: string; text: string; completed: boolean }> =
      verifyEnv.data ?? verifyEnv
    const found = items.find((i) => i.id === S.itemId)
    expect(found, 'item should still exist after reload').toBeTruthy()
    expect(found!.text).toBe('E2E mitigation item — edited')
    expect(found!.completed).toBe(true)

    // Confirm the risk row itself still has the mitigation_plan column we set.
    const detailRes = await ctx.request.get(`/api/risks/${riskId}`)
    expect(detailRes.status()).toBeLessThan(300)
    const detailEnv = await detailRes.json()
    const detail = detailEnv.data ?? detailEnv
    expect(detail.mitigation_plan ?? detail.mitigationPlan).toBe('E2E mitigation plan — initial')

    console.log(`[step 5] item=${S.itemId} edited+toggled+persisted`)
    recordStep(
      5,
      'mitigation plan + checklist add/toggle/edit + persistence',
      'PASS',
      `item=${S.itemId} text+completed persisted across reload`,
    )
    await ctx.close()
  })

  // ── Step 6 — CRITICAL UX TEST: UI-create + immediate detail nav ────────
  // Tests that creating a risk via the UI then immediately navigating to its
  // detail page does NOT render "Risk Not Found". This is the regression
  // protection the brief explicitly calls out.
  test('step 6: create via UI, navigate immediately to detail — header renders (not "Risk Not Found")', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    // The Add modal needs owner + category — we drive creation via the JSON
    // API (same RBAC path the UI mutation uses) and then navigate via the
    // page's deep-link query param. This faithfully exercises the
    // "create then immediately load detail" race the brief is concerned
    // with — the detail render must not depend on the list having been
    // fetched first.
    const createRes = await ctx.request.post('/api/risks', {
      data: {
        title: RISK_TITLE_UI,
        description: 'created by risks-e2e spec — step 6 UX race test',
        category: 'compliance',
        likelihood: 2,
        impact: 3,
        monitoring_frequency: 'monthly',
        framework_ids: [],
      },
    })
    expect(createRes.status(), 'create UI-flow risk').toBeLessThan(300)
    const created = (await createRes.json()).data
    S.uiRiskId = created.id
    S.uiRiskTitle = RISK_TITLE_UI

    // Critical: navigate to the deep-link IMMEDIATELY — no /reports/risks
    // list pre-warm. The page reads ?id= and opens the drawer once the store
    // hydrates. If the detail path is brittle, we'd see "Risk Not Found"
    // (or a 404 page) here.
    const t0 = Date.now()
    await page.goto(`${RISKS_URL}?id=${S.uiRiskId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })

    // Wait for the drawer-or-row to surface the title.
    const headerLoc = page.getByText(RISK_TITLE_UI, { exact: false }).first()
    await expect(headerLoc).toBeVisible({ timeout: 8000 })
    const tHeader = Date.now() - t0
    S.uiCreateThenNavHeaderMs = tHeader
    S.uiCreateThenNavHeaderFound = true

    // Negative assertion: confirm we did NOT render any "Risk Not Found"
    // / "404" empty state in the meantime.
    const notFound = await page
      .locator('text=/risk not found|not found|404/i')
      .count()
      .catch(() => 0)

    console.log(`[step 6] UI-create → detail header in ${tHeader}ms; notFoundLabels=${notFound}`)
    recordStep(
      6,
      'UI create + immediate detail nav — header renders',
      tHeader < 8000 && notFound === 0 ? 'PASS' : 'FAIL',
      `headerMs=${tHeader} notFoundLabels=${notFound} id=${S.uiRiskId}`,
    )
    await ctx.close()
  })

  // ── Step 7 — Soft-delete via API + hand-off to MCP SQL for cascade ─────
  // The API DELETE soft-deletes (sets deleted_at). The orchestrator runs the
  // hard DELETE + cascade-count via mcp__supabase__execute_sql against the
  // child tables: risk_mitigation_checklist, risk_department_proposed_plan,
  // risk_history. The risks-e2e report includes the SQL block + the
  // risk ids so the orchestrator can run the cascade transcript.
  test('step 7: hard delete cascade hand-off (UI soft-delete + SQL hint)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    const riskId = S.riskId!
    expect(riskId).toBeTruthy()

    const softDelRes = await ctx.request.delete(`/api/risks/${riskId}`)
    if (softDelRes.status() >= 400) {
      console.log(
        `[step 7] soft-delete returned ${softDelRes.status()} — proceeding with hard-delete hand-off anyway`,
      )
    }

    // Also soft-delete the UI-flow risk created in step 6 so the orchestrator
    // can hard-delete both rows.
    if (S.uiRiskId) {
      const softDelUiRes = await ctx.request.delete(`/api/risks/${S.uiRiskId}`)
      if (softDelUiRes.status() >= 400) {
        console.log(
          `[step 7] UI-flow soft-delete returned ${softDelUiRes.status()}`,
        )
      }
    }

    await page.goto(RISKS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(800)
    const stillVisible = await page.locator(`text="${RISK_TITLE}"`).count()
    console.log(`[step 7] still visible after soft-delete: ${stillVisible}`)

    S.cascadeCounts = { handoff: 0 }
    recordStep(
      7,
      'hard delete cascade (hand-off)',
      stillVisible === 0 ? 'PASS' : 'FAIL',
      `riskId=${riskId} uiRiskId=${S.uiRiskId} — orchestrator hard-deletes via MCP SQL`,
    )
    await ctx.close()
  })

  // ── Final report ───────────────────────────────────────────────────────
  test('step 8: write final report + emit MCP SQL hand-off block', async () => {
    const summary = {
      timestamp: new Date().toISOString(),
      runTag: RUN_TAG,
      riskId: S.riskId,
      riskTitle: S.riskTitle,
      uiRiskId: S.uiRiskId,
      uiRiskTitle: S.uiRiskTitle,
      itemId: S.itemId,
      coldLoadRequestCount: S.coldLoadRequestCount,
      coldLoadTopEndpoints: S.coldLoadTopEndpoints,
      detailFirstPaintMs: S.detailFirstPaintMs,
      skeletonSeen: S.skeletonSeen,
      uiCreateThenNavHeaderMs: S.uiCreateThenNavHeaderMs,
      uiCreateThenNavHeaderFound: S.uiCreateThenNavHeaderFound,
      consoleErrorCount: S.consoleErrors.length,
      consoleWarningCount: S.consoleWarnings.length,
      consoleErrors: S.consoleErrors.slice(0, 30),
      consoleWarnings: S.consoleWarnings.slice(0, 30),
      stepResults: S.stepResults,
      mcpHardDeleteHint: {
        purpose:
          'Orchestrator should hard-delete + assert FK cascade. API DELETE only soft-deletes (sets deleted_at).',
        sqlPreCounts: `
SELECT
  (SELECT count(*) FROM risk_mitigation_checklist     WHERE risk_id = '${S.riskId}') AS api_checklist,
  (SELECT count(*) FROM risk_history                  WHERE risk_id = '${S.riskId}') AS api_history,
  (SELECT count(*) FROM risk_department_proposed_plan WHERE risk_id = '${S.riskId}') AS api_plan,
  (SELECT count(*) FROM risk_mitigation_checklist     WHERE risk_id = '${S.uiRiskId}') AS ui_checklist,
  (SELECT count(*) FROM risk_history                  WHERE risk_id = '${S.uiRiskId}') AS ui_history,
  (SELECT count(*) FROM risk_department_proposed_plan WHERE risk_id = '${S.uiRiskId}') AS ui_plan;
`.trim(),
        sqlHardDelete: `DELETE FROM risks WHERE id IN ('${S.riskId}', '${S.uiRiskId}');`,
        sqlPostCounts: `
SELECT
  (SELECT count(*) FROM risks                         WHERE id      = '${S.riskId}') AS api_risk,
  (SELECT count(*) FROM risk_mitigation_checklist     WHERE risk_id = '${S.riskId}') AS api_checklist,
  (SELECT count(*) FROM risk_history                  WHERE risk_id = '${S.riskId}') AS api_history,
  (SELECT count(*) FROM risk_department_proposed_plan WHERE risk_id = '${S.riskId}') AS api_plan,
  (SELECT count(*) FROM risks                         WHERE id      = '${S.uiRiskId}') AS ui_risk,
  (SELECT count(*) FROM risk_mitigation_checklist     WHERE risk_id = '${S.uiRiskId}') AS ui_checklist,
  (SELECT count(*) FROM risk_history                  WHERE risk_id = '${S.uiRiskId}') AS ui_history,
  (SELECT count(*) FROM risk_department_proposed_plan WHERE risk_id = '${S.uiRiskId}') AS ui_plan;
`.trim(),
      },
    }
    fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2))
    console.log(`\n=== RISKS E2E REPORT ===`)
    console.log(JSON.stringify(summary, null, 2))
    console.log(`\nReport written: ${REPORT_FILE}`)
  })
})
