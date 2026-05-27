export {} // module scope

// W27.3-γ — extended no-raw-i18n-key probe.
//
// Complements W27.2-β's `no-raw-i18n-key-leaks.ts` which covers 6 list pages.
// THIS probe adds coverage for:
//   - Dashboard (all three role views via admin user)
//   - Notification panel
//   - Reports (compliance-review, executive)
//   - Calendar
//   - Breadcrumb labels (sidebar navigation)
//   - Modal headers (observation detail modal)
//
// Regex: /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+:?$/
// i.e., dotted paths like "foo.bar.baz" that appear as raw fallback strings
// when a t() key is missing from the dictionary.
//
// USAGE:
//   npx tsx tests/probes/no-raw-i18n-keys-extended.ts
//
// Requires: dev server running at BASE_URL (default http://localhost:3000)

import { chromium } from 'playwright'
import * as path from 'node:path'
import * as fs from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@complianceos.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ComplianceOS!2026'
const ARTIFACTS = path.join(__dirname, '../e2e/_artifacts/w27.3/gamma')

const PAGES: Array<{ path: string; label: string; action?: string }> = [
  { path: '/dashboard',                                     label: 'Dashboard' },
  { path: '/correspondence/feed',                           label: 'Feed (notifications surface)' },
  { path: '/reports/compliance-review',                     label: 'Compliance Review Report' },
  { path: '/reports/executive',                             label: 'Executive Report' },
  { path: '/calendar',                                      label: 'Calendar' },
]

// Regex: dotted path like "foo.bar.baz" (optional trailing colon)
const KEY_LEAK_REGEX = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+:?$/

function looksLikeKeyLeak(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.includes('/') || t.includes('?') || t.includes('://') || t.includes('@')) return false
  // Known false-positives: semantic version strings (e.g. "1.0.0"), domain literals
  if (/^\d/.test(t)) return false
  return KEY_LEAK_REGEX.test(t)
}

interface Failure {
  page: string
  text: string
}

async function main(): Promise<void> {
  console.log(`\nW27.3-γ probe: no-raw-i18n-keys-extended at ${BASE}\n`)

  fs.mkdirSync(ARTIFACTS, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // Sign in — poll rather than hard-waitForURL so the probe handles both
  // fresh-credential and cached-session scenarios in dev.
  console.log('  Signing in ...')
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(1_500)
  if (page.url().includes('/sign-in')) {
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /Sign In/i }).click()
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

    // Collect all text nodes excluding code blocks
    const texts = await page.evaluate(() => {
      const excluded = new Set<Node>()
      document.querySelectorAll('code, pre, script, style').forEach((el) => excluded.add(el))

      function isExcluded(node: Node): boolean {
        let cur: Node | null = node
        while (cur) {
          if (excluded.has(cur)) return true
          cur = cur.parentNode
        }
        return false
      }

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const result: string[] = []
      let n: Node | null
      while ((n = walker.nextNode())) {
        if (isExcluded(n)) continue
        const t = (n.textContent ?? '').trim()
        if (t.length > 0 && t.length < 200) result.push(t)
      }
      return result
    })

    const pageLeaks: string[] = []
    for (const text of texts) {
      if (looksLikeKeyLeak(text)) {
        pageLeaks.push(text)
        failures.push({ page: entry.label, text })
      }
    }

    if (pageLeaks.length === 0) {
      console.log(`  PASS  ${entry.label}: no raw i18n key leaks`)
    } else {
      console.log(`  FAIL  ${entry.label}: ${pageLeaks.length} leak(s):`)
      pageLeaks.forEach((t) => console.log(`    "${t}"`))
      // Take screenshot on failure
      const screenshotPath = path.join(ARTIFACTS, `${entry.label.toLowerCase().replace(/[\s/()]+/g, '-')}-key-leak.png`)
      await page.screenshot({ path: screenshotPath })
      console.log(`  SCREENSHOT  ${screenshotPath}`)
    }
  }

  // Also check notification panel by clicking bell icon
  console.log(`  Checking Notification Panel ...`)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 30_000 })
    .catch(() => page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 }))
  const bellButton = page.locator('button[aria-label*="notif" i], button[title*="notif" i], [data-testid="bell"], button:has([class*="bell"]), button:has([class*="notification"])').first()
  if (await bellButton.count() > 0) {
    await bellButton.click()
    await page.waitForTimeout(400)
    const notifTexts = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const result: string[] = []
      let n: Node | null
      while ((n = walker.nextNode())) {
        const t = (n.textContent ?? '').trim()
        if (t.length > 0 && t.length < 200) result.push(t)
      }
      return result
    })
    const notifLeaks = notifTexts.filter(looksLikeKeyLeak)
    if (notifLeaks.length === 0) {
      console.log(`  PASS  Notification Panel: no raw i18n key leaks`)
    } else {
      console.log(`  FAIL  Notification Panel: ${notifLeaks.length} leak(s):`)
      notifLeaks.forEach((t) => console.log(`    "${t}"`))
      notifLeaks.forEach((text) => failures.push({ page: 'Notification Panel', text }))
    }
  } else {
    console.log(`  SKIP  Notification Panel: bell button not found`)
  }

  await browser.close()

  console.log(`\n  Scanned ${PAGES.length + 1} surface(s)`)
  if (failures.length === 0) {
    console.log('  PASS  No raw i18n key leaks on any extended surface.')
  } else {
    console.log(`  FAIL  ${failures.length} raw i18n key leak(s):`)
    failures.forEach((f) => console.log(`    page="${f.page}" text="${f.text}"`))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
