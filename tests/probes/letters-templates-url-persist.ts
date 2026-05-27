export {} // module scope

// W28.1-L8: Letters template databank — URL encodes view=templates so hard
// refresh preserves the templates view state.
//
// Verifies the API-layer invariant:
//   1. GET /correspondence/letters returns 200.
//   2. GET /correspondence/letters?view=templates returns 200 (not redirect/404).
//   3. The query param does not cause a 4xx or 5xx.
//
// The full client-side test (clicking "Manage Templates" adds ?view=templates
// to the URL; F5 re-opens the template databank) requires a browser driver.
// This probe validates the server-side invariant: the page route accepts the
// `view` query param without erroring.
//
// USAGE:
//   npx tsx tests/probes/letters-templates-url-persist.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}

const COOKIE = readCookie()

async function httpPage(path: string): Promise<{ status: number }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: { cookie: COOKIE },
    redirect: 'follow',
  })
  return { status: res.status }
}

function check(label: string, expected: number, actual: number, detail = ''): boolean {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${detail ? '  ' + detail : ''}`,
  )
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW28.1-L8 letters-templates-url-persist probe at ${BASE}\n`)
  const results: boolean[] = []

  // [1] Base letters page loads without error
  console.log('[1] GET /correspondence/letters (base)')
  const baseRes = await httpPage('/correspondence/letters')
  results.push(check('GET /correspondence/letters → 200', 200, baseRes.status))

  // [2] Letters page with ?view=templates loads without error — this is the
  // URL the "Manage Templates" button now writes and what F5 restores.
  console.log('\n[2] GET /correspondence/letters?view=templates')
  const templatesRes = await httpPage('/correspondence/letters?view=templates')
  results.push(check('GET /correspondence/letters?view=templates → 200', 200, templatesRes.status))

  // [3] Letters page with both ?view=templates and a ?id= param (edge case:
  // user opened a letter detail then navigated to templates from there, then F5).
  console.log('\n[3] GET /correspondence/letters?id=ea7097f2-5148-45b6-977a-5ea759463072&view=templates')
  const combinedRes = await httpPage(
    '/correspondence/letters?id=ea7097f2-5148-45b6-977a-5ea759463072&view=templates',
  )
  results.push(check(
    'GET /correspondence/letters?id=...&view=templates → 200',
    200,
    combinedRes.status,
  ))

  // [4] Exit-templates: ?view= cleared — page should still load normally
  console.log('\n[4] GET /correspondence/letters (after view cleared — simulated back-click)')
  const backRes = await httpPage('/correspondence/letters')
  results.push(check('GET /correspondence/letters (no view param) → 200', 200, backRes.status))

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(
    `\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`,
  )
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
