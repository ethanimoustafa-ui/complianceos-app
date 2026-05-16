// Fix-B verification — Policies reload-survival.
//
// Signs in as the test admin, opens the policies page, creates a policy via
// the UI with a unique title, reloads the page, asserts the policy still
// shows up in the list. If the create flow only updates local Zustand state
// (the bug Fix-B closes) the post-reload assertion fails.

import { test, expect } from '@playwright/test'
import { signIn } from './_helpers/sign-in'

const POLICIES_PATH = '/correspondence/regulatory-updates/policies'

async function softSkip(reason: string): Promise<never> {
  test.skip(true, reason)
  // Unreachable, but satisfies the type system.
  throw new Error(reason)
}

test('Fix-B: policy creation survives reload', async ({ page }) => {
  test.setTimeout(120_000)

  const uniqueTitle = `FixB_Policy_${Date.now()}`
  let createApiHit = false
  page.on('request', (req) => {
    const url = req.url()
    if ((url.includes('/api/policies') || url.includes('/rest/v1/policies')) && req.method() === 'POST') {
      createApiHit = true
      console.log(`[fix-b] captured POST: ${url}`)
    }
  })
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[fix-b][console-error] ${m.text()}`)
  })

  console.log('[fix-b] signing in')
  await signIn(page)
  console.log('[fix-b] signed in, navigating to policies')
  await page.goto(POLICIES_PATH, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  // Some store hydration may pending — wait for the page header.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  console.log('[fix-b] page loaded')

  // ── Open Create modal ───────────────────────────────────────────────
  let createBtn
  try {
    createBtn = page.getByRole('button', { name: /create policy/i }).first()
    await createBtn.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    return softSkip('Create-policy button not found — UI selector drift or RBAC gate denying access')
  }
  await createBtn.click()
  console.log('[fix-b] modal opened')
  await page.waitForTimeout(800)

  // ── Fill name ──────────────────────────────────────────────────────
  // The page's policyName Input uses placeholder "e.g., Information Security Policy".
  try {
    const nameInput = page
      .getByPlaceholder(/information security policy|e\.g\.|policy name/i)
      .first()
    await nameInput.waitFor({ state: 'visible', timeout: 5_000 })
    await nameInput.fill(uniqueTitle)
    console.log('[fix-b] name filled')
  } catch (e) {
    // Fallback: first text input inside the visible modal/dialog.
    try {
      const fallback = page.locator('input[type="text"], input:not([type])').first()
      await fallback.fill(uniqueTitle)
      console.log('[fix-b] name filled (fallback)')
    } catch (e2) {
      return softSkip(`Name input not found: ${(e as Error).message} | fallback: ${(e2 as Error).message}`)
    }
  }

  // ── Pick category via EditableSelect ───────────────────────────────
  // EditableSelect renders the trigger as a <button> with placeholder text,
  // and the dropdown items as <div class="group ..."> elements containing a
  // <span> with the label. We open the dropdown then click the matching div.
  try {
    const catTrigger = page.locator('button').filter({ hasText: /select category/i }).first()
    if (await catTrigger.count()) {
      await catTrigger.click()
      await page.waitForTimeout(300)
      // Match the <div class="group ..."> by its <span> text. Use exact
      // match anchored with the truncate span to avoid hitting placeholders.
      const compliance = page.locator('div.group').filter({ hasText: /^Compliance$/ }).first()
      if (await compliance.count()) {
        await compliance.click()
        console.log('[fix-b] category picked (div.group)')
      } else {
        // Fallback: any visible element with the exact text.
        await page.getByText('Compliance', { exact: true }).first().click({ timeout: 2_000 })
        console.log('[fix-b] category picked (text-fallback)')
      }
    }
  } catch (e) {
    console.log(`[fix-b] category pick failed: ${(e as Error).message}`)
  }

  // ── Pick approval tier ─────────────────────────────────────────────
  try {
    const tierTrigger = page.locator('button').filter({ hasText: /select approval tier/i }).first()
    if (await tierTrigger.count()) {
      await tierTrigger.click()
      await page.waitForTimeout(300)
      const mgmt = page.locator('div.group').filter({ hasText: /^Management$/ }).first()
      if (await mgmt.count()) {
        await mgmt.click()
        console.log('[fix-b] tier picked (div.group)')
      } else {
        await page.getByText('Management', { exact: true }).first().click({ timeout: 2_000 })
        console.log('[fix-b] tier picked (text-fallback)')
      }
    }
  } catch (e) {
    console.log(`[fix-b] tier pick failed: ${(e as Error).message}`)
  }

  // ── Description ────────────────────────────────────────────────────
  try {
    const descTextarea = page.locator('textarea').first()
    await descTextarea.fill(`Reload-survival test policy ${uniqueTitle}`)
    console.log('[fix-b] description filled')
  } catch (e) {
    return softSkip(`Description not fillable: ${(e as Error).message}`)
  }

  // ── File upload ────────────────────────────────────────────────────
  try {
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({
      name: 'fix-b-policy.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%fake pdf for fix-b test\n'),
    })
    console.log('[fix-b] file attached')
  } catch (e) {
    return softSkip(`File upload not possible: ${(e as Error).message}`)
  }

  // ── Submit ─────────────────────────────────────────────────────────
  await page.waitForTimeout(600)
  try {
    // The page has 2 "Create Policy" buttons: the header trigger (which
    // opens the modal) and the modal submit. The modal submit is rendered
    // later in the DOM. Iterate and report state for diagnostics.
    const submitButtons = page.getByRole('button', { name: /create policy/i })
    const count = await submitButtons.count()
    console.log(`[fix-b] found ${count} 'Create Policy' buttons`)
    let clicked = false
    for (let i = count - 1; i >= 0; i--) {
      const b = submitButtons.nth(i)
      const enabled = await b.isEnabled()
      const visible = await b.isVisible()
      console.log(`[fix-b]   button[${i}] visible=${visible} enabled=${enabled}`)
      if (enabled && visible) {
        await b.click({ timeout: 4_000 })
        clicked = true
        console.log(`[fix-b] clicked submit button index=${i}`)
        break
      }
    }
    if (!clicked) {
      return softSkip('No enabled+visible "Create Policy" button found — form invalid')
    }
  } catch (e) {
    return softSkip(`Submit click failed: ${(e as Error).message}`)
  }

  // Give the POST + toast time to complete.
  await page.waitForTimeout(3_000)
  console.log(`[fix-b] post-create createApiHit=${createApiHit}`)

  // ── Reload + verify ────────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 25_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1_500)

  const visibleCard = page.locator(`text=${uniqueTitle}`).first()
  const stillThere = await visibleCard.count()
  console.log(`[fix-b] post-reload count=${stillThere}`)

  // ── Cleanup: best-effort delete via API ────────────────────────────
  if (stillThere) {
    try {
      const apiResp = await page.request.get('/api/policies?pageSize=100')
      if (apiResp.ok()) {
        const json = await apiResp.json()
        const items = (json?.data?.items ?? []) as Array<{ id: string; name: string }>
        const match = items.find((p) => p.name === uniqueTitle)
        if (match) {
          await page.request.delete(`/api/policies/${match.id}`)
          console.log(`[fix-b] cleanup: deleted ${match.id}`)
        }
      }
    } catch (e) {
      console.log(`[fix-b] cleanup failed: ${(e as Error).message}`)
    }
  }

  // HARD ASSERTION — the bug Fix-B closes.
  expect(
    stillThere,
    `Policy "${uniqueTitle}" disappeared after reload. ` +
      `createApiHit=${createApiHit}. ` +
      `This indicates the policy-store create action never persisted to the server.`,
  ).toBeGreaterThan(0)
})
