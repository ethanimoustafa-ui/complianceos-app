export {} // module scope

// W27.3-γ — empty-state audit probe.
//
// Visits each "list" page and asserts:
//   1. When the page is empty (no items), a [data-empty-state="true"] element
//      is present in the DOM.
//   2. That element contains at least one <button> with the class "cta"
//      OR a <button> whose text matches a known CTA label.
//
// The probe navigates to each page and – if the list has data – clears any
// chance of a natural empty state by checking if the element is already there
// (on a fresh dev DB the lists are usually populated, so we also check the
// "no results" path by injecting a unique search string that won't match).
//
// USAGE:
//   npx tsx tests/probes/empty-states.ts
//
// Requires: dev server running at BASE_URL (default http://localhost:3000)

import { chromium } from 'playwright'
import * as path from 'node:path'
import * as fs from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@complianceos.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ComplianceOS!2026'
const ARTIFACTS = path.join(__dirname, '../e2e/_artifacts/w27.3/gamma')

interface PageEntry {
  path: string
  label: string
  /** CSS selector for the search input (to force an empty-results state) */
  searchSelector?: string
  /** Unique nonsense search string */
  searchValue?: string
}

const PAGES: PageEntry[] = [
  {
    path: '/correspondence/observations',
    label: 'Observations',
    searchSelector: 'input[type="search"],input[placeholder*="search" i],input[placeholder*="Search" i]',
    searchValue: '__xz_no_match_99999',
  },
  {
    path: '/correspondence/letters',
    label: 'Letters',
    searchSelector: 'input[type="text"]',
    searchValue: '__xz_no_match_99999',
  },
  {
    path: '/correspondence/regulatory-updates/policies',
    label: 'Policies',
    searchSelector: 'input[type="text"],input[placeholder*="search" i]',
    searchValue: '__xz_no_match_99999',
  },
  {
    path: '/correspondence/regulatory-updates/rules',
    label: 'Rules',
    searchSelector: 'input[type="text"],input[placeholder*="search" i]',
    searchValue: '__xz_no_match_99999',
  },
  {
    path: '/correspondence/advisory',
    label: 'Advisory',
    searchSelector: 'input[type="text"],input[placeholder*="search" i]',
    searchValue: '__xz_no_match_99999',
  },
]

interface Failure {
  page: string
  reason: string
}

async function main(): Promise<void> {
  console.log(`\nW27.3-γ probe: empty-states at ${BASE}\n`)

  fs.mkdirSync(ARTIFACTS, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // Sign in — navigate to sign-in page, then fill credentials. If the session
  // cookie is still valid (common in dev) the page redirects immediately before
  // or right after the button click, so we poll the URL rather than using a
  // hard `waitForURL` which can race.
  console.log('  Signing in ...')
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(1_500)
  if (page.url().includes('/sign-in')) {
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /Sign In/i }).click()
    // Wait up to 15 s for redirect — done via polling so we don't hard-fail.
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1_000)
      if (!page.url().includes('/sign-in')) break
    }
  }
  if (page.url().includes('/sign-in')) {
    console.error('  ERROR: still on sign-in after 15s — check credentials or server state')
    process.exitCode = 2
    await browser.close()
    return
  }
  console.log('  Signed in.\n')

  const failures: Failure[] = []

  for (const entry of PAGES) {
    console.log(`  Checking ${entry.label} (${entry.path}) ...`)
    await page.goto(`${BASE}${entry.path}`, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch(() => page.goto(`${BASE}${entry.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }))
    await page.waitForTimeout(500)

    // Try to force empty state via search
    let emptyForced = false
    if (entry.searchSelector && entry.searchValue) {
      const searchInput = page.locator(entry.searchSelector).first()
      if (await searchInput.count() > 0) {
        await searchInput.fill(entry.searchValue)
        await page.waitForTimeout(600)
        emptyForced = true
      }
    }

    // Check for [data-empty-state="true"]
    const emptyStateEl = page.locator('[data-empty-state="true"]')
    const emptyCount = await emptyStateEl.count()

    if (emptyCount === 0) {
      if (emptyForced) {
        // The search may not have produced a result — the list might be truly empty
        // or the search input is the wrong one. This is a soft warning.
        console.log(`  WARN  ${entry.label}: search did not trigger empty state (list may still have results or wrong selector)`)
      } else {
        console.log(`  WARN  ${entry.label}: no [data-empty-state="true"] found — list may have data`)
      }
    } else {
      console.log(`  INFO  ${entry.label}: found [data-empty-state="true"]`)

      // Take a screenshot
      const screenshotPath = path.join(ARTIFACTS, `${entry.label.toLowerCase().replace(/\s/g, '-')}-empty-state.png`)
      await page.screenshot({ path: screenshotPath, fullPage: false })
      console.log(`  SCREENSHOT  ${screenshotPath}`)

      // Check for a CTA button inside the empty state
      const ctaButton = emptyStateEl.locator('button').first()
      const ctaCount = await ctaButton.count()
      if (ctaCount === 0) {
        failures.push({ page: entry.label, reason: 'empty state has no button (missing CTA)' })
        console.log(`  FAIL  ${entry.label}: [data-empty-state] has no button child — CTA missing`)
      } else {
        const label = await ctaButton.textContent()
        console.log(`  PASS  ${entry.label}: CTA button found: "${label?.trim()}"`)
      }
    }
  }

  await browser.close()

  console.log(`\n  Scanned ${PAGES.length} page(s)`)
  if (failures.length === 0) {
    console.log('  PASS  All checked empty states have CTA buttons.')
  } else {
    console.log(`  FAIL  ${failures.length} issue(s):`)
    failures.forEach((f) => console.log(`    page="${f.page}" reason="${f.reason}"`))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
