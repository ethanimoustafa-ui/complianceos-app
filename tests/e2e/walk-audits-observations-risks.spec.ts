import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { signIn } from './_helpers/sign-in'

/**
 * Walker W2 — Audits + Observations + Risks
 *
 * Discovery (FS-confirmed under src/app/(dashboard)):
 *   - /audits, /audits/new, /audits/[id]      → NO standalone pages exist
 *   - /risks, /risks/new, /risks/[id]         → NO standalone pages exist
 *   - /observations                            → redirect → /correspondence/observations
 *   - /observations/new, /observations/[id]    → NO standalone pages (modal-based CRUD)
 *
 *   Real surfaces actually shipping the user stories:
 *     /reports/audits          ← list + AddAuditModal + delete dropdown
 *     /reports/risks           ← risks tab
 *     /reports/[auditId]       ← audit detail
 *     /correspondence/observations ← list + AddObservationModal
 *
 * Output: tests/e2e/_artifacts/W2-findings.jsonl (one JSON per finding).
 * Each test writes its finding eagerly (before any might-hang interaction)
 * and then re-writes a completed finding at the end. The summary test at the
 * bottom merges by route, last-wins.
 */

const ARTIFACT_DIR = path.resolve(__dirname, '_artifacts')
const FINDINGS_FILE = path.join(ARTIFACT_DIR, 'W2-findings.jsonl')

if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

type ResponseError = { status: number; url: string; body?: string; ts: string }
type ConsoleError = { type: string; text: string; ts: string }
type Finding = {
  route: string
  slug: string
  phase: 'started' | 'finished'
  outcome: 'pass' | 'fail' | 'timeout' | '404' | 'empty'
  notes: string
  consoleErrors: ConsoleError[]
  responseErrors: ResponseError[]
  screenshots: string[]
  suspectedLayer?: string
}

function nowIso(): string { return new Date().toISOString() }
function slugify(r: string): string {
  return r.replace(/^\//, '').replace(/[\/\[\]]/g, '-').replace(/-+/g, '-').replace(/-$/, '') || 'root'
}

function installResponseSpy(page: Page): ResponseError[] {
  const errors: ResponseError[] = []
  page.on('response', async (r) => {
    const status = r.status()
    if (status < 400) return
    const url = r.url()
    if (url.includes('/_next/') || url.endsWith('/favicon.ico')) return
    let body: string | undefined
    try { body = (await r.text()).slice(0, 300) } catch {}
    errors.push({ status, url, body, ts: nowIso() })
  })
  return errors
}

function installConsoleSpy(page: Page): ConsoleError[] {
  const errors: ConsoleError[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    errors.push({ type: 'error', text: msg.text().slice(0, 500), ts: nowIso() })
  })
  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', text: String(err?.message || err).slice(0, 500), ts: nowIso() })
  })
  return errors
}

async function safeScreenshot(page: Page, slug: string): Promise<string> {
  const file = path.join(ARTIFACT_DIR, `W2-${slug}-${Date.now()}.png`)
  try { await page.screenshot({ path: file, fullPage: false, timeout: 5_000 }) } catch {}
  return file
}

function persistFinding(f: Finding): void {
  try { fs.appendFileSync(FINDINGS_FILE, JSON.stringify(f) + '\n') } catch {}
}

async function visibleErrorText(page: Page): Promise<string> {
  const candidates = [/404/i, /not\s*found/i, /something\s+went\s+wrong/i, /unexpected\s+error/i]
  for (const re of candidates) {
    const el = page.getByText(re).first()
    try {
      if (await el.isVisible({ timeout: 200 })) {
        return ((await el.textContent({ timeout: 200 })) || '').trim().slice(0, 120)
      }
    } catch {}
  }
  return ''
}

async function safeSignIn(page: Page): Promise<boolean> {
  try {
    await signIn(page, { timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

// Truncate findings file once per worker, before any test runs.
test.beforeAll(() => {
  try { fs.writeFileSync(FINDINGS_FILE, '') } catch {}
})

// ─────────────────────────────────────────────────────────────────────────────
// Charter routes — document 404 / no-route
// ─────────────────────────────────────────────────────────────────────────────

const FOUR_OH_FOUR_ROUTES = [
  '/audits',
  '/audits/new',
  '/audits/00000000-0000-0000-0000-000000000001',
  '/risks',
  '/risks/new',
  '/risks/00000000-0000-0000-0000-000000000001',
  '/observations/new',
  '/observations/00000000-0000-0000-0000-000000000001',
]

for (const route of FOUR_OH_FOUR_ROUTES) {
  const slug = slugify(route)
  test(`walk: ${route}`, async ({ page }) => {
    test.setTimeout(45_000)
    persistFinding({ route, slug, phase: 'started', outcome: 'pass', notes: '', consoleErrors: [], responseErrors: [], screenshots: [] })
    const respErrors = installResponseSpy(page)
    const consoleErrors = installConsoleSpy(page)

    let outcome: Finding['outcome'] = 'pass'
    let notes = ''
    const screenshots: string[] = []

    const signedIn = await safeSignIn(page)
    if (!signedIn) {
      outcome = 'timeout'
      notes = 'sign-in timed out (>15s) — backend or auth slow'
      screenshots.push(await safeScreenshot(page, `${slug}-signin-fail`))
    } else {
      let status = 0
      const resp = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => null)
      if (resp) status = resp.status()
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      const visibleErr = await visibleErrorText(page)
      const finalUrl = page.url()
      if (status >= 400 || /404|not\s*found/i.test(visibleErr)) {
        outcome = '404'
        notes = `404 confirmed — status=${status} final-url=${finalUrl} visible="${visibleErr}"`
        screenshots.push(await safeScreenshot(page, slug))
      } else {
        notes = `no 404 — status=${status} final-url=${finalUrl} visible="${visibleErr}"`
      }
    }

    persistFinding({
      route, slug, phase: 'finished', outcome, notes,
      consoleErrors, responseErrors: respErrors, screenshots,
      suspectedLayer: outcome === '404' ? 'routing/scaffolding (page not implemented)' : undefined,
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// /observations → redirects to /correspondence/observations
// ─────────────────────────────────────────────────────────────────────────────

test('walk: /observations (redirect)', async ({ page }) => {
  test.setTimeout(45_000)
  const route = '/observations'
  const slug = 'observations-redirect'
  persistFinding({ route, slug, phase: 'started', outcome: 'pass', notes: '', consoleErrors: [], responseErrors: [], screenshots: [] })
  const respErrors = installResponseSpy(page)
  const consoleErrors = installConsoleSpy(page)

  let outcome: Finding['outcome'] = 'pass'
  let notes = ''
  const screenshots: string[] = []

  const signedIn = await safeSignIn(page)
  if (!signedIn) {
    outcome = 'timeout'; notes = 'sign-in timed out'
  } else {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    const finalUrl = page.url()
    const ok = /\/correspondence\/observations/.test(finalUrl)
    notes = `final-url=${finalUrl} redirect=${ok}`
    if (!ok) { outcome = 'fail'; screenshots.push(await safeScreenshot(page, slug)) }
  }

  persistFinding({
    route, slug, phase: 'finished', outcome, notes,
    consoleErrors, responseErrors: respErrors, screenshots,
    suspectedLayer: outcome === 'fail' ? 'routing (next redirect)' : undefined,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// /correspondence/observations — create → list-visible → delete
// ─────────────────────────────────────────────────────────────────────────────

test('walk: /correspondence/observations', async ({ page }) => {
  test.setTimeout(60_000)
  const route = '/correspondence/observations'
  const slug = 'correspondence-observations'
  persistFinding({ route, slug, phase: 'started', outcome: 'pass', notes: '', consoleErrors: [], responseErrors: [], screenshots: [] })
  const respErrors = installResponseSpy(page)
  const consoleErrors = installConsoleSpy(page)

  let outcome: Finding['outcome'] = 'pass'
  const notes: string[] = []
  const screenshots: string[] = []
  let suspectedLayer: string | undefined

  const signedIn = await safeSignIn(page)
  if (!signedIn) {
    outcome = 'timeout'; notes.push('sign-in timed out')
  } else {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      const initialErr = await visibleErrorText(page)
      if (initialErr) notes.push(`load-error="${initialErr}"`)

      const addBtn = page.getByRole('button', { name: /add\s+observation|new\s+observation/i }).first()
      const visible = await addBtn.isVisible({ timeout: 4_000 }).catch(() => false)
      if (!visible) {
        outcome = 'fail'
        suspectedLayer = 'client RBAC gate (Manage Audit Findings) or i18n label'
        notes.push('add-observation button not visible')
        screenshots.push(await safeScreenshot(page, `${slug}-no-btn`))
      } else {
        await addBtn.click()
        // Wait for modal
        const modalHeading = page.getByRole('heading').first()
        await modalHeading.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {})

        const uniq = `Walk_Obs_${Date.now()}`
        const inputs = await page.locator('input[type="text"]:visible').all()
        notes.push(`text-inputs-in-modal=${inputs.length}`)
        if (inputs[0]) await inputs[0].fill(uniq).catch(() => {})
        if (inputs[1]) await inputs[1].fill(`SubTitle_${Date.now()}`).catch(() => {})
        if (inputs[2]) await inputs[2].fill(`REF-${Date.now()}`).catch(() => {})

        const desc = page.locator('textarea:visible').first()
        if (await desc.count()) await desc.fill(`Walker W2 @ ${nowIso()}`).catch(() => {})

        const dueDateInput = page.locator('input[type="date"]:visible').first()
        if (await dueDateInput.count()) {
          const d = new Date(); d.setDate(d.getDate() + 30)
          await dueDateInput.fill(d.toISOString().slice(0, 10)).catch(() => {})
        }

        // Submit
        const saveBtn = page.getByRole('button', { name: /^(save|create|add\s+observation|submit)$/i }).last()
        await saveBtn.click({ timeout: 4_000 }).catch((e) => notes.push(`save-click-fail: ${String(e?.message || e).slice(0, 100)}`))
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})

        const appeared = await page.getByText(uniq).first().isVisible({ timeout: 5_000 }).catch(() => false)
        if (!appeared) {
          outcome = 'fail'
          suspectedLayer = 'client form validation OR observation-store create OR /rest/v1/observations'
          notes.push('row did not appear after create — likely validation blocked submit (department/assignees/file fields untouched)')
          screenshots.push(await safeScreenshot(page, `${slug}-no-row`))
        } else {
          notes.push(`created+visible="${uniq}"`)
          // Best-effort delete: click row to open detail modal? Or use action menu in row.
          try {
            const row = page.locator(`tr:has-text("${uniq}")`).first()
            await row.hover().catch(() => {})
            const trash = row.locator('button:has(svg)').last()
            await trash.click({ timeout: 2_000 }).catch(() => {})
            const confirm = page.getByRole('button', { name: /^(delete|confirm|yes)$/i }).first()
            if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
              await confirm.click().catch(() => {})
              await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {})
              const stillVisible = await page.getByText(uniq).first().isVisible({ timeout: 2_000 }).catch(() => false)
              notes.push(stillVisible ? 'delete attempted but row still visible' : 'deleted successfully')
            } else {
              notes.push('no delete confirm dialog appeared (trash button may not be the row action)')
            }
          } catch (e) {
            notes.push(`delete-flow-err: ${String(e).slice(0, 100)}`)
          }
        }
      }
    } catch (e) {
      outcome = 'fail'
      notes.push(`unexpected: ${String(e).slice(0, 150)}`)
      screenshots.push(await safeScreenshot(page, `${slug}-err`))
    }
  }

  if (respErrors.length > 0 && outcome === 'pass') {
    outcome = 'fail'; suspectedLayer = suspectedLayer ?? 'route handler / DB'
  }
  persistFinding({ route, slug, phase: 'finished', outcome, notes: notes.join(' | '), consoleErrors, responseErrors: respErrors, screenshots, suspectedLayer })
})

// ─────────────────────────────────────────────────────────────────────────────
// /reports/audits — real audits surface
// ─────────────────────────────────────────────────────────────────────────────

test('walk: /reports/audits', async ({ page }) => {
  test.setTimeout(60_000)
  const route = '/reports/audits'
  const slug = 'reports-audits'
  persistFinding({ route, slug, phase: 'started', outcome: 'pass', notes: '', consoleErrors: [], responseErrors: [], screenshots: [] })
  const respErrors = installResponseSpy(page)
  const consoleErrors = installConsoleSpy(page)

  let outcome: Finding['outcome'] = 'pass'
  const notes: string[] = []
  const screenshots: string[] = []
  let suspectedLayer: string | undefined

  const signedIn = await safeSignIn(page)
  if (!signedIn) {
    outcome = 'timeout'; notes.push('sign-in timed out')
  } else {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      const initialErr = await visibleErrorText(page)
      if (initialErr) notes.push(`load-error="${initialErr}"`)

      const addBtn = page.getByRole('button', { name: /schedule\s+audit|new\s+audit|create\s+audit|add\s+audit/i }).first()
      const visible = await addBtn.isVisible({ timeout: 4_000 }).catch(() => false)
      if (!visible) {
        outcome = 'fail'
        suspectedLayer = 'client RBAC gate (Manage Audit Findings)'
        notes.push('schedule-audit button not visible')
        screenshots.push(await safeScreenshot(page, `${slug}-no-btn`))
      } else {
        await addBtn.click()
        const uniq = `Walk_Audit_${Date.now()}`
        const titleInput = page.locator('input[name="title"]:visible').first()
        const haveTitle = await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)
        if (!haveTitle) {
          notes.push('modal did not open or title field not named "title"')
          // try generic
          const fb = page.locator('input[type="text"]:visible').first()
          await fb.fill(uniq).catch(() => {})
        } else {
          await titleInput.fill(uniq).catch(() => {})
        }

        // The modal requires: type (selected pre-defaulted to internal), assigneeId (required), title.
        // Try clicking a "Select" assignee dropdown if visible.
        const saveBtn = page.getByRole('button', { name: /^(save|create|schedule|submit)$/i }).last()
        await saveBtn.click({ timeout: 4_000 }).catch((e) => notes.push(`save-click-fail: ${String(e?.message || e).slice(0, 100)}`))
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})

        const appeared = await page.getByText(uniq).first().isVisible({ timeout: 5_000 }).catch(() => false)
        if (!appeared) {
          outcome = 'fail'
          suspectedLayer = 'client form validation (assigneeId required) OR audit-store create'
          notes.push('audit row did not appear — likely zod validation blocked: assigneeId required + no assignee picked')
          screenshots.push(await safeScreenshot(page, `${slug}-no-row`))
        } else {
          notes.push(`created+visible="${uniq}"`)
          // Delete via row dropdown menu
          try {
            const dropdownBtn = page.locator(`tr:has-text("${uniq}") button:has(svg)`).last()
            await dropdownBtn.click({ timeout: 2_000 }).catch(() => {})
            const deleteItem = page.getByRole('button', { name: /^delete$/i }).first()
            await deleteItem.click({ timeout: 2_000 }).catch(() => {})
            const confirm = page.getByRole('button', { name: /^(delete|confirm|yes)$/i }).first()
            if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
              await confirm.click().catch(() => {})
              await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {})
              notes.push('delete-attempted')
            }
          } catch (e) {
            notes.push(`delete-flow-err: ${String(e).slice(0, 100)}`)
          }
        }
      }
    } catch (e) {
      outcome = 'fail'
      notes.push(`unexpected: ${String(e).slice(0, 150)}`)
      screenshots.push(await safeScreenshot(page, `${slug}-err`))
    }
  }

  if (respErrors.length > 0 && outcome === 'pass') {
    outcome = 'fail'; suspectedLayer = suspectedLayer ?? 'route handler / DB'
  }
  persistFinding({ route, slug, phase: 'finished', outcome, notes: notes.join(' | '), consoleErrors, responseErrors: respErrors, screenshots, suspectedLayer })
})

// ─────────────────────────────────────────────────────────────────────────────
// /reports/risks — view + best-effort create
// ─────────────────────────────────────────────────────────────────────────────

test('walk: /reports/risks', async ({ page }) => {
  test.setTimeout(60_000)
  const route = '/reports/risks'
  const slug = 'reports-risks'
  persistFinding({ route, slug, phase: 'started', outcome: 'pass', notes: '', consoleErrors: [], responseErrors: [], screenshots: [] })
  const respErrors = installResponseSpy(page)
  const consoleErrors = installConsoleSpy(page)

  let outcome: Finding['outcome'] = 'pass'
  const notes: string[] = []
  const screenshots: string[] = []
  let suspectedLayer: string | undefined

  const signedIn = await safeSignIn(page)
  if (!signedIn) {
    outcome = 'timeout'; notes.push('sign-in timed out')
  } else {
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
      const initialErr = await visibleErrorText(page)
      if (initialErr) notes.push(`load-error="${initialErr}"`)

      const addBtn = page.getByRole('button', { name: /add\s+risk|new\s+risk|create\s+risk|register\s+risk/i }).first()
      const hasAdd = await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)
      if (!hasAdd) {
        outcome = 'empty'
        suspectedLayer = 'product surface: risks tab is read-only aggregation; no creation UI here'
        notes.push('no add-risk button — risks tab appears read-only')
      } else {
        await addBtn.click()
        const uniq = `Walk_Risk_${Date.now()}`
        const title = page.locator('input[type="text"]:visible').first()
        await title.fill(uniq).catch(() => {})
        const saveBtn = page.getByRole('button', { name: /^(save|create|submit|register)$/i }).last()
        await saveBtn.click({ timeout: 4_000 }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
        const appeared = await page.getByText(uniq).first().isVisible({ timeout: 5_000 }).catch(() => false)
        if (!appeared) {
          outcome = 'fail'
          suspectedLayer = 'client form validation OR risk-store create'
          notes.push('risk row did not appear')
          screenshots.push(await safeScreenshot(page, `${slug}-no-row`))
        } else {
          notes.push(`created="${uniq}" — no delete attempted (UI unknown)`)
        }
      }
    } catch (e) {
      outcome = 'fail'; notes.push(`unexpected: ${String(e).slice(0, 150)}`)
      screenshots.push(await safeScreenshot(page, `${slug}-err`))
    }
  }

  if (respErrors.length > 0 && outcome === 'pass') {
    outcome = 'fail'; suspectedLayer = suspectedLayer ?? 'route handler / DB'
  }
  persistFinding({ route, slug, phase: 'finished', outcome, notes: notes.join(' | '), consoleErrors, responseErrors: respErrors, screenshots, suspectedLayer })
})

// ─────────────────────────────────────────────────────────────────────────────
// /reports/[auditId] — drill into first audit
// ─────────────────────────────────────────────────────────────────────────────

test('walk: /reports/[auditId]', async ({ page }) => {
  test.setTimeout(60_000)
  const route = '/reports/[auditId]'
  const slug = 'reports-auditid'
  persistFinding({ route, slug, phase: 'started', outcome: 'pass', notes: '', consoleErrors: [], responseErrors: [], screenshots: [] })
  const respErrors = installResponseSpy(page)
  const consoleErrors = installConsoleSpy(page)

  let outcome: Finding['outcome'] = 'pass'
  const notes: string[] = []
  const screenshots: string[] = []
  let suspectedLayer: string | undefined

  const signedIn = await safeSignIn(page)
  if (!signedIn) {
    outcome = 'timeout'; notes.push('sign-in timed out')
  } else {
    try {
      await page.goto('/reports/audits', { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})

      // First detail link looks like href="/reports/<uuid>" — NOT /reports/audits or other tabs.
      const detailLinks = page.locator('a[href^="/reports/"]:not([href="/reports/audits"]):not([href="/reports/risks"]):not([href="/reports/executive"]):not([href="/reports/detailed"]):not([href="/reports/compliance-review"])')
      const cnt = await detailLinks.count().catch(() => 0)
      notes.push(`detail-links=${cnt}`)
      if (cnt === 0) {
        outcome = 'empty'
        notes.push('no audits in list — skipping detail walk')
      } else {
        const first = detailLinks.first()
        const href = await first.getAttribute('href')
        notes.push(`drilling href=${href}`)
        await first.click({ timeout: 3_000 }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
        const err = await visibleErrorText(page)
        if (err) { notes.push(`detail-error="${err}"`); screenshots.push(await safeScreenshot(page, `${slug}-detail-err`)) }

        // Walk tabs
        for (const tabName of ['tasks', 'team', 'documents', 'comments', 'closure']) {
          const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
            .or(page.getByRole('button', { name: new RegExp(`^${tabName}$`, 'i') }))
            .first()
          if (!(await tab.isVisible({ timeout: 800 }).catch(() => false))) {
            notes.push(`tab[${tabName}]=missing`); continue
          }
          await tab.click().catch(() => {})
          await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {})
          const tErr = await visibleErrorText(page)
          if (tErr) notes.push(`tab[${tabName}]-err="${tErr}"`)
          else notes.push(`tab[${tabName}]=ok`)
        }
      }
    } catch (e) {
      outcome = 'fail'; notes.push(`unexpected: ${String(e).slice(0, 150)}`)
      screenshots.push(await safeScreenshot(page, `${slug}-err`))
    }
  }

  if (respErrors.length > 0 && outcome === 'pass') {
    outcome = 'fail'; suspectedLayer = 'route handler / DB / RLS'
    screenshots.push(await safeScreenshot(page, `${slug}-resp`))
  }
  persistFinding({ route, slug, phase: 'finished', outcome, notes: notes.join(' | '), consoleErrors, responseErrors: respErrors, screenshots, suspectedLayer })
})

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

test('zzz_summary', async () => {
  test.setTimeout(10_000)
  if (!fs.existsSync(FINDINGS_FILE)) { console.log('[W2] no findings'); return }
  const lines = fs.readFileSync(FINDINGS_FILE, 'utf-8').split('\n').filter(l => l.trim())
  const finished = lines.map(l => JSON.parse(l)).filter((f: Finding) => f.phase === 'finished')
  const started = lines.map(l => JSON.parse(l)).filter((f: Finding) => f.phase === 'started')
  console.log('\n========== W2 SUMMARY ==========')
  console.log(`started=${started.length} finished=${finished.length}`)
  for (const f of finished as Finding[]) {
    console.log(`[${f.outcome.toUpperCase()}] ${f.route}`)
    console.log(`   notes: ${f.notes}`)
    if (f.consoleErrors.length) console.log(`   console-errs: ${f.consoleErrors.length}`)
    if (f.responseErrors.length) {
      console.log(`   resp-errs: ${f.responseErrors.length}`)
      for (const e of f.responseErrors.slice(0, 5)) console.log(`     ${e.status} ${e.url}`)
    }
    if (f.screenshots.length) console.log(`   screenshots: ${f.screenshots.length}`)
    if (f.suspectedLayer) console.log(`   layer: ${f.suspectedLayer}`)
  }
  // List routes that started but never finished (timed out hard)
  const finishedSlugs = new Set(finished.map((f: Finding) => f.slug))
  for (const s of started as Finding[]) {
    if (!finishedSlugs.has(s.slug)) console.log(`[HARD-TIMEOUT] ${s.route}`)
  }
  console.log('================================\n')
  expect(true).toBeTruthy()
})
