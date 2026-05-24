// Wave-19.6/19.7 finalization — live verification of the workflow undo route
// against circular `7f80986b-c6ae-4484-8968-24603cacd6e0` and EN/AR UI proof.
//
// Flow:
//   1. Sign in (admin@complianceos.local).
//   2. Use /workflow/advance to materialize at least one completed step so
//      undo has something to walk back over (HTTP, not direct DB write).
//   3. Snapshot pre-state via the same GET the UI uses.
//   4. Item 1 — fire POST /workflow/undo with stale + fresh If-Match,
//      capture full request + response, assert dual-flip on the DB.
//   5. Item 2 — workflow tab screenshot pairs in EN + AR.
//   6. Conditional /workflow/reset if the workflow is fully completed.

import { test, expect, type APIResponse, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ADMIN = {
  email: 'admin@complianceos.local',
  password: 'ComplianceOS!2026',
}

async function signIn(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('input[type="email"]').fill(ADMIN.email)
      await page.locator('input[type="password"]').fill(ADMIN.password)
      await page.waitForTimeout(500)
      await page.locator('input[type="password"]').press('Enter')
      await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30_000 })
      return
    } catch (e) {
      if (attempt === 3) throw e
      await page.waitForTimeout(1500)
    }
  }
}

const CIRCULAR_ID = '7f80986b-c6ae-4484-8968-24603cacd6e0'
const ARTIFACTS = join(process.cwd(), 'tests', 'e2e', '_artifacts', 'wave-19-6-cursor')
const STALE = 'W/"2020-01-01T00:00:00Z"'

mkdirSync(ARTIFACTS, { recursive: true })

interface StepSnapshot { id: string; label: string; status: string; sortOrder: number }

async function readWorkflow(page: Page): Promise<{ updatedAt: string; steps: StepSnapshot[] }> {
  const res = await page.request.get(`/api/circulars/${CIRCULAR_ID}`, {
    headers: { 'cache-control': 'no-store' },
  })
  expect(res.status(), 'GET circular detail').toBe(200)
  const body = (await res.json()) as {
    data?: {
      updated_at: string
      workflow_steps?: Array<{ id: string; label: string; status: string; sort_order: number }>
    }
  }
  const steps = (body.data?.workflow_steps ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    sortOrder: s.sort_order,
  }))
  steps.sort((a, b) => a.sortOrder - b.sortOrder)
  return { updatedAt: body.data?.updated_at ?? '', steps }
}

async function decodeBody(res: APIResponse): Promise<unknown> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

async function ensureAtLeastOneCompleted(page: Page): Promise<{
  updatedAt: string
  steps: StepSnapshot[]
}> {
  let snap = await readWorkflow(page)
  if (snap.steps.some((s) => s.status === 'completed')) return snap
  const current = snap.steps.find((s) => s.status === 'current')
  if (!current) throw new Error('No current step to advance')
  const advRes = await page.request.post(`/api/circulars/${CIRCULAR_ID}/workflow/advance`, {
    headers: { 'If-Match': `W/"${snap.updatedAt}"`, 'content-type': 'application/json' },
    data: { step_id: current.id, notes: 'wave-19.6 verification — advance to seed undo proof' },
  })
  expect(advRes.status(), 'advance must 200').toBe(200)
  snap = await readWorkflow(page)
  return snap
}

test.describe('Wave-19.6 cursor — live undo proof + EN/AR UI screenshots', () => {
  test.setTimeout(600_000)

  test('full verification', async ({ page }, testInfo) => {
    const trace: Record<string, unknown> = {}
    page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text().slice(0, 200)))
    page.on('pageerror', (err) => console.log('[pageerror]', err.message.slice(0, 300)))
    console.log('[step] signIn start')
    await signIn(page)
    console.log('[step] signIn done')

    // Seed at least one completed step so undo can fire.
    console.log('[step] ensureAtLeastOneCompleted')
    const seeded = await ensureAtLeastOneCompleted(page)
    trace.preState = seeded
    console.log('PRE-STATE:', JSON.stringify(seeded, null, 2))
    const preCurrent = seeded.steps.find((s) => s.status === 'current')
    const preCompletedDesc = [...seeded.steps]
      .filter((s) => s.status === 'completed')
      .sort((a, b) => b.sortOrder - a.sortOrder)
    // The route uses ORDER BY completed_at DESC LIMIT 1 — we approximate that
    // here by picking the highest-sort-order completed step IF only one
    // exists; otherwise we just assert dual-flip on whichever step the route
    // chose (it'll be reflected in the returned `promoted` body).
    expect(preCompletedDesc.length, 'at least one completed step pre').toBeGreaterThan(0)

    // ── Item 1.6 stale If-Match → 412 ───────────────────────────────────────
    const stale = await page.request.post(`/api/circulars/${CIRCULAR_ID}/workflow/undo`, {
      headers: { 'If-Match': STALE, 'content-type': 'application/json' },
      data: {},
    })
    const staleBody = await decodeBody(stale)
    trace.staleIfMatch = {
      request: {
        method: 'POST',
        url: `/api/circulars/${CIRCULAR_ID}/workflow/undo`,
        headers: { 'If-Match': STALE, 'content-type': 'application/json' },
        body: {},
      },
      response: { status: stale.status(), headers: stale.headers(), body: staleBody },
    }
    expect(stale.status(), 'stale If-Match must 412').toBe(412)

    // ── Item 2 EN BEFORE screenshot ────────────────────────────────────────
    console.log('[step] navigate to rules page (EN before)')
    await page.goto(`/correspondence/regulatory-updates/rules?id=${CIRCULAR_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    await page.waitForTimeout(2000)
    console.log('[step] rules page loaded (EN)')
    // The workflow tab is rendered as a button. Click it (best effort).
    const workflowTab = page.getByRole('button', { name: /workflow/i }).first()
    await workflowTab.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(ARTIFACTS, 'EN-before.png'), fullPage: true })
    const enBeforeDots = await page.locator('div.bg-blue-100.border-blue-500').count()
    trace.enBefore = { currentStepDotCount: enBeforeDots, preCurrent }

    // ── Item 1 fresh If-Match → 200 + dual-flip ─────────────────────────────
    const pre = await readWorkflow(page)
    const ifMatch = `W/"${pre.updatedAt}"`
    const undoRes = await page.request.post(`/api/circulars/${CIRCULAR_ID}/workflow/undo`, {
      headers: { 'If-Match': ifMatch, 'content-type': 'application/json' },
      data: {},
    })
    const undoBody = (await decodeBody(undoRes)) as {
      data?: {
        items: Array<{ id: string; status: string }>
        promoted: { id: string; status: string; label: string }
        demoted_id: string | null
      }
    }
    trace.freshUndo = {
      request: {
        method: 'POST',
        url: `/api/circulars/${CIRCULAR_ID}/workflow/undo`,
        headers: { 'If-Match': ifMatch, 'content-type': 'application/json' },
        body: {},
        curlEquivalent: [
          `curl -X POST http://localhost:3000/api/circulars/${CIRCULAR_ID}/workflow/undo \\`,
          `  -H "If-Match: ${ifMatch}" \\`,
          `  -H "content-type: application/json" \\`,
          `  --cookie "<sb-...-auth-token>" \\`,
          `  -d '{}'`,
        ].join('\n'),
      },
      response: { status: undoRes.status(), headers: undoRes.headers(), body: undoBody },
    }
    console.log('UNDO RESPONSE:', undoRes.status(), JSON.stringify(undoBody).slice(0, 800))
    expect(undoRes.status(), 'fresh If-Match must 200').toBe(200)

    // Reload UI for EN-after screenshot.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: /workflow/i }).first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(ARTIFACTS, 'EN-after.png'), fullPage: true })
    trace.enAfter = {
      currentStepDotCount: await page.locator('div.bg-blue-100.border-blue-500').count(),
    }

    // ── Dual-flip acceptance on the live DB-backed state ───────────────────
    const post = await readWorkflow(page)
    trace.postState = post
    const promotedId = undoBody.data!.promoted.id
    const demotedId = undoBody.data!.demoted_id

    const promotedAfter = post.steps.find((s) => s.id === promotedId)
    expect(promotedAfter, 'promoted row exists post').toBeTruthy()
    expect(promotedAfter!.status, 'promoted step is now current').toBe('current')

    if (demotedId) {
      const demotedAfter = post.steps.find((s) => s.id === demotedId)
      expect(demotedAfter, 'demoted row exists post').toBeTruthy()
      expect(demotedAfter!.status, 'demoted step is now pending').toBe('pending')
    }
    // Exactly one current row across the whole circular.
    expect(post.steps.filter((s) => s.status === 'current').length, 'exactly one current after').toBe(1)
    // Every other row unchanged from pre.
    for (const before of pre.steps) {
      if (before.id === promotedId || before.id === demotedId) continue
      const after = post.steps.find((s) => s.id === before.id)
      expect(after?.status, `row unchanged: ${before.label}`).toBe(before.status)
    }

    // ── Item 1.7 conditional reset path ────────────────────────────────────
    const allDone = post.steps.length > 0 && post.steps.every((s) => s.status === 'completed')
    if (allDone) {
      const resetRes = await page.request.post(
        `/api/circulars/${CIRCULAR_ID}/workflow/reset`,
        {
          headers: { 'If-Match': `W/"${post.updatedAt}"`, 'content-type': 'application/json' },
          data: {},
        },
      )
      trace.reset = { status: resetRes.status(), body: await decodeBody(resetRes) }
      expect(resetRes.status()).toBe(200)
    } else {
      trace.reset = {
        skipped: true,
        reason: 'workflow not 100% complete — reset path not exercised (noted in report)',
      }
    }

    // ── Item 2 AR BEFORE screenshot ────────────────────────────────────────
    await page.evaluate(() => {
      localStorage.setItem(
        'language-storage',
        JSON.stringify({ state: { language: 'ar', direction: 'rtl' }, version: 0 }),
      )
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: /workflow|سير العمل/i }).first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(ARTIFACTS, 'AR-before.png'), fullPage: true })
    trace.arBefore = {
      currentStepDotCount: await page.locator('div.bg-blue-100.border-blue-500').count(),
    }

    // Seed another completed step (the previous post may already have one
    // since dual-flip leaves N-1 completed; but be defensive).
    const arSeeded = await ensureAtLeastOneCompleted(page)
    const arPreCurrent = arSeeded.steps.find((s) => s.status === 'current')
    const arPreCompleted = arSeeded.steps.find((s) => s.status === 'completed')
    if (arPreCurrent && arPreCompleted) {
      const arUndoRes = await page.request.post(
        `/api/circulars/${CIRCULAR_ID}/workflow/undo`,
        {
          headers: {
            'If-Match': `W/"${arSeeded.updatedAt}"`,
            'content-type': 'application/json',
          },
          data: {},
        },
      )
      trace.arUndo = { status: arUndoRes.status(), body: await decodeBody(arUndoRes) }
      expect(arUndoRes.status()).toBe(200)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
    } else {
      trace.arUndo = { skipped: true, reason: 'no completed/current pair' }
    }
    await page.getByRole('button', { name: /workflow|سير العمل/i }).first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(ARTIFACTS, 'AR-after.png'), fullPage: true })
    trace.arAfter = {
      currentStepDotCount: await page.locator('div.bg-blue-100.border-blue-500').count(),
    }

    // Restore EN.
    await page.evaluate(() => {
      localStorage.setItem(
        'language-storage',
        JSON.stringify({ state: { language: 'en', direction: 'ltr' }, version: 0 }),
      )
    })

    writeFileSync(join(ARTIFACTS, 'curl-trace.json'), JSON.stringify(trace, null, 2))
    testInfo.attach('curl-trace', { path: join(ARTIFACTS, 'curl-trace.json') })
  })
})
