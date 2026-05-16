import { test, expect, type Page, type Request } from '@playwright/test'

/**
 * Fix-D verification — confirms that user-created calendar events round-trip
 * through `/api/calendar/events` and survive a page reload.
 *
 * Bug B2 (from W3 walker): create-event modal closes cleanly with zero traffic
 * to `/api/calendar/events`, event missing after reload. Fix-D wires the
 * Zustand store to the existing Route Handlers and hydrates the store on mount.
 */

const ADMIN = { email: 'admin@complianceos.local', password: 'ComplianceOS!2026' }
const EVENT_TITLE = `FixD_Event_${Date.now()}`

/** Dev-cold sign-in: retry up to 3 times. The dev server can stall compiling /sign-in. */
async function robustSignIn(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.locator('input[type="email"]').fill(ADMIN.email)
      await page.locator('input[type="password"]').fill(ADMIN.password)
      await page.waitForTimeout(500)
      await page.getByRole('button', { name: /sign in|log in/i }).click({ timeout: 5_000 })
      await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30_000 })
      return
    } catch (e) {
      if (attempt === 3) throw e
      await page.waitForTimeout(1500)
    }
  }
}

test('fix-d: calendar event survives reload', async ({ page }) => {
  test.setTimeout(120_000)

  // Track POST/GET to /api/calendar/events so we can assert traffic.
  const calendarRequests: { method: string; url: string }[] = []
  page.on('request', (req: Request) => {
    const url = req.url()
    if (url.includes('/api/calendar/events') || url.includes('/api/calendar/event-types')) {
      calendarRequests.push({ method: req.method(), url })
    }
  })

  await robustSignIn(page)

  // Calendar route confirmed via `Glob` → src/app/(dashboard)/calendar/page.tsx.
  await page.goto('/calendar', { waitUntil: 'domcontentloaded' })

  // Wait for initial hydration GETs to fire.
  await page.waitForResponse(
    (r) => r.url().includes('/api/calendar/events') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 15_000 },
  )

  // Open the "Create Event" modal. Try a few selectors since labels are i18n-driven.
  let opened = false
  for (const sel of [
    'button:has-text("New Compliance Task")',
    'button:has-text("New Task")',
    'button:has-text("Create")',
    'button:has-text("Add")',
    '[data-testid="create-event-button"]',
  ]) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click({ timeout: 2000 })
        opened = true
        break
      }
    } catch {
      // try next
    }
  }
  expect(opened, 'create-event button should be reachable').toBeTruthy()

  // Modal: title input.
  const titleInput = page.locator('input[type="text"]').first()
  await titleInput.waitFor({ state: 'visible', timeout: 5000 })
  await titleInput.fill(EVENT_TITLE)

  // Date input — pick today.
  const today = new Date().toISOString().slice(0, 10)
  const dateInput = page.locator('input[type="date"]').first()
  await dateInput.fill(today)

  // Event-type dropdown — pick the first available type. The EditableSelect
  // renders as a <button>. Click the trigger then the first non-Add option.
  try {
    // The type select is the second trigger (after the date input). Be defensive.
    const triggers = page.locator('div.grid button[type="button"]')
    const triggerCount = await triggers.count()
    if (triggerCount > 0) {
      // Find a trigger button that's likely the type dropdown — try each.
      for (let i = 0; i < triggerCount; i++) {
        try {
          await triggers.nth(i).click({ timeout: 1000 })
          const option = page.locator('button, [role="option"], li').filter({ hasText: /^(?!Add).+/i }).first()
          if (await option.isVisible({ timeout: 800 })) {
            await option.click({ timeout: 1000 })
            break
          }
        } catch {
          // try next trigger
        }
      }
    }
  } catch {
    // Default "meeting" type is fine — the store handles unknown ids gracefully.
  }

  // Submit. POST should fire to /api/calendar/events.
  const postPromise = page.waitForResponse(
    (r) =>
      r.url().includes('/api/calendar/events') &&
      r.request().method() === 'POST' &&
      r.status() < 400,
    { timeout: 15_000 },
  )

  let submitted = false
  for (const sel of [
    'button:has-text("Create Task")',
    'button:has-text("Create")',
    'button:has-text("Save")',
    'button:has-text("Submit")',
  ]) {
    try {
      const btn = page.locator(sel).last()
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click({ timeout: 2000 })
        submitted = true
        break
      }
    } catch {
      // try next
    }
  }
  expect(submitted, 'submit button should be reachable').toBeTruthy()

  // Wait for the POST to actually complete server-side.
  const postResponse = await postPromise
  const postBody = await postResponse.json().catch(() => null)
  const createdId: string | null =
    postBody?.data?.id ?? postBody?.id ?? null

  // Reload — the event must come back via GET.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForResponse(
    (r) => r.url().includes('/api/calendar/events') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 15_000 },
  )

  // Switch to a list view (submissions) where titles are visible. The header
  // has a "Submissions" view-mode button — fall back to scanning the page.
  try {
    const submissionsBtn = page.locator('button:has-text("Submissions"), button:has-text("List")').first()
    if (await submissionsBtn.isVisible({ timeout: 1500 })) {
      await submissionsBtn.click({ timeout: 1500 })
    }
  } catch {
    // OK — month view still shows the title in the day cell.
  }

  // Reload-survival assertion: the event title is visible somewhere in the DOM.
  // Be generous on timing — the calendar aggregates 10+ stores.
  let visible = false
  try {
    await page.getByText(EVENT_TITLE, { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 })
    visible = true
  } catch {
    // Try day-cell click on today and check the drawer.
    try {
      const todayCell = page.locator(`[data-date="${today}"], button:has-text("${new Date().getDate()}")`).first()
      if (await todayCell.isVisible({ timeout: 1500 })) {
        await todayCell.click({ timeout: 1500 })
        await page.getByText(EVENT_TITLE, { exact: false }).first().waitFor({ state: 'visible', timeout: 5_000 })
        visible = true
      }
    } catch {
      // remains false
    }
  }

  // Log traffic for the supervisor regardless of pass/fail.
  console.log('FIX-D calendar requests captured:')
  for (const r of calendarRequests) console.log(`  ${r.method} ${r.url}`)

  // Cleanup: delete the event via the API (best-effort, never throw).
  if (createdId) {
    try {
      await page.evaluate(async (id) => {
        await fetch(`/api/calendar/events/${id}`, { method: 'DELETE', credentials: 'include' })
      }, createdId)
    } catch {
      // ignore cleanup errors
    }
  }

  expect(visible, `event "${EVENT_TITLE}" should be visible after reload`).toBeTruthy()
})
