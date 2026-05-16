// Wave2-B verification — seeded list rendering.
//
// The seed agent inserted realistic rows into policies (3), audits (3),
// circulars (0 — seed gap), and advisory_requests (1). Several list pages
// were rendering empty even when rows existed. This spec navigates each
// list page as the test admin and asserts the rows are visible.
//
// Resources covered:
//   - /correspondence/regulatory-updates/policies   → 3 policies expected
//   - /reports/audits                               → 3 audits expected
//   - /correspondence/regulatory-updates/rules      → 0 expected (seed gap)
//   - /correspondence/advisory                      → ≥1 expected
//
// The audits assertion exercises the store-mapper fix that normalizes
// free-form `category` values (`it-security-audit`, `regulatory-audit`,
// `sharia-audit`) to the canonical filter vocabulary; without it the page's
// default category filter set silently drops every seeded row.

import { test, expect } from '@playwright/test'
import { signIn } from './_helpers/sign-in'

test.describe('Wave2-B: seeded list rendering', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test('policies list renders all seeded policies', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/correspondence/regulatory-updates/policies', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2_500)

    // Read raw <main> text so we tolerate the card-internal markup shape.
    const mainText = (await page.locator('main').innerText().catch(() => '')) ?? ''
    expect(mainText, 'POL-INFOSEC-001 should be visible').toContain('POL-INFOSEC-001')
    expect(mainText, 'POL-AML-001 should be visible').toContain('POL-AML-001')
    expect(mainText, 'POL-DATA-001 should be visible').toContain('POL-DATA-001')
  })

  test('audits list renders all seeded audits (category-normalization fix)', async ({ page }) => {
    test.setTimeout(90_000)

    // First confirm the API returns the rows for this auth session — separates
    // a store-read regression from a Route Handler regression.
    const apiResp = await page.request.get('/api/audits?page=1&pageSize=100')
    expect(apiResp.ok(), 'GET /api/audits should respond 2xx').toBe(true)
    const apiJson = await apiResp.json()
    const apiCount = apiJson?.data?.items?.length ?? 0
    expect(apiCount, 'API should return seeded audit rows').toBeGreaterThanOrEqual(3)

    await page.goto('/reports/audits', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})

    // Audit list mounts hidden behind a per-row map; poll for one of the seeded
    // titles to appear (covers slow first-fetch on cold dev-server transforms).
    await page
      .locator('main')
      .filter({ hasText: 'Annual SAMA Compliance Audit 2026' })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })

    const mainText = (await page.locator('main').innerText().catch(() => '')) ?? ''
    expect(mainText, 'SAMA audit row should be visible').toContain('Annual SAMA Compliance Audit 2026')
    expect(mainText, 'IT Security audit row should be visible').toContain('Q1 2026 IT Security Audit')
    expect(mainText, 'Sharia audit row should be visible').toContain('Sharia Compliance Audit')
  })

  test('circulars list — seed gap is captured (0 rows confirmed)', async ({ page }) => {
    // The seed agent didn't insert any rows into `circulars`. This test
    // asserts the API returns 0 items so the empty UI state is genuine
    // (not a Route Handler / RLS regression). If a follow-up phase seeds
    // circulars this assertion will need to be relaxed.
    const resp = await page.request.get('/api/circulars?page=1&pageSize=100')
    expect(resp.ok()).toBe(true)
    const json = await resp.json()
    const total = json?.data?.total ?? 0
    expect(total, 'circulars table is empty — seed gap, not a read-path bug').toBe(0)
  })

  test('advisory list renders the seeded advisory request', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/correspondence/advisory', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1_500)

    const adv = await page.locator('text=ADV-0001').count()
    expect(adv, 'ADV-0001 should be visible').toBeGreaterThan(0)
  })
})
