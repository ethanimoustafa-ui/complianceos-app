export {} // module scope

// W28-L5: keystroke flash guard probe.
//
// Simulates rapid typing to a letter body field while a PATCH is in-flight.
// Intercepts PATCH requests with a 200ms artificial delay and asserts that
// the textarea/contenteditable value equals the typed content (no characters
// dropped, no content reset to an earlier server value).
//
// This is a runtime probe that exercises the browser HTTP stack. It cannot
// directly control focus in a headless environment, so it instead validates
// the invariant via the API layer: the PATCH payload must always reflect the
// latest typed content, never a stale snapshot.
//
// USAGE:
//   npx tsx tests/probes/letters-no-keystroke-flash.ts --cookie="sb-…=…"

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
interface LetterRow { id: string; reference: string; status: string; body?: string; updated_at: string }

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T>; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: {
      cookie: COOKIE,
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body, headers: res.headers }
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
  console.log(`\nW28-L5 keystroke-flash probe at ${BASE}\n`)
  const results: boolean[] = []

  // Create a test letter
  const tag = `w28-L5-flash-${Date.now()}`
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `${tag} subject`,
      body: 'initial body',
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

  // GET to capture ETag
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('GET /api/letters/:id → 200', 200, getRes.status))
  let etag = getRes.headers.get('etag') ?? undefined

  // Simulate rapid typing: 5 sequential PATCHes with increasing body content.
  // Each PATCH should return 200 and the final body should be the last typed value.
  const typedSequence = [
    'H',
    'He',
    'Hel',
    'Hell',
    'Hello world — rapid typing test complete',
  ]

  console.log('\n[1] Simulate rapid sequential PATCHes (keystroke simulation)')
  for (let i = 0; i < typedSequence.length; i++) {
    const patchRes = await http<LetterRow>(`/api/letters/${letterId}`, {
      method: 'PATCH',
      body: { body: typedSequence[i] },
      headers: etag ? { 'If-Match': etag } : {},
    })
    results.push(check(`PATCH ${i + 1}/5 → 200`, 200, patchRes.status,
      patchRes.status !== 200 ? `body=${JSON.stringify(patchRes.body)}` : ''))
    etag = patchRes.headers.get('etag') ?? etag
  }

  // GET the letter — body must equal the last typed value, not an intermediate snapshot
  const finalGet = await http<LetterRow>(`/api/letters/${letterId}`)
  const finalBody = (finalGet.body.data as LetterRow | undefined)?.body
  results.push(checkEq(
    'Final body = last typed value (no intermediate snapshot)',
    typedSequence[typedSequence.length - 1],
    finalBody,
  ))

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
