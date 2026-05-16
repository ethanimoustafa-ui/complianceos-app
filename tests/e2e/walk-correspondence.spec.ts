/**
 * W1 walk — Correspondence + Regulatory Updates.
 *
 * Discovery-driven probe of every page found under
 * `src/app/(dashboard)/correspondence/**`. For each route:
 *   1. Sign in (helper)
 *   2. goto with `networkidle` (8s soft timeout — first-compile pages are slow)
 *   3. Capture console errors, all non-2xx responses (with 300-char body excerpt),
 *      and visible "Error" text on page
 *   4. Exercise the primary user story (e.g. open "New Letter"), capturing any
 *      thrown exceptions or 4xx/5xx triggered
 *   5. On failure: screenshot to tests/e2e/_artifacts/W1-<slug>-<ts>.png
 *
 * Charter: WALK + REPORT only. Never fix. Each route is its own test() so the
 * suite continues past per-page failures.
 */
import { test, type Page } from '@playwright/test'
import { signIn } from './_helpers/sign-in'
import fs from 'node:fs'
import path from 'node:path'

type HttpHit = { status: number; url: string; body?: string }
type PageRun = {
  route: string
  consoleErrors: string[]
  pageErrors: string[]
  httpErrors: HttpHit[]
  visibleErrors: string[]
  storyOutcome: string
  screenshot?: string
}

const ARTIFACTS_DIR = path.join(process.cwd(), 'tests', 'e2e', '_artifacts')
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })

const ROUTES: { path: string; story?: 'letters' | 'list-click' | 'none' }[] = [
  { path: '/correspondence', story: 'none' },
  { path: '/correspondence/feed', story: 'none' },
  { path: '/correspondence/letters', story: 'letters' },
  { path: '/correspondence/advisory', story: 'list-click' },
  { path: '/correspondence/observations', story: 'list-click' },
  { path: '/correspondence/registry', story: 'list-click' },
  { path: '/correspondence/regulatory-updates', story: 'none' },
  { path: '/correspondence/regulatory-updates/policies', story: 'list-click' },
  { path: '/correspondence/regulatory-updates/rules', story: 'list-click' },
]

// Shared across tests so summary at end aggregates everything.
const allRuns: PageRun[] = []

function slugify(route: string): string {
  return route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'
}

function installListeners(page: Page, run: PageRun): void {
  page.on('console', (m) => {
    if (m.type() === 'error') run.consoleErrors.push(m.text().slice(0, 400))
  })
  page.on('pageerror', (err) => {
    run.pageErrors.push(`${err.name}: ${err.message}\n${(err.stack ?? '').slice(0, 500)}`)
  })
  page.on('response', async (r) => {
    const status = r.status()
    if (status >= 400) {
      let body: string | undefined
      try {
        body = (await r.text()).slice(0, 300)
      } catch {
        // ignore
      }
      run.httpErrors.push({ status, url: r.url(), body })
    }
  })
}

async function captureVisibleErrorText(page: Page): Promise<string[]> {
  try {
    const matches = await page
      .locator('text=/error|failed|something went wrong|getNextReference/i')
      .all()
    const out: string[] = []
    for (const loc of matches.slice(0, 5)) {
      try {
        const t = (await loc.innerText({ timeout: 500 })).trim()
        if (t && t.length < 300) out.push(t)
      } catch {
        // skip stale
      }
    }
    return out
  } catch {
    return []
  }
}

async function shotOnFail(page: Page, run: PageRun): Promise<void> {
  const failed =
    run.consoleErrors.length > 0 ||
    run.pageErrors.length > 0 ||
    run.httpErrors.some((h) => h.status >= 400) ||
    run.visibleErrors.length > 0
  if (!failed) return
  const fname = `W1-${slugify(run.route)}-${Date.now()}.png`
  const fpath = path.join(ARTIFACTS_DIR, fname)
  try {
    await page.screenshot({ path: fpath, fullPage: true })
    run.screenshot = fpath
  } catch (err) {
    run.screenshot = `screenshot-failed: ${(err as Error).message}`
  }
}

async function exerciseLettersStory(page: Page, run: PageRun): Promise<void> {
  // Story A: try to open "New Letter" / create modal
  try {
    const newBtn = page.getByRole('button', {
      name: /new letter|create letter|new sama|create$|^new$/i,
    })
    if ((await newBtn.count()) > 0) {
      await newBtn.first().click({ timeout: 3000 })
      await page.waitForTimeout(800)
      run.storyOutcome += '[opened New Letter] '
      // close via Escape
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(200)
    } else {
      // log all visible buttons for triage
      const names = await page
        .getByRole('button')
        .evaluateAll((els) =>
          (els as HTMLElement[]).map((e) => (e.textContent ?? '').trim()).filter((s) => s.length > 0 && s.length < 60),
        )
      run.storyOutcome += `[no "New Letter" button — saw: ${names.slice(0, 10).join(' | ')}] `
    }
  } catch (err) {
    run.storyOutcome += `[new-letter click failed: ${(err as Error).message.slice(0, 120)}] `
  }

  // Story B: click "Manage Templates" to enter template management view
  try {
    const manageBtn = page.getByRole('button', { name: /manage templates|templates/i })
    if ((await manageBtn.count()) > 0) {
      await manageBtn.first().click({ timeout: 3000 })
      await page.waitForTimeout(800)
      run.storyOutcome += '[opened Manage Templates] '
    }
  } catch (err) {
    run.storyOutcome += `[manage templates failed: ${(err as Error).message.slice(0, 120)}] `
  }

  // Story C: click the first TemplateCard tile (suspected getNextReference crash)
  try {
    const tile =
      (await page.locator('[data-testid="template-card"], button:has-text("Use template")').first().count())
        ? page.locator('[data-testid="template-card"], button:has-text("Use template")').first()
        : page.locator('button:has-text("Use")').first()
    if ((await tile.count()) > 0) {
      await tile.click({ timeout: 3000 })
      await page.waitForTimeout(1000)
      run.storyOutcome += '[clicked template tile] '
      await page.keyboard.press('Escape').catch(() => {})
    }
  } catch (err) {
    run.storyOutcome += `[template tile click failed: ${(err as Error).message.slice(0, 120)}] `
  }
}

async function exerciseListClickStory(page: Page, run: PageRun): Promise<void> {
  // Generic: click the first item in any data table / card list
  try {
    const candidates = [
      page.locator('table tbody tr').first(),
      page.locator('[role="row"]').nth(1),
      page.locator('[data-testid="list-item"]').first(),
    ]
    let clicked = false
    for (const cand of candidates) {
      if ((await cand.count()) > 0) {
        await cand.click({ timeout: 2500 }).catch(() => {})
        clicked = true
        run.storyOutcome += '[clicked first list row] '
        await page.waitForTimeout(600)
        break
      }
    }
    if (!clicked) {
      run.storyOutcome += '[empty state — skipping detail walk] '
    }
  } catch (err) {
    run.storyOutcome += `[list-click failed: ${(err as Error).message.slice(0, 120)}] `
  }
}

const STORAGE_STATE = path.join(ARTIFACTS_DIR, 'W1-storage-state.json')
let storageReady = false

test.describe.serial('W1 — correspondence walk', () => {
  test.beforeAll(async ({ browser }) => {
    // Sign in once for the whole walk and persist cookies + localStorage so
    // each route test reuses the session. This avoids the 30+s sign-in cost
    // per test that we saw on the first pass.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await signIn(page, { timeout: 60_000 })
      await ctx.storageState({ path: STORAGE_STATE })
      storageReady = true
    } catch (err) {
      console.log(`[W1] beforeAll signIn failed: ${(err as Error).message.slice(0, 200)}`)
      // Try to save state anyway — some auth tokens may have landed
      try {
        await ctx.storageState({ path: STORAGE_STATE })
        storageReady = true
      } catch {
        // give up
      }
    } finally {
      await page.close().catch(() => {})
      await ctx.close().catch(() => {})
    }
  })

  for (const r of ROUTES) {
    test(`walk ${r.path}`, async ({ browser }) => {
      const ctx = storageReady
        ? await browser.newContext({ storageState: STORAGE_STATE })
        : await browser.newContext()
      const page = await ctx.newPage()
      const run: PageRun = {
        route: r.path,
        consoleErrors: [],
        pageErrors: [],
        httpErrors: [],
        visibleErrors: [],
        storyOutcome: '',
      }
      installListeners(page, run)

      try {
        await page.goto(r.path, { waitUntil: 'networkidle', timeout: 30_000 }).catch(async () => {
          // fall back to domcontentloaded if networkidle times out
          await page.goto(r.path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        })
        await page.waitForTimeout(800)
      } catch (err) {
        run.storyOutcome += `[NAV FAILED: ${(err as Error).message.slice(0, 120)}] `
      }

      run.visibleErrors = await captureVisibleErrorText(page)

      // Exercise primary user story
      if (r.story === 'letters') await exerciseLettersStory(page, run)
      else if (r.story === 'list-click') await exerciseListClickStory(page, run)

      // Re-scan visible errors after interaction
      const post = await captureVisibleErrorText(page)
      for (const t of post) if (!run.visibleErrors.includes(t)) run.visibleErrors.push(t)

      await shotOnFail(page, run)
      allRuns.push(run)

      // Log inline so even a hard fail shows context
      console.log(`\n[W1] ${r.path}`)
      console.log(`  story: ${run.storyOutcome || '(none)'}`)
      if (run.consoleErrors.length) console.log(`  console: ${run.consoleErrors.length} errors`)
      if (run.pageErrors.length) console.log(`  pageerror: ${run.pageErrors.length}`)
      if (run.httpErrors.length) console.log(`  http>=400: ${run.httpErrors.length}`)
      if (run.visibleErrors.length) console.log(`  visible: ${run.visibleErrors.join(' || ')}`)
      if (run.screenshot) console.log(`  shot: ${run.screenshot}`)

      // NOTE: We deliberately do NOT call expect() here. The walker's job is
      // to COLLECT findings across every route, not to fail-fast — that would
      // abort subsequent routes. Findings are aggregated into the structured
      // report dumped by the final test().

      await page.close().catch(() => {})
      await ctx.close().catch(() => {})
    })
  }

  test('zzz — dump structured report', async () => {
    const out = {
      timestamp: new Date().toISOString(),
      routes: allRuns,
      summary: {
        total: allRuns.length,
        withConsole: allRuns.filter((r) => r.consoleErrors.length).length,
        withPageError: allRuns.filter((r) => r.pageErrors.length).length,
        with4xx: allRuns.filter((r) => r.httpErrors.some((h) => h.status >= 400 && h.status < 500)).length,
        with5xx: allRuns.filter((r) => r.httpErrors.some((h) => h.status >= 500)).length,
      },
    }
    const fpath = path.join(ARTIFACTS_DIR, `W1-report-${Date.now()}.json`)
    fs.writeFileSync(fpath, JSON.stringify(out, null, 2))
    console.log(`\n=== W1 REPORT ===\nwritten: ${fpath}`)
    console.log(JSON.stringify(out, null, 2))
  })
})
