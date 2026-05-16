import type { Page } from '@playwright/test'

export const ADMIN = {
  email: 'admin@complianceos.local',
  password: 'ComplianceOS!2026',
}

/**
 * Signs the test admin in via the /sign-in page and waits until the URL leaves /sign-in.
 * The sign-in form's <label> elements are not associated with their inputs via htmlFor/id,
 * so we target by input type instead of accessible name.
 */
export async function signIn(page: Page, opts: { timeout?: number } = {}): Promise<void> {
  const timeout = opts.timeout ?? 20_000
  await page.goto('/sign-in')
  await page.locator('input[type="email"]').fill(ADMIN.email)
  await page.locator('input[type="password"]').fill(ADMIN.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout })
}

/**
 * The 9 canonical routes the smoke walks. Kept here so request-budget can reuse them.
 */
export const ROUTES: string[] = [
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
