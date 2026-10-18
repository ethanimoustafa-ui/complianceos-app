import { test, expect, type Page } from '@playwright/test'
import { signIn } from '../_helpers/sign-in'

/**
 * The auth flow is racy in dev — the AuthListener occasionally misses the
 * initial session sync, leaving the user on /sign-in. Retry the helper up
 * to 3 times before giving up.
 */
async function resilientSignIn(page: Page) {
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await signIn(page, { timeout: 30_000 })
      return
    } catch (e) {
      lastErr = e
      await page.waitForTimeout(1500)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('signIn failed after 3 attempts')
}

/**
 * Fix-C verification spec.
 *
 * Reproduces W3's training-course persistence bug, then asserts the fix:
 *   1. Sign in as admin.
 *   2. Open /team/training and the Manage Training modal.
 *   3. Create a course `FixC_Course_${ts}` (name + category + due date).
 *   4. Reload the page.
 *   5. Re-open the Manage modal and assert the course name is still visible
 *      (proves it persisted to Supabase via /api/training/courses).
 *
 * Cleanup: after assertion, delete the course via the modal's confirm-delete UI.
 * Failure modes are caught with try/catch on every locator so the spec produces
 * a clear failure message instead of a generic timeout.
 */

const TRAINING_URL = '/team/training'

async function openManageModal(page: Page) {
  // The "Manage Trainings" button lives in the page header.
  const manageBtn = page.getByRole('button', { name: /manage training/i }).first()
  await manageBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await manageBtn.click({ timeout: 5_000 })
  // Wait for the modal's title to appear — this confirms the dialog mounted.
  await page
    .getByRole('heading', { name: /manage training programs|training programs/i })
    .first()
    .waitFor({ state: 'visible', timeout: 8_000 })
}

async function pickOrAddCategory(page: Page, addNameIfEmpty: string) {
  // EditableSelect renders a div-based popover anchored to its trigger button.
  // The trigger's parent (`<div class="relative">`) wraps both the trigger and
  // the popover, so we scope all popover queries to that wrapper to avoid
  // matching unrelated z-50 elements (like the modal backdrop).
  // The training-category store starts EMPTY in a fresh tab → if no existing
  // option is visible, fall back to the inline "Add new" affordance.
  try {
    const trigger = page
      .locator('button[type="button"]')
      .filter({ hasText: /select category/i })
      .first()
    await trigger.waitFor({ state: 'visible', timeout: 3_000 })

    // Scope by ascending to the EditableSelect root (the wrapping div).
    const root = trigger.locator('xpath=..')
    await trigger.click({ timeout: 2_000 })

    // The popover is a child of `root` with `absolute` positioning.
    const popover = root.locator('> div.absolute').first()
    await popover.waitFor({ state: 'visible', timeout: 3_000 })

    // List view: option rows have class "cursor-pointer".
    const existing = popover.locator('div.cursor-pointer').first()
    if (await existing.isVisible({ timeout: 800 }).catch(() => false)) {
      await existing.click({ timeout: 2_000 })
      return true
    }

    // Empty — open the add-view via the "Add new" button.
    const addEntryBtn = popover
      .locator('button')
      .filter({ hasText: /add new|add entry/i })
      .first()
    await addEntryBtn.waitFor({ state: 'visible', timeout: 2_000 })
    await addEntryBtn.click({ timeout: 2_000 })

    // Add-view: the first <input> inside the popover.
    const nameField = popover.locator('input').first()
    await nameField.waitFor({ state: 'visible', timeout: 2_000 })
    await nameField.fill(addNameIfEmpty, { timeout: 2_000 })

    // Submit the new entry via Enter — the input handles Enter→submitDraft.
    await nameField.press('Enter')
    return true
  } catch {
    return false
  }
}

test.describe.configure({ mode: 'serial' })

test('Fix-C: training course persists across reload', async ({ page }) => {
  test.setTimeout(120_000)

  // Capture all training API traffic so failures show whether POST fired.
  const trainingTraffic: { method: string; status: number; url: string; body?: string }[] = []
  page.on('response', async (r) => {
    const url = r.url()
    if (!url.includes('/api/training/')) return
    let body: string | undefined
    try {
      body = (await r.text()).slice(0, 200)
    } catch { /* opaque */ }
    trainingTraffic.push({ method: r.request().method(), status: r.status(), url, body })
  })

  await resilientSignIn(page)
  await page.goto(TRAINING_URL, { waitUntil: 'domcontentloaded' })

  // Wait for the page hero so we know the route mounted.
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 })

  // ---------- create ----------
  await openManageModal(page)

  // Click the green "Add Course" button (top, inside the modal) to reveal the inline form.
  // There are two "Add Course" buttons once the form opens — the header opener
  // (rendered first in DOM) and the submit button inside the form. We click first().
  const addCourseToggle = page.getByRole('button', { name: /^add course$/i }).first()
  await addCourseToggle.waitFor({ state: 'visible', timeout: 5_000 })
  await addCourseToggle.click({ timeout: 5_000 })
  await page.waitForTimeout(500)

  const courseName = `FixC_Course_${Date.now()}`

  // Wait for the inline add-course form to render.
  await page.waitForTimeout(1000)

  // The course name input's placeholder is "e.g., AML Fundamentals" (i18n
  // training.courseNamePlaceholder). The Input wrapper uses an unassociated
  // <label> so getByLabel doesn't match — target the placeholder directly.
  try {
    const nameInput = page.getByPlaceholder(/AML Fundamentals|enter course name/i).first()
    await nameInput.waitFor({ state: 'visible', timeout: 8_000 })
    await nameInput.fill(courseName, { timeout: 5_000 })
  } catch (e) {
    throw new Error(`could not fill course name: ${(e as Error).message}`)
  }

  // Category — pick an existing one or inline-add a new one. The submit stays
  // disabled until a category is selected, so this step is required.
  const categoryName = `FixC_Cat_${Date.now()}`
  const categoryPicked = await pickOrAddCategory(page, categoryName)
  if (!categoryPicked) {
    test.info().annotations.push({
      type: 'category-fallback',
      description: 'EditableSelect category picker not discoverable',
    })
  }
  await page.waitForTimeout(500)

  // Due date — type="date" expects YYYY-MM-DD, choose ~30 days out.
  const due = new Date()
  due.setDate(due.getDate() + 30)
  const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`
  try {
    await page.locator('input[type="date"]:visible').first().fill(dueStr, { timeout: 3_000 })
  } catch {
    /* due-date field optional in some forms — leave blank */
  }

  // Submit — the inline form's primary submit is also labelled "Add Course".
  // Use last() to pick the form-bottom submit, not the header opener.
  const submit = page.getByRole('button', { name: /^add course$/i }).last()
  await submit.waitFor({ state: 'visible', timeout: 3_000 })
  await submit.click({ timeout: 5_000 })

  // Give the optimistic insert + POST a beat to settle.
  await page.waitForTimeout(1500)

  // Course should be visible in the modal's list.
  await expect(page.getByText(courseName).first()).toBeVisible({ timeout: 6_000 })

  // ---------- reload ----------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15_000 })

  // Re-open Manage modal — list now hydrated from /api/training/courses.
  await openManageModal(page)

  // Log the traffic so a failed assert shows whether the POST + GET happened.
  // eslint-disable-next-line no-console
  console.log('[Fix-C] training traffic so far:\n' + trainingTraffic.map((t) => `  ${t.method} ${t.status} ${t.url}\n    body: ${t.body ?? ''}`).join('\n'))

  // The course must still appear post-reload.
  await expect(page.getByText(courseName).first()).toBeVisible({ timeout: 10_000 })

  // ---------- cleanup ----------
  try {
    // Find the course row → click the trash icon → confirm.
    const courseRow = page.locator(`text=${courseName}`).first().locator('xpath=ancestor::div[contains(@class, "p-4")][1]')
    const trashBtn = courseRow.getByRole('button').filter({ has: page.locator('svg') }).last()
    await trashBtn.click({ timeout: 3_000 })
    // Confirm-delete renders a Delete button in red.
    const confirmDelete = page.getByRole('button', { name: /^delete$/i }).last()
    await confirmDelete.click({ timeout: 3_000 })
    await page.waitForTimeout(800)
  } catch (e) {
    // Cleanup is best-effort; record but don't fail.
    test.info().annotations.push({
      type: 'cleanup-skipped',
      description: `Could not delete test course via UI: ${(e as Error).message}`,
    })
  }
})
