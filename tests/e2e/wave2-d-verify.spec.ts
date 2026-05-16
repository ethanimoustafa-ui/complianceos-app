import { test, expect, type Page } from '@playwright/test'

/**
 * Wave 2 / Agent D verification.
 *
 * Calendar: create an event via the UI and assert its title is visible on
 * the month grid (not just in the database).
 * Audit log i18n: navigate to /team/logs and assert no row's description
 * cell shows a raw canonical action key (e.g. `observation.checklist.create`)
 * — the renderer must translate those to human phrases.
 */

const ADMIN = { email: 'admin@complianceos.local', password: 'ComplianceOS!2026' }

async function robustSignIn(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 25_000 })
      await page.locator('input[type="email"]').fill(ADMIN.email)
      await page.locator('input[type="password"]').fill(ADMIN.password)
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: /sign in|log in/i }).click({ timeout: 5_000 })
      await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30_000 })
      return
    } catch (e) {
      if (attempt === 3) throw e
      await page.waitForTimeout(1500)
    }
  }
}

test('wave2-d: calendar event renders + audit log keys are human', async ({ page }) => {
  test.setTimeout(180_000)

  await robustSignIn(page)

  // -------- Part 1: Calendar event visible on grid -------------------------
  await page.goto('/calendar', { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(
    (r) =>
      r.url().includes('/api/calendar/events') &&
      r.request().method() === 'GET' &&
      r.status() === 200,
    { timeout: 20_000 },
  )

  // Open the create-event modal.
  const createBtn = page.locator('button.bg-emerald-600:has-text("Create Task")').first()
  await createBtn.click({ timeout: 8_000 })

  const titleInput = page.locator('input[type="text"]').first()
  await titleInput.waitFor({ state: 'visible', timeout: 5_000 })
  const eventTitle = `Wave2D_${Date.now()}`
  await titleInput.fill(eventTitle)

  // Pick a date inside the current month so the new event lands on the
  // currently-visible grid.
  const today = new Date()
  const yyyyMm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const targetDate = `${yyyyMm}-${String(Math.min(28, today.getDate() + 2)).padStart(2, '0')}`
  await page.locator('input[type="date"]').first().fill(targetDate)

  const postPromise = page.waitForResponse(
    (r) =>
      r.url().includes('/api/calendar/events') &&
      r.request().method() === 'POST' &&
      r.status() < 400,
    { timeout: 20_000 },
  )

  // Modal-internal submit button has the `flex-1` class.
  await page.locator('button.flex-1.bg-emerald-600:has-text("Create Task")').click({ timeout: 5_000 })
  const postResponse = await postPromise
  const postBody = await postResponse.json().catch(() => null)
  const createdId: string | null = postBody?.data?.id ?? postBody?.id ?? null

  // The title must be visible somewhere on the page (month grid cell or drawer).
  await page.getByText(eventTitle, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })

  // Cleanup: delete the event.
  if (createdId) {
    await page.evaluate(async (id: string) => {
      await fetch(`/api/calendar/events/${id}`, { method: 'DELETE', credentials: 'include' })
    }, createdId)
  }

  // -------- Part 2: Audit-log descriptions are human phrases ----------------
  await page.goto('/team/logs', { waitUntil: 'domcontentloaded' })
  await page.waitForResponse(
    (r) =>
      r.url().includes('/api/team/logs') &&
      r.request().method() === 'GET' &&
      r.status() === 200,
    { timeout: 20_000 },
  )

  // Allow the table body to populate.
  await page.waitForTimeout(1_500)

  // Collect every description-cell value and assert none is a raw key.
  const rawKeyShape = /^[a-z_]+\.[a-z_]+(\.[a-z_]+)*$/i
  const descriptionCells = await page
    .locator('table tbody tr td:nth-child(5)')
    .allTextContents()

  // We don't strictly require any rows to exist, but if there ARE rows none
  // may render a raw key.
  for (const cell of descriptionCells) {
    const trimmed = cell.trim()
    if (!trimmed) continue
    expect(
      rawKeyShape.test(trimmed),
      `audit-log description should be a human phrase, got raw key: "${trimmed}"`,
    ).toBeFalsy()
  }
})
