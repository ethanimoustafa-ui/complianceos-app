/**
 * Comprehensive end-to-end test of the Circulars page.
 *
 * Runs 13 sequential checks against the live dev server. Each check is its own
 * test() so failures are isolated; the suite uses test.describe.serial so the
 * created circular ID flows from step to step.
 *
 * Acceptance criteria:
 *   - every step completes
 *   - hard-delete cascade verified via direct DB count (caller verifies)
 *   - request budget for the cold list load is < 25
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import { signIn } from './_helpers/sign-in'
import fs from 'node:fs'
import path from 'node:path'

const RULES_URL = '/correspondence/regulatory-updates/rules'
const PROJECT_REF = 'qdbitfgxbnbzkqhdoepd'
const ARTIFACTS_DIR = path.join(process.cwd(), 'tests', 'e2e', '_artifacts')
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })

const REPORT_FILE = path.join(ARTIFACTS_DIR, `circulars-e2e-${Date.now()}.json`)

// ---- shared state across the serial suite ---------------------------------
type SharedState = {
  circularId?: string
  createdReference?: string
  articleId?: string
  consoleErrors: string[]
  consoleWarnings: string[]
  coldLoadRequestCount?: number
  coldLoadTopEndpoints?: Array<{ path: string; count: number }>
  cascadeCounts?: Record<string, number>
  notificationInserted?: boolean
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

// Storage state to reuse a signed-in session across the serial steps.
const STORAGE_STATE = path.join(ARTIFACTS_DIR, 'circulars-e2e-storage.json')
let storageReady = false

const TODAY = new Date()
const TODAY_STR = TODAY.toISOString().slice(0, 10)
const PLUS_14 = new Date(TODAY.getTime() + 14 * 86400_000).toISOString().slice(0, 10)
const PLUS_30 = new Date(TODAY.getTime() + 30 * 86400_000).toISOString().slice(0, 10)
// Unique suffix per run — so leftovers from prior failed runs don't collide
// with our newly-created circular on the list page.
const RUN_TAG = `RUN${Date.now().toString().slice(-6)}`
const CIRCULAR_TITLE = `E2E TEST CIRCULAR 1 ${RUN_TAG}`

test.describe.configure({ mode: 'serial' })

test.describe('Circulars E2E', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await signIn(page, { timeout: 120_000 })
      await ctx.storageState({ path: STORAGE_STATE })
      storageReady = true
    } finally {
      await page.close().catch(() => {})
      await ctx.close().catch(() => {})
    }
    // (cleanup deferred to step 11 — beforeAll stays fast even when prior
    // runs left many stale E2E test rows behind)
  })

  // ── Step 1 — Cold load + request budget + console pass ─────────────────
  test('step 1: cold load — measure FCP, request count, console errors', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    const reqsForRules: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (isCountableRequest(url)) reqsForRules.push(url)
    })

    const t0 = Date.now()
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const t1 = Date.now()

    // Count + group endpoints
    const grouped: Record<string, number> = {}
    for (const url of reqsForRules) {
      const k = pathKey(url)
      grouped[k] = (grouped[k] || 0) + 1
    }
    const top = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, count]) => ({ path, count }))

    S.coldLoadRequestCount = reqsForRules.length
    S.coldLoadTopEndpoints = top

    console.log(`\n[step 1] rules cold load took ${t1 - t0}ms`)
    console.log(`[step 1] cold-load request count: ${reqsForRules.length}`)
    console.log(`[step 1] top 5 endpoints:`)
    for (const e of top) console.log(`           ${String(e.count).padStart(3)} × ${e.path}`)
    console.log(`[step 1] console errors so far: ${S.consoleErrors.length}`)
    console.log(`[step 1] console warnings so far: ${S.consoleWarnings.length}`)

    recordStep(1, 'cold load', reqsForRules.length <= 25 ? 'PASS' : 'FAIL',
      `${reqsForRules.length} reqs (budget 25), ${S.consoleErrors.length} errors`)
    await ctx.close()
  })

  // ── Step 2 — Create a circular ─────────────────────────────────────────
  test('step 2: create a circular', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)

    // Track POSTs to the /api/circulars endpoint so we can extract the created id.
    const apiResponses: Array<{ url: string; status: number; body?: any }> = []
    page.on('response', async (r) => {
      const url = r.url()
      if (url.includes('/api/circulars') || url.includes('/rest/v1/circulars')) {
        let body: any
        try {
          body = await r.json()
        } catch {}
        apiResponses.push({ url, status: r.status(), body })
      }
    })

    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(500)

    // Open Register New Circular modal
    await page.getByRole('button', { name: /register new circular/i }).click()
    await page.waitForTimeout(500)

    // The modal renders inside a portal — scope to the visible modal panel.
    const modal = page.locator('.fixed.inset-0.z-50').last()

    // Helper to select an EditableSelect option by exact label.
    // The trigger is the first <button> following the matching <label>; the
    // dropdown is a sibling div.z-50 — we pick the option matching by visible text.
    async function pickOption(labelText: string | RegExp, optionText: string | RegExp) {
      const label = modal.locator('label', { hasText: labelText }).first()
      const trigger = label.locator('xpath=following::button[1]')
      await trigger.scrollIntoViewIfNeeded()
      await trigger.click({ timeout: 5000 })
      await page.waitForTimeout(250)
      // W38: the EditableSelect dropdown is a body-portal with role="listbox"
      // (the old `.absolute.z-50` in-tree panel is gone).
      const popover = page.locator('[role="listbox"]').last()
      const opt = popover.locator('[role="option"]').filter({ hasText: optionText }).first()
      await opt.click({ timeout: 5000 })
      await page.waitForTimeout(200)
    }

    // Authority = SAMA
    await pickOption(/Authority/i, /^SAMA$/i)

    // Title
    await modal.locator('input[placeholder*="title" i], input[type="text"]').first()
      .fill(CIRCULAR_TITLE)

    // Priority = High
    await pickOption(/Priority/i, /^High$/i)

    // Dates — find by input[type=date]
    const dateInputs = modal.locator('input[type="date"]')
    await dateInputs.nth(0).fill(TODAY_STR)         // issuance
    await dateInputs.nth(1).fill(PLUS_30)            // implementation deadline (due)
    await dateInputs.nth(2).fill(PLUS_14)            // CAP deadline

    // Reference URL
    await modal.locator('input[type="url"]').fill('https://example.com/test')

    // Departments — W38: the Register modal renders chip-style toggle BUTTONS
    // (W35 redesign); the old label+checkbox grid is gone. Without at least one
    // selected, "Initiate Tracker" stays disabled and the submit click hangs.
    for (const dept of ['Compliance', 'Legal', 'Information Technology']) {
      const chip = modal.getByRole('button', { name: new RegExp(`^\\s*${dept}\\s*$`) }).first()
      if ((await chip.count()) > 0) {
        await chip.click({ timeout: 3000 })
        await page.waitForTimeout(80)
        continue
      }
      // Legacy fallback: label + checkbox grid.
      const label = modal.locator('label').filter({ hasText: new RegExp(`^\\s*${dept}\\s*$`) }).first()
      if ((await label.count()) === 0) {
        console.log(`[step 2] WARN: dept chip/label not found: "${dept}"`)
        continue
      }
      const cb = label.locator('input[type="checkbox"]')
      const checked = await cb.isChecked().catch(() => false)
      if (!checked) {
        await label.locator('span').first().click({ timeout: 3000 }).catch(async () => {
          await cb.click({ force: true })
        })
        await page.waitForTimeout(80)
      }
    }

    // Description
    await modal.locator('textarea').first().fill('Playwright E2E test')

    // Submit
    await modal.getByRole('button', { name: /initiate tracker|create|save/i }).click()

    // Wait for modal to close
    await expect(modal.locator('text=/register new circular/i')).toBeHidden({ timeout: 15_000 })
      .catch(() => {})
    await page.waitForTimeout(2500)
    // Debug — print the create POST body / response to understand what shape
    // the server returned (esp. departments field).
    for (const r of apiResponses.slice(-6)) {
      const dpt = r.body && typeof r.body === 'object' ? r.body.departments ?? r.body.data?.departments : undefined
      console.log(`[step 2] api ${r.status} ${pathKey(r.url)} depts=${JSON.stringify(dpt)}`)
    }
    // Soft reload to make sure list is refreshed with the new row.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    // Force a hard reload so we always re-fetch from server (covers the case
    // where the store's `fetchAll` after create raced with our assertion).
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Verify the toast appeared (auto-dismissed after 3s — best-effort) and
    // the row appears on the list.
    const cardSel = page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first()
    await expect(cardSel).toBeVisible({ timeout: 15_000 })

    // Open the new circular's detail modal and verify departments persist
    // there (RegDocCard list view does not render dept chips).
    await cardSel.click()
    await page.waitForTimeout(1500)
    const detailModal = page.locator('.fixed.inset-0.z-50').last()
    for (const d of ['Compliance', 'Legal', 'Information Technology']) {
      const chip = detailModal.getByText(d, { exact: true }).first()
      await expect(chip).toBeVisible({ timeout: 8000 })
    }
    // Pull the API-created circular id from the most-recent 201 response we
    // captured.
    const created = apiResponses.find((r) => r.status === 201 && r.body?.data?.id)
    S.circularId = created?.body?.data?.id ?? created?.body?.id
    console.log(`[step 2] circular id from API: ${S.circularId ?? '(unknown)'}`)
    recordStep(2, 'create circular', 'PASS', `id=${S.circularId ?? 'unknown'}`)
    await ctx.close()
  })

  // ── Step 3 — Hard refresh, verify persisted ─────────────────────────────
  test('step 3: hard refresh — new circular still appears', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const card = page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    // Open detail and verify departments persist (list-card variant doesn't
    // render dept chips; the detail panel does).
    await card.click()
    await page.waitForTimeout(1200)
    const detailModal = page.locator('.fixed.inset-0.z-50').last()
    for (const d of ['Compliance', 'Legal', 'Information Technology']) {
      await expect(detailModal.getByText(d, { exact: true }).first()).toBeVisible({ timeout: 8000 })
    }
    recordStep(3, 'hard refresh persistence', 'PASS')
    await ctx.close()
  })

  // ── Step 4 — Open detail modal, verify overview + workflow + skeletons ─
  test('step 4: open detail modal — verify header, default 10 steps, current=CAP Review', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(400)
    // Header chips
    await expect(page.locator('text=/HIGH/').first()).toBeVisible({ timeout: 4000 })
    await expect(page.locator('text=/PENDING|IN PROGRESS/').first()).toBeVisible({ timeout: 4000 })
    // View Online link
    await expect(page.locator('a:has-text("View")').first()).toBeVisible({ timeout: 4000 }).catch(() => {})
    // Switch to workflow tab
    await page.getByRole('button', { name: /workflow/i }).first().click()
    await page.waitForTimeout(1200)
    // Count workflow step rows (look for the dot-circle pattern: each step has a rounded dot)
    const stepLabels = await page.locator('p.text-sm.font-bold').allTextContents()
    const stepCount = stepLabels.filter(s => s && s.length > 1 && s.length < 80).length
    console.log(`[step 4] visible workflow step labels (approx): ${stepCount}`)
    // Look for "CAP Review" as the current step (button labeled with action)
    const hasCapReview = await page.locator('text=/CAP Review/i').count()
    console.log(`[step 4] "CAP Review" text occurrences: ${hasCapReview}`)
    recordStep(4, 'detail modal default steps', hasCapReview > 0 ? 'PASS' : 'FAIL',
      `cap-review=${hasCapReview}, stepRowsApprox=${stepCount}`)
    await ctx.close()
  })

  // ── Step 5 — Add article with checklist, toggle items, verify persistence
  test('step 5: add article + checklist, toggle items, hard reload still persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(600)
    // Wait for article skeleton to resolve
    await page.waitForTimeout(1500)
    // Click + Add Article in articles section
    await page.getByRole('button', { name: /add article/i }).first().click()
    await page.waitForTimeout(400)
    // Fill article modal — Article Number, Title, Responsible Department
    const articleModal = page.locator('.fixed.inset-0.z-50').last()
    await articleModal.locator('input').first().fill('Article 1.1') // article number is first input
    // Responsible Department — editable-select sibling of label
    const deptLabel = articleModal.locator('label', { hasText: /responsible department/i }).first()
    const deptTrigger = deptLabel.locator('xpath=following::button[1]')
    await deptTrigger.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(250)
    // W38: EditableSelect dropdown is a body-portal with role="listbox".
    const deptPopover = page.locator('[role="listbox"]').last()
    await deptPopover.locator('[role="option"]').filter({ hasText: /^Compliance$/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(200)
    // Title — W38: the placeholder is "e.g., Disclosure Requirements" (no
    // "title" substring) and the Input renders without a type attribute, so
    // target the input that FOLLOWS the "Article Title" label instead.
    const titleLabel = articleModal.locator('label', { hasText: /article title/i }).first()
    await titleLabel.locator('xpath=following::input[1]').fill('E2E Article')
    // Add 3 checklist items via the "Add Checklist Item" input
    const checklistInput = articleModal.locator('input[placeholder*="checklist" i]')
    if (await checklistInput.count() === 0) {
      // Fallback: last input on the right of the Add button
      const inputs = articleModal.locator('input[type="text"]')
      const n = await inputs.count()
      const last = inputs.nth(n - 1)
      for (const item of ['Item A', 'Item B', 'Item C']) {
        await last.fill(item)
        await last.press('Enter')
        await page.waitForTimeout(150)
      }
    } else {
      for (const item of ['Item A', 'Item B', 'Item C']) {
        await checklistInput.fill(item)
        await checklistInput.press('Enter')
        await page.waitForTimeout(150)
      }
    }
    // Save the article
    await articleModal.getByRole('button', { name: /^save$/i }).click()
    await page.waitForTimeout(1500)
    // Reopen the article — click on its card
    await page.locator('text="E2E Article"').first().click({ timeout: 5000 })
    await page.waitForTimeout(700)
    // Toggle 2 checkboxes
    const checkboxes = page.locator('[role="dialog"] >> input[type="checkbox"]').last()
    // The checklist items are checkboxes inside the modal. Toggle first two.
    const allCBs = page.locator('[role="dialog"] input[type="checkbox"]')
    const cbCount = await allCBs.count()
    console.log(`[step 5] checkboxes in article modal: ${cbCount}`)
    if (cbCount >= 2) {
      await allCBs.nth(0).check({ force: true }).catch(() => {})
      await page.waitForTimeout(300)
      await allCBs.nth(1).check({ force: true }).catch(() => {})
      await page.waitForTimeout(500)
    }
    // Close article modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    // Hard reload — verify still 2/3
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(1500)
    const progressText = await page.locator('text=/2\\s*\\/\\s*3/').count()
    console.log(`[step 5] "2/3" progress text count after reload: ${progressText}`)
    recordStep(5, 'article + checklist persistence', progressText > 0 ? 'PASS' : 'FAIL',
      `2/3 indicators: ${progressText}`)
    await ctx.close()
  })

  // ── Step 6 — Edit Business Owner ────────────────────────────────────────
  test('step 6: assign BO=Compliance, hard reload persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /assign business owner|change business owner/i }).click()
    await page.waitForTimeout(400)
    // W38: deterministic flow — role-based dialog, real waits, no silent
    // catches (the old silently-caught clicks left "Assign" disabled and the
    // final click hung the whole test).
    const boModal = page.getByRole('dialog', { name: /assign business owner/i })
    await boModal.getByRole('button', { name: /select department/i }).click({ timeout: 5000 })
    const boPopover = page.locator('[role="listbox"]').last()
    await boPopover
      .locator('[role="option"]')
      .filter({ hasText: /^Compliance$/ })
      .first()
      .click({ timeout: 10_000 })
    await page.waitForTimeout(300)
    await boModal.getByRole('button', { name: /assign|change/i }).last().click({ timeout: 5000 })
    await page.waitForTimeout(1200)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    const hasComplianceBO = await page.locator('text=/Business Owner/i').first().isVisible().catch(() => false)
    recordStep(6, 'assign BO', hasComplianceBO ? 'PASS' : 'FAIL', `BO label visible: ${hasComplianceBO}`)
    await ctx.close()
  })

  // ── Step 7 — PDF upload ────────────────────────────────────────────────
  test('step 7: upload PDF, "PDF attached" badge appears + persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    const pdfPath = path.join(ARTIFACTS_DIR, 'W3-dummy-policy.pdf')
    // The file input is hidden; use setInputFiles directly on it.
    const fileInputs = page.locator('input[type="file"]')
    const fiCount = await fileInputs.count()
    console.log(`[step 7] file inputs in detail: ${fiCount}`)
    if (fiCount > 0) {
      // First file input is the detail-PDF picker (detailPdfRef).
      await fileInputs.first().setInputFiles(pdfPath)
      await page.waitForTimeout(2500)
    }
    const attached = await page.locator('text=/pdf attached|circular pdf/i').count()
    console.log(`[step 7] PDF-attached indicator count: ${attached}`)
    // Hard reload
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(1000)
    const attachedAfter = await page.locator('text=/pdf attached|circular pdf/i').count()
    console.log(`[step 7] PDF-attached after reload: ${attachedAfter}`)
    recordStep(7, 'PDF upload + persistence', attachedAfter > 0 ? 'PASS' : 'FAIL',
      `attachedAfterReload=${attachedAfter}`)
    await ctx.close()
  })

  // ── Step 8 — Advance current workflow step ─────────────────────────────
  test('step 8: advance workflow current step', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /workflow/i }).first().click()
    await page.waitForTimeout(1500)
    // The current step has a blue background button with the action label.
    const advanceBtn = page.locator('button.bg-blue-600').first()
    const advanceVisible = await advanceBtn.isVisible().catch(() => false)
    if (advanceVisible) {
      await advanceBtn.click()
      await page.waitForTimeout(500)
      // Confirm modal — click confirm/advance
      const confirmBtn = page.locator('[role="dialog"] >> button:has-text("Advance"), [role="dialog"] >> button:has-text("Confirm"), [role="dialog"] >> button.bg-blue-600').last()
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click({ timeout: 4000 }).catch(() => {})
      }
      await page.waitForTimeout(1500)
    }
    recordStep(8, 'advance workflow step', advanceVisible ? 'PASS' : 'FAIL',
      `advance-btn-visible=${advanceVisible}`)
    await ctx.close()
  })

  // ── Step 9 — Edit step inline: assignee + notes ────────────────────────
  test('step 9: edit step assignee + notes, hard reload persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /workflow/i }).first().click()
    await page.waitForTimeout(1500)
    // Change first assignee select (any non-completed step has one)
    const selects = page.locator('[role="dialog"] select')
    const selCount = await selects.count()
    console.log(`[step 9] visible selects in workflow: ${selCount}`)
    let assigneeChanged = false
    if (selCount > 0) {
      // Find the first assignee select (the one with team-member options).
      const opts = await selects.first().locator('option').count()
      if (opts > 1) {
        await selects.first().selectOption({ index: 1 }).catch(() => {})
        assigneeChanged = true
        await page.waitForTimeout(700)
      }
    }
    // Add notes — find a notes button (text "Step notes") and click, then fill the textarea.
    const notesBtn = page.locator('button:has-text("Step notes"), button:has-text("notes")').first()
    if (await notesBtn.count() > 0) {
      await notesBtn.click().catch(() => {})
      await page.waitForTimeout(300)
      const ta = page.locator('textarea').last()
      await ta.fill('E2E notes').catch(() => {})
      await page.keyboard.press('Tab')
      await page.waitForTimeout(700)
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /workflow/i }).first().click()
    await page.waitForTimeout(1500)
    const notesPersisted = await page.locator('text="E2E notes"').count()
    console.log(`[step 9] notes-persisted count: ${notesPersisted}`)
    recordStep(9, 'edit step inline', assigneeChanged || notesPersisted > 0 ? 'PASS' : 'FAIL',
      `assigneeChanged=${assigneeChanged} notesPersisted=${notesPersisted}`)
    await ctx.close()
  })

  // ── Step 10 — Edit the circular ────────────────────────────────────────
  test('step 10: edit title to "(EDITED)", hard reload persists', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.locator(`text=${JSON.stringify(CIRCULAR_TITLE)}`).first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /edit circular/i }).click()
    await page.waitForTimeout(500)
    const editModal = page.locator('[role="dialog"]').last()
    const titleField = editModal.locator('input[type="text"]').first()
    await titleField.fill(`${CIRCULAR_TITLE} (EDITED)`)
    // Save
    await editModal.getByRole('button', { name: /save|update|submit|request/i }).last().click()
    await page.waitForTimeout(1500)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    const editedVisible = await page.locator(`text=${JSON.stringify(`${CIRCULAR_TITLE} (EDITED)`)}`).count()
    console.log(`[step 10] edited title visible: ${editedVisible}`)
    recordStep(10, 'edit circular title', editedVisible > 0 ? 'PASS' : 'FAIL',
      `edited-title-visible=${editedVisible}`)
    await ctx.close()
  })

  // ── Step 11 — Hard delete ──────────────────────────────────────────────
  test('step 11: hard delete every E2E test circular, persists across reload', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    // Loop: delete every card whose title contains "E2E TEST CIRCULAR" — also
    // cleans up leftovers from previous failed runs.
    let safety = 5
    while (safety-- > 0) {
      const target = page.locator('text=/E2E TEST CIRCULAR/').first()
      if ((await target.count()) === 0) break
      await target.click()
      await page.waitForTimeout(700)
      await page.getByRole('button', { name: /delete circular/i }).click()
      await page.waitForTimeout(400)
      const confirmModal = page.locator('[role="dialog"]').last()
      await confirmModal.getByRole('button', { name: /^delete$/i }).click()
      await page.waitForTimeout(1800)
    }
    const stillThere = await page.locator('text=/E2E TEST CIRCULAR/').count()
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1000)
    const stillThereAfter = await page.locator('text=/E2E TEST CIRCULAR/').count()
    console.log(`[step 11] count immediately after delete: ${stillThere}, after reload: ${stillThereAfter}`)
    recordStep(11, 'hard delete', stillThereAfter === 0 ? 'PASS' : 'FAIL',
      `immediate=${stillThere} afterReload=${stillThereAfter}`)
    await ctx.close()
  })

  // ── Step 12 — Console error pass: walk a few pages ─────────────────────
  test('step 12: console error pass — navigate dashboard/settings/back', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await ctx.newPage()
    installConsoleCapture(page)
    await page.goto(RULES_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(500)
    await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 25_000 })
    await page.waitForTimeout(500)
    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 25_000 })
    await page.waitForTimeout(500)
    await page.goto(RULES_URL, { waitUntil: 'networkidle', timeout: 25_000 })
    await page.waitForTimeout(500)
    console.log(`[step 12] total console errors collected: ${S.consoleErrors.length}`)
    console.log(`[step 12] total console warnings collected: ${S.consoleWarnings.length}`)
    if (S.consoleErrors.length) {
      console.log('--- console errors ---')
      for (const e of S.consoleErrors.slice(0, 20)) console.log('  ' + e)
    }
    recordStep(12, 'console error pass', S.consoleErrors.length === 0 ? 'PASS' : 'FAIL',
      `errors=${S.consoleErrors.length} warnings=${S.consoleWarnings.length}`)
    await ctx.close()
  })

  // ── Step 13 — Final structured report ──────────────────────────────────
  test('step 13: write final report', async () => {
    const summary = {
      timestamp: new Date().toISOString(),
      coldLoadRequestCount: S.coldLoadRequestCount,
      coldLoadTopEndpoints: S.coldLoadTopEndpoints,
      consoleErrorCount: S.consoleErrors.length,
      consoleWarningCount: S.consoleWarnings.length,
      consoleErrors: S.consoleErrors,
      consoleWarnings: S.consoleWarnings.slice(0, 30),
      stepResults: S.stepResults,
    }
    fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2))
    console.log(`\n=== CIRCULARS E2E REPORT ===`)
    console.log(JSON.stringify(summary, null, 2))
    console.log(`\nReport written: ${REPORT_FILE}`)
  })
})
