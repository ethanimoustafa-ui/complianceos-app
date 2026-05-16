import { test, expect } from '@playwright/test'

const ADMIN = { email: 'admin@complianceos.local', password: 'ComplianceOS!2026' }

test('sign-in then dashboard then key pages load', async ({ page }) => {
  const consoleErrors: string[] = []
  const networkErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('response', (r) => {
    if (r.status() >= 500) networkErrors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto('/sign-in')

  // The sign-in form's <label> elements are not associated with their inputs via htmlFor/id,
  // so we target by input type/placeholder instead.
  await page.locator('input[type="email"]').fill(ADMIN.email)
  await page.locator('input[type="password"]').fill(ADMIN.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
    timeout: 20000,
  })

  const routes = [
    '/dashboard',
    '/observations',
    '/correspondence/letters',
    '/correspondence/feed',
    '/reports/executive',
    '/reports/risks',
    '/calendar',
    '/team/directory',
    '/settings',
  ]
  for (const r of routes) {
    await page.goto(r, { waitUntil: 'networkidle', timeout: 25000 })
    await page.waitForTimeout(400)
    console.log(`[ok] ${r} title=${await page.title()}`)
  }

  if (consoleErrors.length) console.log('CONSOLE ERRORS:\n' + consoleErrors.join('\n'))
  if (networkErrors.length) console.log('NETWORK 5xx:\n' + networkErrors.join('\n'))
  expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0)
  expect(networkErrors, networkErrors.join('\n')).toHaveLength(0)
})
