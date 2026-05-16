import { test, expect } from '@playwright/test'
import { ROUTES, signIn } from './_helpers/sign-in'

type HttpError = { status: number; url: string; page: string; body?: string }

test('sign-in then dashboard then key pages load', async ({ page }) => {
  const consoleErrors: string[] = []
  const networkErrors: string[] = [] // legacy: >=500 only (kept for backwards-compat logging)
  const httpErrors: HttpError[] = [] // NEW: every non-2xx, tagged with the originating route

  // `currentRoute` is updated as we navigate so each captured response
  // can be tagged with which page triggered it.
  let currentRoute = '/sign-in'

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })

  page.on('response', async (r) => {
    const status = r.status()
    if (status >= 500) {
      networkErrors.push(`${status} ${r.url()}`)
    }
    if (status >= 400) {
      let body: string | undefined
      try {
        const txt = await r.text()
        body = txt.slice(0, 300)
      } catch {
        body = undefined
      }
      httpErrors.push({ status, url: r.url(), page: currentRoute, body })
    }
  })

  await signIn(page)

  for (const r of ROUTES) {
    currentRoute = r
    await page.goto(r, { waitUntil: 'networkidle', timeout: 25000 })
    await page.waitForTimeout(400)
    console.log(`[ok] ${r} title=${await page.title()}`)
  }

  // Always print the captured-error tables before asserting so the supervisor can
  // see exactly which requests 400ed in a single CI log.
  if (consoleErrors.length) console.log('CONSOLE ERRORS:\n' + consoleErrors.join('\n'))
  if (networkErrors.length) console.log('NETWORK 5xx:\n' + networkErrors.join('\n'))
  if (httpErrors.length) {
    console.log('HTTP ERRORS (>=400):')
    console.log(JSON.stringify(httpErrors, null, 2))
  }

  // Preserve existing assertions ...
  expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0)
  expect(networkErrors, networkErrors.join('\n')).toHaveLength(0)
  // ... and add the new one that covers all 4xx as well.
  const fourPlus = httpErrors.filter((e) => e.status >= 400)
  expect(
    fourPlus,
    fourPlus.map((e) => `${e.status} ${e.page} ${e.url} :: ${e.body ?? ''}`).join('\n'),
  ).toHaveLength(0)
})
