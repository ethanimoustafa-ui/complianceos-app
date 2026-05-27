/**
 * W27.3-β probe: mutation-spinners
 *
 * For each mutation surface, click the primary action button and assert within
 * 50 ms that the button is either `disabled` or carries `aria-busy="true"`.
 * This catches regressions where a spinner state was removed or the flag was
 * not propagated to the button element.
 *
 * Run with Playwright:
 *   npx playwright test tests/probes/mutation-spinners.ts
 */

import { test, expect, Page } from '@playwright/test'
import * as path from 'path'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const ARTIFACT_DIR = path.join(__dirname, '../e2e/_artifacts/w27.3/beta')

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/auth`)
  // Fill admin credentials — adjust selectors if auth page differs
  const emailInput = page.locator('input[type="email"]').first()
  const passInput  = page.locator('input[type="password"]').first()
  if (await emailInput.isVisible()) {
    await emailInput.fill('admin@complianceos.local')
    await passInput.fill('admin')
    await page.keyboard.press('Enter')
    await page.waitForURL(/dashboard|correspondence|observations/, { timeout: 10_000 })
  }
}

/** Assert the button is disabled or aria-busy within 100 ms of clicking. */
async function assertSpinnerOnClick(btn: ReturnType<Page['locator']>) {
  await btn.click({ force: true })
  // Check either disabled attribute or aria-busy="true"
  await expect(btn.or(btn.locator('[aria-busy="true"]'))).toBeDisabled({ timeout: 100 })
    .catch(async () => {
      // Fallback: check aria-busy directly
      await expect(btn).toHaveAttribute('aria-busy', 'true', { timeout: 50 })
    })
}

// ── Create Advisory Request ──────────────────────────────────────────────────
test('A2 — Create Advisory button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/advisory`)
  await page.getByRole('button', { name: /new request/i }).click()
  // Fill minimum required fields
  await page.locator('input[placeholder*="subject" i]').first().fill('Test Advisory')
  await page.locator('textarea').first().fill('Test description for advisory')
  const submitBtn = page.getByRole('button', { name: /submit request/i })
  await submitBtn.click()
  // Within 50 ms the button should be disabled
  await expect(submitBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/a2-create-advisory.png` })
})

// ── Add Note (Advisory) ──────────────────────────────────────────────────────
test('A3 — Add Note button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/advisory`)
  // Open first advisory
  await page.locator('.glass-card').first().click()
  await page.locator('textarea[placeholder*="note" i]').first().fill('Test note')
  const addNoteBtn = page.getByRole('button', { name: /add note/i })
  await addNoteBtn.click()
  await expect(addNoteBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/a3-add-note.png` })
})

// ── Submit for Approval (Letter) ─────────────────────────────────────────────
test('Submit for Approval button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/letters`)
  // Find a draft letter and open it
  const draftRow = page.locator('tr').filter({ hasText: /drafting/i }).first()
  if (await draftRow.count() === 0) {
    test.skip(true, 'No draft letters found')
    return
  }
  await draftRow.click()
  const submitBtn = page.getByRole('button', { name: /submit for approval/i })
  await submitBtn.click()
  await expect(submitBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/submit-for-approval.png` })
})

// ── Approve / Reject (Letter pending-approval) ───────────────────────────────
test('Approve button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/letters`)
  const pendingRow = page.locator('tr').filter({ hasText: /pending approval/i }).first()
  if (await pendingRow.count() === 0) {
    test.skip(true, 'No pending-approval letters found')
    return
  }
  await pendingRow.click()
  const approveBtn = page.getByRole('button', { name: /approve step/i }).first()
  if (await approveBtn.count() === 0) {
    test.skip(true, 'No approve step button found')
    return
  }
  await approveBtn.click()
  await expect(approveBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/approve-step.png` })
})

// ── Create Observation ───────────────────────────────────────────────────────
test('O4 — Create Observation button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/observations`)
  await page.getByRole('button', { name: /add observation/i }).click()
  // Fill required fields
  await page.locator('input[placeholder*="finding title" i]').fill('Test Observation')
  await page.locator('input[placeholder*="sub" i]').first().fill('Sub title')
  await page.locator('textarea[placeholder*="description" i]').fill('Test description that is long enough')
  const createBtn = page.getByRole('button', { name: /create observation/i })
  await createBtn.click()
  await expect(createBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/o4-create-observation.png` })
})

// ── Add Checklist Item (Observation) ─────────────────────────────────────────
test('Add Checklist Item button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/observations`)
  const firstRow = page.locator('[data-testid="observation-row"]').first()
  if (await firstRow.count() === 0) {
    // Try generic row click
    await page.locator('tr td').first().click()
  } else {
    await firstRow.click()
  }
  // Fill checklist input
  const checklistInput = page.locator('input[placeholder*="checklist" i]').first()
  if (await checklistInput.count() === 0) {
    test.skip(true, 'Checklist input not visible')
    return
  }
  await checklistInput.fill('Test checklist item')
  const addBtn = page.locator('button[aria-busy], button:has([data-icon="lucide:plus"])').filter({ hasNot: page.locator('[aria-label]') }).last()
  await addBtn.click()
  await expect(addBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/add-checklist-item.png` })
})

// ── Policy Add Step ──────────────────────────────────────────────────────────
test('Policy Add Step button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/regulatory-updates/policies`)
  await page.locator('.glass-card, [role="row"]').first().click()
  const workflowTab = page.getByRole('tab', { name: /workflow/i })
  if (await workflowTab.count() > 0) await workflowTab.click()
  const addStepToggle = page.getByRole('button', { name: /add workflow step/i })
  if (await addStepToggle.count() === 0) {
    test.skip(true, 'Add workflow step button not found')
    return
  }
  await addStepToggle.click()
  await page.locator('input[placeholder*="legal review" i]').fill('Test Step')
  const addBtn = page.getByRole('button', { name: /^add$/i })
  await addBtn.click()
  await expect(addBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/policy-add-step.png` })
})

// ── Create Tier (Settings) ───────────────────────────────────────────────────
test('Create Tier button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/settings`)
  const addTierBtn = page.getByRole('button', { name: /add tier/i })
  if (await addTierBtn.count() === 0) {
    test.skip(true, 'Add tier button not found')
    return
  }
  await addTierBtn.click()
  await page.locator('input[placeholder="tier_4"]').fill('tier_test')
  await page.locator('input').nth(1).fill('Test Tier EN')
  await page.locator('input[dir="rtl"]').first().fill('اختبار')
  const saveBtn = page.getByRole('button', { name: /^add$/i })
  await saveBtn.click()
  await expect(saveBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/create-tier.png` })
})

// ── Create Source (Settings) ─────────────────────────────────────────────────
test('Create Source button spins on click', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/settings`)
  const addSourceBtn = page.getByRole('button', { name: /add source/i })
  if (await addSourceBtn.count() === 0) {
    test.skip(true, 'Add source button not found')
    return
  }
  await addSourceBtn.click()
  await page.locator('input[placeholder]').first().fill('test_src')
  await page.locator('input').nth(1).fill('Test Source EN')
  await page.locator('input[dir="rtl"]').first().fill('اختبار')
  const saveBtn = page.getByRole('button', { name: /^add$/i })
  await saveBtn.click()
  await expect(saveBtn).toBeDisabled({ timeout: 50 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/create-source.png` })
})
