import { test, expect } from '@playwright/test'
import { ROUTES, signIn } from './_helpers/sign-in'

/**
 * Per-route request budget.
 *
 * Counts every request whose URL matches Supabase REST/Auth/Storage on the
 * project ref `qdbitfgxbnbzkqhdoepd` OR our own `/api/*` routes on localhost:3000.
 * Fails if any single route exceeds REQ_BUDGET (default 20).
 *
 * Baseline at handoff: ~30–50/page (auth-fetch loop). Agent P is reducing this.
 *
 * Run with: REQ_BUDGET=20 npx playwright test tests/e2e/request-budget.spec.ts --reporter=list
 */

const PROJECT_REF = 'qdbitfgxbnbzkqhdoepd'
const BUDGET = parseInt(process.env.REQ_BUDGET || '20', 10)

function shouldCount(url: string): boolean {
  if (url.includes(`${PROJECT_REF}.supabase.co/rest/v1/`)) return true
  if (url.includes(`${PROJECT_REF}.supabase.co/auth/v1/`)) return true
  if (url.includes(`${PROJECT_REF}.supabase.co/storage/v1/`)) return true
  if (/^https?:\/\/localhost:3000\/api\//.test(url)) return true
  return false
}

/** Strip query + origin, return a stable path key for grouping. */
function pathKey(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname
  } catch {
    return url
  }
}

test('per-route request budget', async ({ page }) => {
  const perRoute: Record<string, { total: number; byPath: Record<string, number> }> = {}
  let currentRoute = '/sign-in'

  page.on('request', (req) => {
    const url = req.url()
    if (!shouldCount(url)) return
    const bucket = (perRoute[currentRoute] ||= { total: 0, byPath: {} })
    bucket.total += 1
    const key = pathKey(url)
    bucket.byPath[key] = (bucket.byPath[key] || 0) + 1
  })

  await signIn(page)

  for (const r of ROUTES) {
    currentRoute = r
    perRoute[r] ||= { total: 0, byPath: {} }
    await page.goto(r, { waitUntil: 'networkidle', timeout: 25000 })
    await page.waitForTimeout(400)
  }

  // Print summary table — top-5 most-frequent paths per route.
  console.log(`\nREQUEST BUDGET — threshold ${BUDGET}/route`)
  console.log('─'.repeat(80))
  for (const r of ROUTES) {
    const b = perRoute[r] || { total: 0, byPath: {} }
    const flag = b.total > BUDGET ? ' OVER' : ''
    console.log(`${r.padEnd(36)} ${String(b.total).padStart(4)}${flag}`)
    const top = Object.entries(b.byPath)
      .sort((a, c) => c[1] - a[1])
      .slice(0, 5)
    for (const [path, count] of top) {
      console.log(`    ${String(count).padStart(3)} × ${path}`)
    }
  }
  console.log('─'.repeat(80))

  const overBudget = ROUTES.filter((r) => (perRoute[r]?.total ?? 0) > BUDGET)
  expect(
    overBudget,
    overBudget
      .map((r) => `${r}: ${perRoute[r].total} requests (budget ${BUDGET})`)
      .join('\n'),
  ).toHaveLength(0)
})
