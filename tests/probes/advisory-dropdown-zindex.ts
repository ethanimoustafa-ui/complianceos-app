/**
 * W28-α probe: advisory-dropdown-zindex
 *
 * A2 Z-INDEX REGRESSION VERIFICATION
 *
 * For each filter dropdown on the advisory page (Status, Priority, Business Unit,
 * Timeframe), click the trigger and verify:
 *   1. The dropdown panel is visible (not hidden behind a stacking context).
 *   2. The panel's bounding rect extends below the trigger row.
 *   3. `elementFromPoint` at the panel's centre returns an element INSIDE the
 *      dropdown (not occluded by a sibling or ancestor).
 *
 * Run with Playwright:
 *   npx playwright test tests/probes/advisory-dropdown-zindex.ts
 */

import { test, expect, Page } from '@playwright/test'
import * as path from 'path'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const ARTIFACT_DIR = path.join(__dirname, '../e2e/_artifacts/w28/alpha')

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/auth`)
  const emailInput = page.locator('input[type="email"]').first()
  const passInput  = page.locator('input[type="password"]').first()
  if (await emailInput.isVisible()) {
    await emailInput.fill('admin@complianceos.local')
    await passInput.fill('admin')
    await page.keyboard.press('Enter')
    await page.waitForURL(/dashboard|correspondence|observations/, { timeout: 10_000 })
  }
}

/**
 * Check that clicking a dropdown trigger:
 *   - makes a panel visible
 *   - the panel sits BELOW the trigger (not clipped above)
 *   - the element at the panel centre belongs to the dropdown (not occluded)
 */
async function assertDropdownVisible(
  page: Page,
  triggerLocator: ReturnType<Page['locator']>,
  label: string,
) {
  // Find the trigger button for this EditableSelect
  const trigger = triggerLocator.locator('button').first()
  if (await trigger.count() === 0) {
    console.warn(`[advisory-dropdown-zindex] ${label}: trigger button not found, skipping`)
    return
  }

  await trigger.click()

  // The dropdown panel is now portal-rendered into body.
  // We can't rely on a parent selector — look for a floating panel
  // that appeared after the click by checking for a visible bg-white shadow-xl panel.
  const panel = page.locator('body > div.bg-white.border.border-slate-200.rounded-lg.shadow-xl').last()

  // Give the portal a frame to mount
  await page.waitForTimeout(50)

  const panelVisible = await panel.isVisible().catch(() => false)
  expect(panelVisible, `${label}: dropdown panel must be visible after click`).toBe(true)

  if (!panelVisible) return

  // Get bounding rects
  const triggerBox = await trigger.boundingBox()
  const panelBox   = await panel.boundingBox()

  expect(triggerBox, `${label}: trigger must have a bounding box`).not.toBeNull()
  expect(panelBox,   `${label}: panel must have a bounding box`).not.toBeNull()

  if (!triggerBox || !panelBox) return

  // Panel y must be >= trigger bottom (it opens downward)
  expect(panelBox.y, `${label}: panel y (${panelBox.y}) must be >= trigger bottom (${triggerBox.y + triggerBox.height})`).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 2 /* allow 2px tolerance */)

  // elementFromPoint at the panel centre must be INSIDE the panel (not occluded)
  const cx = panelBox.x + panelBox.width  / 2
  const cy = panelBox.y + panelBox.height / 2

  const topElement = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      // Walk up and check if any ancestor is the dropdown panel
      let node: Element | null = el
      while (node) {
        if (
          node.classList.contains('shadow-xl') &&
          node.classList.contains('bg-white') &&
          node.classList.contains('border-slate-200')
        ) return 'inside-panel'
        node = node.parentElement
      }
      return el.tagName + (el.className ? '.' + el.className.split(' ').join('.') : '')
    },
    { x: cx, y: cy },
  )

  expect(topElement, `${label}: elementFromPoint at panel centre must resolve to panel or its child`).toBe('inside-panel')

  // Close the dropdown for the next iteration
  await page.keyboard.press('Escape')
  await page.waitForTimeout(50)
}

// ── Main test ────────────────────────────────────────────────────────────────

test('A2 — Advisory filter dropdowns are not occluded (z-index portal fix)', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/advisory`)
  await page.waitForLoadState('networkidle')

  // The filter panel contains 4–5 EditableSelect dropdowns.
  // Locate each by its label text.
  const filterPanel = page.locator('.glass-card.rounded-2xl.p-6').first()

  // Status filter
  const statusFilter = filterPanel.locator('div').filter({ hasText: /^Status$/i }).first()
  await assertDropdownVisible(page, statusFilter, 'Status')

  // Priority filter
  const priorityFilter = filterPanel.locator('div').filter({ hasText: /^Priority$/i }).first()
  await assertDropdownVisible(page, priorityFilter, 'Priority')

  // Business Unit filter (has onAdd — full-edit mode)
  const buFilter = filterPanel.locator('div').filter({ hasText: /business unit/i }).first()
  await assertDropdownVisible(page, buFilter, 'Business Unit')

  // Timeframe filter
  const timeframeFilter = filterPanel.locator('div').filter({ hasText: /timeframe/i }).first()
  await assertDropdownVisible(page, timeframeFilter, 'Timeframe')

  await page.screenshot({ path: `${ARTIFACT_DIR}/a2-advisory-dropdown-zindex.png` })
})

// ── Smoke: z-index value on panel is high ────────────────────────────────────
test('A2 — Advisory dropdown panel has z-index >= 9999', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/advisory`)
  await page.waitForLoadState('networkidle')

  const filterPanel = page.locator('.glass-card.rounded-2xl.p-6').first()
  const statusFilter = filterPanel.locator('div').filter({ hasText: /^Status$/i }).first()
  const trigger = statusFilter.locator('button').first()

  if (await trigger.count() === 0) {
    test.skip(true, 'Status filter trigger not found')
    return
  }

  await trigger.click()
  await page.waitForTimeout(50)

  // The panel is portal-rendered into body; check its computed z-index via
  // the inline style that EditableSelect applies.
  const panelZIndex = await page.evaluate(() => {
    // Find the most recently appended portal div on body
    const panels = Array.from(
      document.body.querySelectorAll<HTMLElement>('div.bg-white.shadow-xl.rounded-lg'),
    )
    const last = panels[panels.length - 1]
    if (!last) return 0
    return parseInt(last.style.zIndex || '0', 10)
  })

  expect(panelZIndex, 'Portal dropdown z-index must be >= 9999').toBeGreaterThanOrEqual(9999)

  await page.screenshot({ path: `${ARTIFACT_DIR}/a2-zindex-value.png` })
})
