export {} // module scope

// W28-L4: letter detail survives hard refresh.
//
// Verifies that:
//   1. A letter's detail page is accessible via its UUID (GET /api/letters/:id → 200).
//   2. The letter row is still present in the list (GET /api/letters → contains id).
//   3. There's no server-side redirect for a valid letter id.
//
// The full client-side test (F5 on /correspondence/letters?id=xxx preserves
// the detail view) requires a browser. This probe validates the API invariant:
// the server never 404s a valid letter, which is the precondition for the
// client-side URL preservation fix to work.
//
// USAGE:
//   npx tsx tests/probes/letters-detail-survives-refresh.ts --cookie="sb-…=…"

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

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}
interface LetterRow { id: string; reference: string; status: string }

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: {
      cookie: COOKIE,
      'content-type': 'application/json',
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

function check(label: string, expected: number, actual: number, detail = ''): boolean {
  const ok = actual === expected
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${detail ? '  ' + detail : ''}`)
  return ok
}
function checkEq(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  "${String(actual)}" (expected "${String(expected)}")`)
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW28-L4 detail-survives-refresh probe at ${BASE}\n`)
  const results: boolean[] = []

  // Create a test letter
  const tag = `w28-L4-refresh-${Date.now()}`
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `${tag} subject`,
      body: `${tag} body`,
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id
  if (!letterId) {
    console.error('  FATAL: no letterId — aborting')
    process.exitCode = 1
    return
  }

  console.log('\n[1] GET /api/letters/:id returns 200 (not 404/redirect)')
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('GET /api/letters/:id → 200', 200, getRes.status,
    getRes.status !== 200 ? `body=${JSON.stringify(getRes.body)}` : ''))
  results.push(checkEq('returned id matches', letterId, (getRes.body.data as LetterRow | undefined)?.id))

  console.log('\n[2] Letter appears in list after "refresh" (re-fetch of list endpoint)')
  const listRes = await http<LetterRow[]>('/api/letters')
  results.push(check('GET /api/letters → 200', 200, listRes.status))
  const letters = Array.isArray(listRes.body.data) ? listRes.body.data : []
  const found = letters.some((l) => l.id === letterId)
  results.push(checkEq('letter appears in list', true, found))

  console.log('\n[3] Second GET /api/letters/:id (simulated refresh) → 200')
  const get2Res = await http<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('2nd GET /api/letters/:id → 200 (simulated refresh)', 200, get2Res.status))

  // Cleanup
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
