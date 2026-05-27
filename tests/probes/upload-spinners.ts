/**
 * W27.3-β probe: upload-spinners
 *
 * For each file-upload surface, stub fetch with a 1-second delay and assert
 * that the dropzone / upload button immediately shows an uploading state after
 * a file is dropped or selected.
 *
 * Run with Playwright:
 *   npx playwright test tests/probes/upload-spinners.ts
 */

import { test, expect, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const ARTIFACT_DIR = path.join(__dirname, '../e2e/_artifacts/w27.3/beta')

// A tiny 1-byte PDF to use as upload fixture
const FIXTURE_PDF = path.join(__dirname, '../fixtures/sample.pdf')

function ensureFixturePdf() {
  const dir = path.dirname(FIXTURE_PDF)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(FIXTURE_PDF)) {
    // Minimal valid-ish PDF header
    fs.writeFileSync(FIXTURE_PDF, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
  }
}

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

// ── O1: Observation evidence upload (FileUploadModal) ────────────────────────
test('O1 — Observation evidence upload shows spinner', async ({ page }) => {
  ensureFixturePdf()
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/observations`)

  // Open first observation detail
  await page.locator('tr td').first().click()

  // Click "Upload Document" / "+ Add Document"
  const uploadTrigger = page.getByRole('button', { name: /upload|add document/i }).first()
  if (await uploadTrigger.count() === 0) {
    test.skip(true, 'Upload trigger not found in observation detail')
    return
  }
  await uploadTrigger.click()

  // Select a file in the modal
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles(FIXTURE_PDF)

  // Click Upload/Confirm in the modal
  const confirmBtn = page.getByRole('button', { name: /upload files|confirm|upload/i }).last()
  await confirmBtn.click()

  // Immediately check for spinner / disabled state
  await expect(confirmBtn).toBeDisabled({ timeout: 100 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/o1-observation-upload.png` })
})

// ── P2: Policy document upload ───────────────────────────────────────────────
test('P2 — Policy document upload shows spinner', async ({ page }) => {
  ensureFixturePdf()
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/regulatory-updates/policies`)

  // Open first policy
  await page.locator('.glass-card, [role="row"]').first().click()

  // Click "Upload Policy Document"
  const uploadBtn = page.getByRole('button', { name: /upload.*document|upload policy/i }).first()
  if (await uploadBtn.count() === 0) {
    test.skip(true, 'Policy document upload button not found')
    return
  }

  // The button triggers a hidden file input — intercept and inject a file
  const fileInput = page.locator('input[type="file"][accept*=".pdf"]').first()
  await fileInput.setInputFiles(FIXTURE_PDF)

  // The button should enter loading state
  await expect(uploadBtn).toHaveAttribute('aria-busy', 'true', { timeout: 100 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/p2-policy-doc-upload.png` })
})

// ── Policy evidence upload ───────────────────────────────────────────────────
test('P2b — Policy evidence upload shows spinner', async ({ page }) => {
  ensureFixturePdf()
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/regulatory-updates/policies`)

  await page.locator('.glass-card, [role="row"]').first().click()

  // Navigate to evidence tab if exists
  const evidenceTab = page.getByRole('tab', { name: /evidence/i })
  if (await evidenceTab.count() > 0) await evidenceTab.click()

  const addEvidenceBtn = page.getByRole('button', { name: /add evidence/i }).first()
  if (await addEvidenceBtn.count() === 0) {
    test.skip(true, 'Add evidence button not found')
    return
  }

  const evidenceFileInput = page.locator('input[type="file"]').last()
  await evidenceFileInput.setInputFiles(FIXTURE_PDF)

  await expect(addEvidenceBtn).toHaveAttribute('aria-busy', 'true', { timeout: 100 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/p2b-policy-evidence-upload.png` })
})

// ── Letter attachment upload ─────────────────────────────────────────────────
test('Letter attachment upload shows spinner', async ({ page }) => {
  ensureFixturePdf()
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/letters`)

  // Open a letter in detail view
  const letterRow = page.locator('tbody tr').first()
  if (await letterRow.count() === 0) {
    test.skip(true, 'No letters found')
    return
  }
  await letterRow.click()

  // The "+ Add Attachment" button
  const attachBtn = page.getByRole('button', { name: /add attachment/i }).first()
  if (await attachBtn.count() === 0) {
    test.skip(true, 'Add attachment button not found')
    return
  }

  // Inject file directly into hidden input
  const attachInput = page.locator('input[ref="attachFileRef"], input[type="file"][multiple]').last()
  await attachInput.setInputFiles(FIXTURE_PDF)

  // Button should be disabled while uploading
  await expect(attachBtn).toBeDisabled({ timeout: 500 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/letter-attachment-upload.png` })
})

// ── Template signature upload (TemplateEditForm L5) ──────────────────────────
test('L5 — Template signature upload shows spinner', async ({ page }) => {
  ensureFixturePdf()
  await loginAsAdmin(page)
  await page.goto(`${BASE_URL}/correspondence/letters`)

  // Open template management
  const manageBtn = page.getByRole('button', { name: /manage templates/i })
    .or(page.getByText(/manage templates/i))
    .first()
  if (await manageBtn.count() === 0) {
    test.skip(true, 'Manage templates link not found')
    return
  }
  await manageBtn.click()

  // Click Edit on first template
  const editBtn = page.locator('button[title="Edit"]').first()
  if (await editBtn.count() === 0) {
    test.skip(true, 'Template edit button not found')
    return
  }
  await editBtn.click()

  // Navigate to Signer tab
  const signerTab = page.getByRole('button', { name: /signer/i }).first()
  if (await signerTab.count() > 0) await signerTab.click()

  // Upload a signature image
  const sigInput = page.locator('input[type="file"][accept*="image"]').first()
  if (await sigInput.count() === 0) {
    test.skip(true, 'Signature file input not found')
    return
  }
  await sigInput.setInputFiles(FIXTURE_PDF) // using PDF as proxy (file type doesn't matter for spinner test)

  // Spinner should appear immediately
  const spinnerEl = page.locator('[class*="animate-spin"]')
  await expect(spinnerEl).toBeVisible({ timeout: 200 })
  await page.screenshot({ path: `${ARTIFACT_DIR}/l5-template-signature-upload.png` })
})
