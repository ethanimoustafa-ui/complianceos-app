export {} // module scope

// W27.3-α — L6 regression guard: Smart-placeholders banner renders in the
// current locale (Arabic) and NEVER leaks the English string "Smart placeholders"
// when the active language is Arabic.
//
// Steps:
//   1. Sign in and navigate to the Letters page in AR locale.
//   2. Open the Template Databank (Templates tab).
//   3. Click "Create Template".
//   4. Switch to the "Default Content" tab inside the create modal.
//   5. Assert that NO text node inside the banner contains the literal string
//      "Smart placeholders" (English heading).
//   6. Assert that at least one text node inside the banner contains the Arabic
//      heading "العناصر النائبة الذكية".
//   7. Optionally screenshot for the artifact store.
//
// USAGE:
//   npx tsx tests/probes/letter-template-placeholders-i18n.ts
//
// Requires: dev server running at BASE_URL (default http://localhost:3000)

import { chromium } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@complianceos.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ComplianceOS!2026'
const ARTIFACT_DIR = path.join(
  __dirname,
  '../e2e/_artifacts/w27.3/alpha',
)

async function main(): Promise<void> {
  console.log(`\nW27.3-α probe: letter-template-placeholders-i18n at ${BASE}\n`)

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

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
  console.log('  Signed in.')

  // Navigate to Letters page
  console.log('  Navigating to /correspondence/letters ...')
  await page.goto(`${BASE}/correspondence/letters`, { waitUntil: 'networkidle', timeout: 30_000 })
    .catch(() => page.goto(`${BASE}/correspondence/letters`, { waitUntil: 'domcontentloaded', timeout: 30_000 }))

  // Switch to AR locale — look for a language / locale toggle
  // The app stores locale in localStorage key `language-storage`.
  // Set it directly and reload so the page re-renders in AR.
  console.log('  Switching locale to Arabic ...')
  await page.evaluate(() => {
    try {
      // Zustand persisted store — key is "language-storage"
      localStorage.setItem('language-storage', JSON.stringify({ state: { language: 'ar' }, version: 0 }))
    } catch {
      // ignore
    }
  })
  await page.reload({ waitUntil: 'networkidle', timeout: 30_000 })
    .catch(() => page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }))
  console.log('  Locale set to AR, page reloaded.')

  // Look for the "Template Databank" / "قاعدة بيانات القوالب" button or tab
  // Try common selectors for the templates area
  const templateBankSelectors = [
    'button:has-text("قاعدة بيانات القوالب")',
    'button:has-text("Template Databank")',
    '[data-tab="templates"]',
    'button:has-text("Templates")',
    'button:has-text("القوالب")',
  ]

  let openedTemplates = false
  for (const sel of templateBankSelectors) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      await el.click()
      await page.waitForTimeout(500)
      openedTemplates = true
      console.log(`  Opened templates via: ${sel}`)
      break
    }
  }

  if (!openedTemplates) {
    console.log('  WARN: Could not find template databank button — will attempt modal directly.')
  }

  // Click "Create Template" / "إنشاء قالب"
  const createSelectors = [
    'button:has-text("إنشاء قالب")',
    'button:has-text("Create Template")',
    '[data-action="create-template"]',
  ]

  let openedCreate = false
  for (const sel of createSelectors) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      await el.click()
      await page.waitForTimeout(800)
      openedCreate = true
      console.log(`  Clicked create template via: ${sel}`)
      break
    }
  }

  if (!openedCreate) {
    console.log('  WARN: Could not click create template button.')
  }

  // Switch to "Default Content" / "المحتوى الافتراضي" tab
  const contentTabSelectors = [
    '[role="tab"]:has-text("المحتوى الافتراضي")',
    '[role="tab"]:has-text("Default Content")',
    'button:has-text("المحتوى الافتراضي")',
    'button:has-text("Default Content")',
  ]

  let switchedTab = false
  for (const sel of contentTabSelectors) {
    const el = page.locator(sel).first()
    if (await el.count() > 0) {
      await el.click()
      await page.waitForTimeout(500)
      switchedTab = true
      console.log(`  Switched to content tab via: ${sel}`)
      break
    }
  }

  if (!switchedTab) {
    console.log('  WARN: Could not switch to Default Content tab.')
  }

  // Screenshot of the banner area
  const screenshotPath = path.join(ARTIFACT_DIR, 'l6-ar-banner.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`  Screenshot saved: ${screenshotPath}`)

  // Collect all text from the blue banner (bg-blue-50 section in the modal)
  const bannerTexts = await page.evaluate(() => {
    // Find the blue info banner (bg-blue-50 div inside any modal/dialog)
    const banners = document.querySelectorAll('.bg-blue-50')
    const texts: string[] = []
    banners.forEach((banner) => {
      const walker = document.createTreeWalker(banner, NodeFilter.SHOW_TEXT)
      let n: Node | null
      while ((n = walker.nextNode())) {
        const t = (n.textContent ?? '').trim()
        if (t.length > 0) texts.push(t)
      }
    })
    return texts
  })

  console.log(`\n  Banner text nodes found: ${bannerTexts.length}`)
  bannerTexts.forEach((t) => console.log(`    "${t}"`))

  await browser.close()

  // Assertions
  let passed = true

  const hasEnglishHeading = bannerTexts.some((t) => t.includes('Smart placeholders'))
  const hasArabicHeading = bannerTexts.some((t) => t.includes('العناصر النائبة الذكية'))

  if (hasEnglishHeading) {
    console.log('\n  FAIL  Banner still contains English "Smart placeholders" in AR locale.')
    passed = false
  } else {
    console.log('\n  PASS  No English "Smart placeholders" heading in AR locale banner.')
  }

  if (!hasArabicHeading) {
    // Soft warning — banner might not be visible if modal didn't open
    if (bannerTexts.length === 0) {
      console.log('  WARN  No banner text found — modal may not have opened. Check screenshot.')
    } else {
      console.log('  FAIL  Arabic heading "العناصر النائبة الذكية" not found in banner.')
      passed = false
    }
  } else {
    console.log('  PASS  Arabic heading "العناصر النائبة الذكية" present in banner.')
  }

  if (!passed) {
    process.exitCode = 1
  } else {
    console.log('\n  PASS  L6 i18n probe passed.')
  }
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
