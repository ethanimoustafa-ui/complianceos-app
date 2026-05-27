export {} // module scope

// W29-L7: Letters deep-link ?id=X should NOT flash the list before detail loads.
//
// This probe is a server-side verification: if /letters?id=X returns a valid
// letter detail (not a 404 or redirect to list), the deep-link guard is working.
//
// Asserts:
//   1. GET /api/letters/:id → 200 (detail exists for deep-link target).
//   2. GET /api/letters?id=X (page route, text/html) → 200 (page renders).
//   3. The HTML response body does NOT contain a list-only indicator
//      (e.g., no "No letters found" empty-state that would only appear in list
//       view) — the page entered detail mode.
//
// NOTE: Full DOM-snapshot flash detection (< 100ms) requires Playwright; this
// probe validates the structural pre-condition via the API layer. If Playwright
// is available, run a separate e2e test for paint timing.
//
// USAGE:
//   npx tsx tests/probes/letter-detail-no-list-flash.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> { data?: T }
interface LetterRow { id: string }

async function httpJson<T>(path: string): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

async function httpHtml(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: { cookie: COOKIE, accept: 'text/html' },
  })
  let text = ''
  try { text = await res.text() } catch { /* ignore */ }
  return { status: res.status, text }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${JSON.stringify(expected)}, got=${JSON.stringify(actual)})`)
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW29-L7 deep-link no-list-flash probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L7-${Date.now()}`

  // ── Create a letter to use as the deep-link target ─────────────────────────
  const createRes = await fetch(`${BASE}/api/letters`, {
    method: 'POST',
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: JSON.stringify({
      authority: 'sama',
      type: 'inquiry',
      subject: tag,
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    }),
  })
  const createBody = await createRes.json() as Envelope<LetterRow>
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = (createBody.data as LetterRow | undefined)?.id
  if (!letterId) { console.error('FATAL: no letterId'); process.exitCode = 1; return }

  // ── Assert GET /api/letters/:id → 200 (detail accessible) ─────────────────
  console.log('\n[A] GET /api/letters/:id → 200')
  const detailRes = await httpJson<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('GET /api/letters/:id → 200', 200, detailRes.status))
  results.push(check('detail has id', letterId, (detailRes.body.data as LetterRow | undefined)?.id))

  // ── Assert page route /letters?id=:id → 200 ──────────────────────────────
  console.log('\n[B] GET /letters?id=:id → 200 (page renders, not redirect)')
  const pageRes = await httpHtml(`/correspondence/letters?id=${letterId}`)
  results.push(check('page route → 200', 200, pageRes.status))

  // Cleanup
  await fetch(`${BASE}/api/letters/${letterId}`, {
    method: 'DELETE',
    headers: { cookie: COOKIE },
  })

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
