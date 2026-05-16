import { test, expect, type Page } from '@playwright/test'
import { signIn } from './_helpers/sign-in'
import path from 'node:path'
import fs from 'node:fs'

/**
 * W3 walker — Policies + Training + Calendar.
 *
 * Walker charter: navigate each route the supervisor cares about, capture
 * console + network errors, exercise the primary user story, screenshot on
 * failure, NEVER fix bugs inline. Findings are flushed to console and to a
 * structured per-route artifact dump that the supervisor can grep.
 *
 * Charter-stated routes (e.g. /policies, /training, /policies/templates) do
 * not exist in this codebase. The actual routes are:
 *   - /correspondence/regulatory-updates/policies  (list + create-modal + detail-modal)
 *   - /team/training                               (list + manage-modal + assign-modal)
 *   - /calendar                                    (list + create-event-modal)
 * The "Could not exercise" section in the report covers the missing routes.
 */

type HttpError = { status: number; url: string; body?: string }

const ARTIFACT_DIR = path.join(__dirname, '_artifacts')
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-')

function ensureArtifactDir() {
  if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
}

function installSpies(page: Page): { consoleErrors: string[]; httpErrors: HttpError[] } {
  const consoleErrors: string[] = []
  const httpErrors: HttpError[] = []

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (err) => {
    consoleErrors.push(`pageerror: ${err.message}`)
  })
  page.on('response', async (r) => {
    const status = r.status()
    if (status < 400) return
    const url = r.url()
    if (url.includes('/_next/') || url.endsWith('/favicon.ico')) return
    let body: string | undefined
    try {
      body = (await r.text()).slice(0, 300)
    } catch {
      body = undefined
    }
    httpErrors.push({ status, url, body })
  })
  return { consoleErrors, httpErrors }
}

async function safeScreenshot(page: Page, slug: string) {
  ensureArtifactDir()
  const fp = path.join(ARTIFACT_DIR, `W3-${slug}-${RUN_TS}.png`)
  try {
    await page.screenshot({ path: fp, fullPage: true, timeout: 5_000 })
    console.log(`[W3] screenshot saved: ${fp}`)
  } catch (e) {
    console.log(`[W3] screenshot FAILED for ${slug}: ${(e as Error).message}`)
  }
}

function dumpFindings(slug: string, consoleErrors: string[], httpErrors: HttpError[], extras: Record<string, unknown> = {}) {
  console.log(`\n========== W3 FINDINGS :: ${slug} ==========`)
  console.log(`console errors: ${consoleErrors.length}`)
  for (const e of consoleErrors) console.log(`  - ${e}`)
  console.log(`http errors:    ${httpErrors.length}`)
  for (const e of httpErrors) console.log(`  - ${e.status} ${e.url} :: ${e.body ?? ''}`)
  for (const k of Object.keys(extras)) console.log(`${k}: ${JSON.stringify(extras[k])}`)
  console.log(`========== /W3 FINDINGS :: ${slug} ==========\n`)
}

/**
 * Resilient sign-in — the dev server can be slow to compile /sign-in on cold hits,
 * and the form click occasionally fires before hydration. We retry the whole flow
 * up to 3 times before giving up.
 */
async function robustSignIn(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await page.locator('input[type="email"]').fill('admin@complianceos.local')
      await page.locator('input[type="password"]').fill('ComplianceOS!2026')
      // Wait for hydration — button should be interactive
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: /sign in|log in/i }).click({ timeout: 5_000 })
      await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 25_000 })
      return
    } catch (e) {
      console.log(`[W3] signIn attempt ${attempt} failed: ${(e as Error).message}`)
      if (attempt === 3) throw e
      await page.waitForTimeout(1_000)
    }
  }
}

async function gotoNetworkIdle(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 8_000 })
  } catch {
    // fall back to domcontentloaded — networkidle commonly times out due to HMR sockets in dev
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8_000 }).catch(() => {})
  }
}

/**
 * The walker tests are diagnostic — they MUST NOT fail the suite on errors;
 * they record findings. We assert only basic page reachability.
 */

test.describe.configure({ mode: 'serial' })

// ─────────────────────────────────────────────────────────────────────────────
// /calendar — primary calendar surface
// ─────────────────────────────────────────────────────────────────────────────

test('walk /calendar', async ({ page }) => {
  test.setTimeout(90_000)
  const slug = 'calendar'
  const { consoleErrors, httpErrors } = installSpies(page)
  let createdTitle: string | null = null
  const exercised: string[] = []
  const skipped: string[] = []

  try {
    await robustSignIn(page)
    await gotoNetworkIdle(page, '/calendar')

    // Visible landmark
    const landmark = await page.locator('h1, h2, h3').first().textContent().catch(() => null)
    exercised.push(`landmark="${landmark ?? '(none)'}"`)

    // Open Create Event modal — header has button onCreateEvent which calls setIsCreateModalOpen.
    // It's an icon-only button; try by title or by being inside the calendar header.
    const createBtn = page
      .getByRole('button', { name: /new\s*(event|task|compliance)/i })
      .or(page.getByRole('button', { name: /create/i }))
      .or(page.locator('button:has(svg)').filter({ hasText: /new|create|add|task/i }))
      .first()

    let opened = false
    try {
      await createBtn.waitFor({ state: 'visible', timeout: 3_000 })
      await createBtn.click({ timeout: 2_000 })
      opened = true
    } catch {
      // Try a header plus-icon button as fallback
      const plus = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /^$/ })
      const count = await plus.count()
      for (let i = 0; i < Math.min(count, 8); i++) {
        try {
          await plus.nth(i).click({ timeout: 800 })
          // Modal title is "newComplianceTask" or "newEvent"
          if (await page.getByText(/new compliance task|new event/i).first().isVisible({ timeout: 500 }).catch(() => false)) {
            opened = true
            break
          }
        } catch {}
      }
    }

    if (!opened) {
      skipped.push('createEventModalOpen — Create Event button not discoverable')
    } else {
      exercised.push('opened CreateEventModal')

      // Fill title
      createdTitle = `W3_Event_${Date.now()}`
      const titleInput = page.locator('input[type="text"]').first()
      await titleInput.fill(createdTitle, { timeout: 3_000 }).catch(() => {})

      // Fill date — type="date" expects YYYY-MM-DD
      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const dateInput = page.locator('input[type="date"]').first()
      await dateInput.fill(dateStr, { timeout: 2_000 }).catch(() => {})

      // Pick event type via EditableSelect — click the trigger then a known default option.
      // Default seeded types include "meeting" id. We won't fight the combobox; we keep
      // the default selected value (form.type = 'meeting' on mount).
      exercised.push(`eventType=default`)

      // Submit
      const submit = page.getByRole('button', { name: /create task|create event|^create$/i }).first()
      const submitOk = await submit.isVisible({ timeout: 1_500 }).catch(() => false)
      if (!submitOk) {
        skipped.push('createEvent submit — Create button not found inside modal')
      } else {
        await submit.click({ timeout: 2_000 }).catch(() => {})
        await page.waitForTimeout(800)
        exercised.push('clicked Create')

        // Verify event appears — search for our title anywhere
        const found = await page.getByText(createdTitle).first().isVisible({ timeout: 2_500 }).catch(() => false)
        exercised.push(`eventVisible=${found}`)
        if (!found) {
          await safeScreenshot(page, `${slug}-not-visible`)
        }
      }
    }

    // Cleanup: calendar events are zustand-local — page reload clears non-persisted state
    // and there is no per-row delete in the list. Flagged in skipped[].
    skipped.push('cleanup: no UI affordance to delete a single calendar event from /calendar list')
  } catch (err) {
    await safeScreenshot(page, `${slug}-throw`)
    consoleErrors.push(`test-throw: ${(err as Error).message}`)
  }

  dumpFindings(slug, consoleErrors, httpErrors, {
    exercised,
    skipped,
    createdTitle,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// /correspondence/regulatory-updates/policies
// ─────────────────────────────────────────────────────────────────────────────

test('walk /correspondence/regulatory-updates/policies', async ({ page }) => {
  test.setTimeout(90_000)
  const slug = 'reg-updates-policies'
  const { consoleErrors, httpErrors } = installSpies(page)
  const exercised: string[] = []
  const skipped: string[] = []
  let createdName: string | null = null

  try {
    await robustSignIn(page)
    await gotoNetworkIdle(page, '/correspondence/regulatory-updates/policies')

    const landmark = await page.locator('h1').first().textContent().catch(() => null)
    exercised.push(`landmark="${landmark ?? '(none)'}"`)

    // Click "Create Policy". Button copy is from i18n: `policies.createPolicy`.
    const createBtn = page
      .getByRole('button', { name: /create policy|new policy|create/i })
      .first()
    let opened = false
    try {
      await createBtn.waitFor({ state: 'visible', timeout: 3_000 })
      await createBtn.click()
      opened = true
    } catch {
      skipped.push('Create Policy button not visible (Gate "Approve Policy Reviews" may hide it for this role)')
    }

    if (opened) {
      exercised.push('opened Create Policy modal')
      createdName = `W3_Policy_${Date.now()}`

      // Policy Name input — first text input inside the modal
      const nameInput = page.locator('[role="dialog"] input[type="text"], .fixed input[type="text"]').first()
      await nameInput.fill(createdName, { timeout: 2_500 }).catch(() => {})

      // Description (textarea, required)
      const desc = page.locator('textarea').first()
      await desc.fill(`Walker W3 auto policy @ ${new Date().toISOString()}`, { timeout: 2_500 }).catch(() => {})

      // Category + tier are EditableSelect components. We need to click them to open
      // their dropdowns then pick first option. Tier is "locked", so it shows preset items.
      // Just try clicking the locked dropdowns by their visible placeholder text.
      const selectCategory = page.getByText(/select category|select a category/i).first()
      if (await selectCategory.isVisible({ timeout: 500 }).catch(() => false)) {
        await selectCategory.click({ timeout: 1_000 }).catch(() => {})
        // pick first option in menu
        await page.locator('[role="option"], [role="menuitem"]').first().click({ timeout: 1_000 }).catch(() => {})
      }

      const selectTier = page.getByText(/select approval tier|approval tier/i).first()
      if (await selectTier.isVisible({ timeout: 500 }).catch(() => false)) {
        await selectTier.click({ timeout: 1_000 }).catch(() => {})
        await page.locator('[role="option"], [role="menuitem"]').first().click({ timeout: 1_000 }).catch(() => {})
      }

      // Document is REQUIRED (formDocFile). Attach a fake file to the hidden input.
      const fileInput = page.locator('input[type="file"]').first()
      if (await fileInput.count()) {
        // Create a tiny dummy file in artifact dir
        ensureArtifactDir()
        const dummyPath = path.join(ARTIFACT_DIR, 'W3-dummy-policy.pdf')
        if (!fs.existsSync(dummyPath)) fs.writeFileSync(dummyPath, '%PDF-1.4\n%W3 walker dummy\n')
        await fileInput.setInputFiles(dummyPath).catch(() => {})
        exercised.push('attached dummy file')
      } else {
        skipped.push('policy file input not found')
      }

      // Save
      const submit = page.getByRole('button', { name: /^create policy$|^create$|save/i }).last()
      const enabled = await submit.isEnabled({ timeout: 1_500 }).catch(() => false)
      exercised.push(`submitEnabled=${enabled}`)
      if (enabled) {
        await submit.click({ timeout: 2_000 }).catch(() => {})
        await page.waitForTimeout(800)

        const visible = await page.getByText(createdName).first().isVisible({ timeout: 2_500 }).catch(() => false)
        exercised.push(`policyVisibleInList=${visible}`)
        if (!visible) await safeScreenshot(page, `${slug}-policy-not-listed`)

        // Open the created policy → details modal → try to delete
        if (visible) {
          await page.getByText(createdName).first().click({ timeout: 1_500 }).catch(() => {})
          await page.waitForTimeout(400)

          // "Publish version" — best-effort. We try Submit-for-review which is closest.
          const submitForReview = page.getByRole('button', { name: /submit.*review|publish/i }).first()
          if (await submitForReview.isVisible({ timeout: 800 }).catch(() => false)) {
            await submitForReview.click({ timeout: 1_500 }).catch(() => {})
            exercised.push('clicked submit-for-review/publish')
          } else {
            skipped.push('publish-version action not exposed on details modal')
          }

          // Delete — there should be a Delete button on the details modal
          const deleteBtn = page.getByRole('button', { name: /^delete$|delete policy/i }).first()
          if (await deleteBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await deleteBtn.click({ timeout: 1_500 }).catch(() => {})
            // Confirm modal — second delete button
            const confirm = page.getByRole('button', { name: /^delete$|confirm/i }).last()
            await confirm.click({ timeout: 1_500 }).catch(() => {})
            await page.waitForTimeout(500)
            exercised.push('attempted delete')
          } else {
            skipped.push('delete affordance not found on policy details modal')
          }
        }
      } else {
        skipped.push('Create button stayed disabled — required fields likely not all filled')
        await safeScreenshot(page, `${slug}-submit-disabled`)
      }
    }
  } catch (err) {
    await safeScreenshot(page, `${slug}-throw`)
    consoleErrors.push(`test-throw: ${(err as Error).message}`)
  }

  dumpFindings(slug, consoleErrors, httpErrors, { exercised, skipped, createdName })
})

// ─────────────────────────────────────────────────────────────────────────────
// /team/training
// ─────────────────────────────────────────────────────────────────────────────

test('walk /team/training', async ({ page }) => {
  test.setTimeout(90_000)
  const slug = 'team-training'
  const { consoleErrors, httpErrors } = installSpies(page)
  const exercised: string[] = []
  const skipped: string[] = []
  let createdCourse: string | null = null

  try {
    await robustSignIn(page)
    await gotoNetworkIdle(page, '/team/training')

    const landmark = await page.locator('h1').first().textContent().catch(() => null)
    exercised.push(`landmark="${landmark ?? '(none)'}"`)

    // Open "Manage Trainings" modal — this is the only path to add a course.
    const manageBtn = page.getByRole('button', { name: /manage training/i }).first()
    let opened = false
    try {
      await manageBtn.waitFor({ state: 'visible', timeout: 3_000 })
      await manageBtn.click()
      opened = true
    } catch {
      skipped.push('Manage Trainings button not visible')
    }

    if (opened) {
      exercised.push('opened Manage Trainings modal')

      // The modal has an "Add Course" or similar. Try common labels.
      const addCourseBtn = page
        .getByRole('button', { name: /add\s+course|new\s+course|create\s+course|add\s+training/i })
        .first()
      if (await addCourseBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await addCourseBtn.click({ timeout: 1_500 }).catch(() => {})
        exercised.push('clicked Add Course')

        createdCourse = `W3_Course_${Date.now()}`
        // First text input in the form
        const nameInput = page.locator('input[type="text"]:visible').first()
        await nameInput.fill(createdCourse, { timeout: 2_000 }).catch(() => {})

        // Submit add-course
        const submit = page.getByRole('button', { name: /^add$|^create$|^save$|add course|save course/i }).last()
        if (await submit.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await submit.click({ timeout: 1_500 }).catch(() => {})
          await page.waitForTimeout(700)

          const found = await page.getByText(createdCourse).first().isVisible({ timeout: 2_000 }).catch(() => false)
          exercised.push(`courseVisible=${found}`)
          if (!found) await safeScreenshot(page, `${slug}-course-not-visible`)
        } else {
          skipped.push('Add-course submit button not found')
          await safeScreenshot(page, `${slug}-no-submit`)
        }
      } else {
        // Dump available buttons inside modal for the supervisor
        const buttons = await page.locator('button:visible').allTextContents()
        skipped.push(`Add-course button not found — visible: ${JSON.stringify(buttons.slice(0, 20))}`)
        await safeScreenshot(page, `${slug}-no-add-course`)
      }
    }

    // Assignment flow — best effort, only if "Assign" is visible somewhere
    const assignBtn = page.getByRole('button', { name: /assign(\s+training)?/i }).first()
    if (await assignBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await assignBtn.click({ timeout: 1_500 }).catch(() => {})
      exercised.push('opened assign modal')
      // Close — we don't have a real employee bucket and don't want to mutate state
      const cancel = page.getByRole('button', { name: /cancel|close/i }).last()
      await cancel.click({ timeout: 1_000 }).catch(() => {})
    } else {
      skipped.push('no Assign Training entry point reachable from current view')
    }
  } catch (err) {
    await safeScreenshot(page, `${slug}-throw`)
    consoleErrors.push(`test-throw: ${(err as Error).message}`)
  }

  // Note: training course state is zustand-local; no remote DELETE call available
  // from the modal in test scope. Logged as a cleanup gap.
  skipped.push('cleanup: created course persists in zustand store until reload')

  dumpFindings(slug, consoleErrors, httpErrors, { exercised, skipped, createdCourse })
})

// ─────────────────────────────────────────────────────────────────────────────
// "Charter-stated but absent" routes — explicit 404 walk so the supervisor sees
// the route map clearly.
// ─────────────────────────────────────────────────────────────────────────────

test('walk charter-stated absent routes (/policies, /training, /policies/templates)', async ({ page }) => {
  test.setTimeout(60_000)
  const slug = 'absent-routes'
  const { consoleErrors, httpErrors } = installSpies(page)
  const probed: Record<string, { status: number | null; finalUrl: string }> = {}

  try {
    await robustSignIn(page)
  } catch (e) {
    await safeScreenshot(page, `${slug}-signin-throw`)
    consoleErrors.push(`signin-throw: ${(e as Error).message}`)
    dumpFindings(slug, consoleErrors, httpErrors, { probed: {} })
    return
  }
  for (const r of ['/policies', '/policies/new', '/policies/templates', '/training']) {
    try {
      const resp = await page.goto(r, { waitUntil: 'domcontentloaded', timeout: 8_000 })
      probed[r] = { status: resp?.status() ?? null, finalUrl: page.url() }
    } catch (e) {
      probed[r] = { status: null, finalUrl: `error: ${(e as Error).message}` }
    }
  }
  dumpFindings(slug, consoleErrors, httpErrors, { probed })
})
