/**
 * Walker W4 — Reports, Team, Settings, Dashboard parallel sweep.
 *
 * Charter: walk + report. No bug fixes.
 *
 * Each `test()` signs in fresh, navigates to a route, captures:
 *   - console errors
 *   - non-2xx responses (URL, status, 300-char body)
 *   - visible error text
 * Then exercises the page's primary user story. Screenshots on error and continues.
 */

import { test, expect, type Page, type Response } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { signIn } from './_helpers/sign-in'

type HttpError = { status: number; url: string; method: string; body?: string; ts: number }
type Capture = {
  consoleErrors: string[]
  httpErrors: HttpError[]
  responses: { url: string; status: number; method: string }[]
}

const ARTIFACT_DIR = path.resolve(__dirname, '_artifacts')
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

function slugify(s: string): string {
  return s.replace(/^\/+|\/+$/g, '').replace(/\W+/g, '-') || 'root'
}

function attachCapture(page: Page): Capture {
  const cap: Capture = { consoleErrors: [], httpErrors: [], responses: [] }
  page.on('console', (m) => {
    if (m.type() === 'error') cap.consoleErrors.push(m.text())
  })
  page.on('response', async (r: Response) => {
    const status = r.status()
    const url = r.url()
    const method = r.request().method()
    cap.responses.push({ url, status, method })
    if (status >= 400) {
      let body: string | undefined
      try {
        const txt = await r.text()
        body = txt.slice(0, 300)
      } catch {
        body = undefined
      }
      cap.httpErrors.push({ status, url, method, body, ts: Date.now() })
    }
  })
  return cap
}

async function snapshotOnError(page: Page, route: string, cap: Capture) {
  if (cap.httpErrors.length === 0 && cap.consoleErrors.length === 0) return
  const ts = Date.now()
  const file = path.join(ARTIFACT_DIR, `W4-${slugify(route)}-${ts}.png`)
  try {
    await page.screenshot({ path: file, fullPage: true, timeout: 5000 })
    console.log(`[W4][shot] ${file}`)
  } catch (e) {
    console.log(`[W4][shot-fail] ${(e as Error).message}`)
  }
}

function dumpFindings(route: string, cap: Capture) {
  console.log(`\n========== W4 :: ${route} ==========`)
  if (cap.consoleErrors.length) {
    console.log(`CONSOLE_ERRORS (${cap.consoleErrors.length}):`)
    for (const e of cap.consoleErrors) console.log(`  - ${e}`)
  }
  if (cap.httpErrors.length) {
    console.log(`HTTP_ERRORS (${cap.httpErrors.length}):`)
    for (const e of cap.httpErrors) {
      console.log(`  ${e.status} ${e.method} ${e.url}`)
      if (e.body) console.log(`    body: ${e.body.replace(/\n/g, ' ')}`)
    }
  }
  if (!cap.consoleErrors.length && !cap.httpErrors.length) {
    console.log('  (clean)')
  }
  console.log(`========================================\n`)
}

async function safeNavigate(page: Page, url: string, route: string, cap: Capture) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 12_000 })
  } catch (e) {
    console.log(`[W4][nav-warn] ${route} :: ${(e as Error).message}`)
  }
  // a small settle so late-fire requests are captured
  await page.waitForTimeout(800)
}

// ============================================================================
// DASHBOARD
// ============================================================================
test('W4 /dashboard', async ({ page }) => {
  test.setTimeout(90_000)
  const route = '/dashboard'
  const cap = attachCapture(page)
  await signIn(page)
  await safeNavigate(page, route, route, cap)

  // Try to scroll
  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)
    await page.evaluate(() => window.scrollTo(0, 0))
  } catch {}

  // Try to find a period dropdown / framework filter — best-effort
  try {
    const periodSelectors = [
      'select[name*="period" i]',
      'button:has-text("3 months")',
      'button:has-text("12 months")',
      'button:has-text("6 months")',
      '[data-testid*="period"]',
    ]
    for (const sel of periodSelectors) {
      const el = page.locator(sel).first()
      if ((await el.count()) > 0) {
        try {
          await el.click({ timeout: 1500 })
          await page.waitForTimeout(400)
        } catch {}
        break
      }
    }
  } catch {}

  // Try to click any view-switcher buttons
  try {
    for (const label of ['Executive', 'Managerial', 'Officer']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
      if ((await btn.count()) > 0) {
        try {
          await btn.click({ timeout: 1000 })
          await page.waitForTimeout(300)
        } catch {}
      }
    }
  } catch {}

  await snapshotOnError(page, route, cap)
  dumpFindings(route, cap)
})

// ============================================================================
// REPORTS — one test per tab
// ============================================================================
const REPORT_TABS = [
  '/reports/executive',
  '/reports/risks',
  '/reports/audits',
  '/reports/compliance-review',
  '/reports/detailed',
]

for (const route of REPORT_TABS) {
  test(`W4 ${route}`, async ({ page }) => {
    test.setTimeout(90_000)
    const cap = attachCapture(page)
    await signIn(page)
    await safeNavigate(page, route, route, cap)

    // Try clicking a Generate PDF / Download / Export button — best-effort, do NOT wait.
    try {
      const pdfSelectors = [
        'button:has-text("Generate PDF")',
        'button:has-text("Export PDF")',
        'button:has-text("Export")',
        'button:has-text("Download")',
        '[data-testid*="pdf"]',
        '[data-testid*="export"]',
      ]
      for (const sel of pdfSelectors) {
        const el = page.locator(sel).first()
        if ((await el.count()) > 0) {
          // Don't wait for navigation; downloads can hang
          try {
            await el.click({ timeout: 1500, noWaitAfter: true })
            console.log(`[W4][pdf] clicked ${sel} on ${route}`)
            await page.waitForTimeout(500)
          } catch (e) {
            console.log(`[W4][pdf-click-fail] ${sel} on ${route} :: ${(e as Error).message}`)
          }
          break
        }
      }
    } catch {}

    await snapshotOnError(page, route, cap)
    dumpFindings(route, cap)
  })
}

// ============================================================================
// TEAM
// ============================================================================
test('W4 /team/directory + invite flow', async ({ page }) => {
  test.setTimeout(90_000)
  const route = '/team/directory'
  const cap = attachCapture(page)
  await signIn(page)
  await safeNavigate(page, route, route, cap)

  // Try the invite flow.
  const inviteEmail = `walker-w4-${Date.now()}@example.local`
  let inviteAttempted = false
  let inviteResponseStatus: number | null = null
  let inviteResponseBody: string | null = null

  // Listen for the invite POST specifically
  const invitePromise = page
    .waitForResponse(
      (r) => r.url().includes('/api/team/members/invite') && r.request().method() === 'POST',
      { timeout: 8_000 },
    )
    .catch(() => null)

  try {
    // Open the invite modal
    const inviteBtn = page.getByRole('button', { name: /invite/i }).first()
    if ((await inviteBtn.count()) > 0) {
      await inviteBtn.click({ timeout: 3000 })
      await page.waitForTimeout(500)

      // Fill email
      const emailInput = page.locator('input[type="email"]').last()
      if ((await emailInput.count()) > 0) {
        await emailInput.fill(inviteEmail)
        await page.waitForTimeout(200)
      }

      // Fill name (first text input in modal)
      const nameInput = page.locator('input[type="text"]').last()
      if ((await nameInput.count()) > 0) {
        await nameInput.fill('Walker W4 Probe')
      }

      // Click "Send Invitations"
      const sendBtn = page.getByRole('button', { name: /send invitation/i }).first()
      if ((await sendBtn.count()) > 0) {
        inviteAttempted = true
        await sendBtn.click({ timeout: 3000 })
      }
    }
  } catch (e) {
    console.log(`[W4][invite-flow-error] ${(e as Error).message}`)
  }

  const inviteResp = await invitePromise
  if (inviteResp) {
    inviteResponseStatus = inviteResp.status()
    try {
      inviteResponseBody = (await inviteResp.text()).slice(0, 500)
    } catch {
      inviteResponseBody = '<unreadable>'
    }
    console.log(`[W4][invite] status=${inviteResponseStatus} email=${inviteEmail}`)
    console.log(`[W4][invite] body=${inviteResponseBody}`)
  } else if (inviteAttempted) {
    console.log(`[W4][invite] NO RESPONSE captured for email=${inviteEmail} — check if endpoint was called`)
  } else {
    console.log(`[W4][invite] could not exercise invite flow — UI selector mismatch`)
  }

  await page.waitForTimeout(600)
  await snapshotOnError(page, route, cap)
  dumpFindings(route, cap)
})

test('W4 /team/logs', async ({ page }) => {
  test.setTimeout(90_000)
  const route = '/team/logs'
  const cap = attachCapture(page)
  await signIn(page)
  await safeNavigate(page, route, route, cap)

  // Count rows
  try {
    const rowCount = await page.locator('table tbody tr, [role="row"]').count()
    console.log(`[W4][team-logs] visible row count = ${rowCount}`)
  } catch (e) {
    console.log(`[W4][team-logs-count-fail] ${(e as Error).message}`)
  }

  await snapshotOnError(page, route, cap)
  dumpFindings(route, cap)
})

test('W4 /team/training', async ({ page }) => {
  test.setTimeout(90_000)
  const route = '/team/training'
  const cap = attachCapture(page)
  await signIn(page)
  await safeNavigate(page, route, route, cap)
  await snapshotOnError(page, route, cap)
  dumpFindings(route, cap)
})

// ============================================================================
// SETTINGS — single page, multiple sections.
// We attempt to flip + revert checkboxes/toggles. Each flip captures the network
// trail. Settings is /settings (no sub-routes per FS).
// ============================================================================
test('W4 /settings flip + revert', async ({ page }) => {
  test.setTimeout(90_000)
  const route = '/settings'
  const cap = attachCapture(page)
  await signIn(page)
  await safeNavigate(page, route, route, cap)

  const flippedKeys: string[] = []

  // Find the first ~3 unchecked checkboxes in the settings sections, flip then
  // immediately revert. This minimizes the chance of leaving the org in a weird
  // state but still exercises every write path.
  try {
    const checkboxes = page.locator('input[type="checkbox"]')
    const total = Math.min(await checkboxes.count(), 3)
    for (let i = 0; i < total; i++) {
      const cb = checkboxes.nth(i)
      try {
        const before = await cb.isChecked()
        const id = (await cb.getAttribute('name')) || (await cb.getAttribute('id')) || `idx-${i}`
        await cb.click({ timeout: 1500 })
        await page.waitForTimeout(400)
        // Revert
        await cb.click({ timeout: 1500 })
        await page.waitForTimeout(400)
        const after = await cb.isChecked()
        if (after === before) {
          flippedKeys.push(`${id} (reverted ok)`)
        } else {
          flippedKeys.push(`${id} (DID NOT REVERT before=${before} after=${after})`)
        }
      } catch (e) {
        console.log(`[W4][settings-flip-fail] cb#${i} :: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    console.log(`[W4][settings-cb-scan-fail] ${(e as Error).message}`)
  }

  // Also try clicking the "Save Changes" header button to surface any save endpoint
  try {
    const save = page.getByRole('button', { name: /save changes/i }).first()
    if ((await save.count()) > 0) {
      await save.click({ timeout: 1500, noWaitAfter: true })
      await page.waitForTimeout(600)
      console.log(`[W4][settings] clicked Save Changes`)
    }
  } catch {}

  console.log(`[W4][settings] flipped keys: ${JSON.stringify(flippedKeys)}`)

  await snapshotOnError(page, route, cap)
  dumpFindings(route, cap)
})
