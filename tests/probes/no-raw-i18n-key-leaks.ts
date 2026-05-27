export {} // module scope

// W27.2-β — R2 regression guard: no raw i18n key leaks on list pages.
//
// Asserts that NO visible text on ANY list page (letters, observations,
// policies, rules, feed, advisory) contains a substring matching the
// i18n-key dotted-path pattern:
//
//   /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+:?$/
//
// Such strings are produced when a `t('some.key')` call fails to resolve
// (key missing from dictionary) and the fallback path-string is rendered.
//
// Implementation: uses Playwright chromium to navigate each list, collect
// all text in chip/badge/header/cell elements, and run the regex.
//
// Exclusions:
//   - Strings containing '/' (file paths, URLs)
//   - Strings containing '?' or '//' (query params, protocol URLs)
//   - Strings from <code> or <pre> elements (code blocks)
//   - Strings that are single-segment (no dot) — not an i18n path
//
// USAGE:
//   npx tsx tests/probes/no-raw-i18n-key-leaks.ts
//
// Requires: dev server running at BASE_URL (default http://localhost:3000)

import { chromium } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@complianceos.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ComplianceOS!2026'

// Pages to sweep.  Each entry: [path, page-label, optional-action-to-reveal-chips]
const PAGES: Array<{ path: string; label: string; triggerSort?: boolean }> = [
  { path: '/correspondence/letters',                            label: 'Letters',      triggerSort: true },
  { path: '/correspondence/observations',                       label: 'Observations', triggerSort: true },
  { path: '/correspondence/regulatory-updates/policies',        label: 'Policies',     triggerSort: true },
  { path: '/correspondence/regulatory-updates/rules',           label: 'Rules',        triggerSort: true },
  { path: '/correspondence/feed',                               label: 'Feed' },
  { path: '/correspondence/advisory',                           label: 'Advisory' },
]

// Regex: dotted path like "foo.bar.baz" or "foo.bar.baz:" (optional trailing colon)
const KEY_LEAK_REGEX = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+:?$/

function looksLikeKeyLeak(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.includes('/') || t.includes('?') || t.includes('://')) return false
  return KEY_LEAK_REGEX.test(t)
}

interface Failure {
  page: string
  element: string
  text: string
}

async function main(): Promise<void> {
  console.log(`\nW27.2-β probe: no-raw-i18n-key-leaks at ${BASE}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Sign in
  console.log('  Signing in ...')
  await page.goto(`${BASE}/sign-in`)
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 })
  console.log('  Signed in.\n')

  const failures: Failure[] = []

  for (const entry of PAGES) {
    console.log(`  Checking ${entry.label} (${entry.path}) ...`)
    await page.goto(`${BASE}${entry.path}`, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch(() => page.goto(`${BASE}${entry.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }))

    // If the page has a table with sortable columns, click a column header to
    // trigger the sort chip so we can verify it doesn't leak a raw key.
    if (entry.triggerSort) {
      const firstSortHeader = page.locator('thead th').first()
      if (await firstSortHeader.count() > 0) {
        await firstSortHeader.click().catch(() => {})
        await page.waitForTimeout(300)
      }
    }

    // Collect text from all visible text-bearing elements except code blocks.
    // We target the whole body but exclude <code> and <pre> content.
    const texts = await page.evaluate(() => {
      const excluded = new Set<Node>()
      document.querySelectorAll('code, pre').forEach((el) => excluded.add(el))

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

    for (const text of texts) {
      if (looksLikeKeyLeak(text)) {
        const msg = `  FAIL  ${entry.label}: raw i18n key visible: "${text}"`
        console.log(msg)
        failures.push({ page: entry.label, element: entry.path, text })
      }
    }
  }

  await browser.close()

  console.log(`\n  Scanned ${PAGES.length} page(s)`)

  if (failures.length === 0) {
    console.log('  PASS  No raw i18n key leaks found on any list page.')
  } else {
    console.log(`  FAIL  ${failures.length} raw i18n key leak(s) found:`)
    failures.forEach((f) => console.log(`    page="${f.page}" text="${f.text}"`))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
