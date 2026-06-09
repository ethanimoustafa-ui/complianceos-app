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
  const timeout = opts.timeout ?? 30_000
  await page.goto('/sign-in')
  await page.locator('input[type="email"]').fill(ADMIN.email)
  await page.locator('input[type="password"]').fill(ADMIN.password)
  // W38: dev-mode hydration race — when the click lands before React attaches
  // the submit handler, NOTHING happens (no auth request, no navigation) and
  // the old single click + waitForURL timed the whole suite out. Click in
  // short rounds until the URL actually leaves /sign-in.
  const deadline = Date.now() + timeout
  for (;;) {
    await page
      .getByRole('button', { name: /sign in|log in/i })
      .click({ timeout: 3_000 })
      .catch(() => {})
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
        timeout: Math.min(5_000, Math.max(1_000, deadline - Date.now())),
      })
      return
    } catch {
      if (Date.now() >= deadline) {
        throw new Error('signIn: never left /sign-in (hydration race or auth failure)')
      }
    }
  }
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
