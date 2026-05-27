export {} // module scope

// W29-L6: Letter reject-with-reason probe.
//
// Asserts:
//   1. POST /api/letters → 201.
//   2. POST /submit-for-approval → 200 (letter enters pending_approval).
//   3. POST /reject with { comment: "audit gap" } → 200.
//   4. GET /api/letters/:id → status = "rejected" AND rejection_reason = "audit gap".
//
// USAGE:
//   npx tsx tests/probes/letter-approval-with-reject-reason.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

interface LetterRow {
  id: string
  status: string
  rejection_reason?: string | null
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${JSON.stringify(expected)}, got=${JSON.stringify(actual)})`)
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW29-L6 reject-with-reason probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L6-${Date.now()}`

  // ── Create letter ─────────────────────────────────────────────────────────
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: tag,
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id
  if (!letterId) { console.error('FATAL: no letterId'); process.exitCode = 1; return }

  // ── Submit for approval ───────────────────────────────────────────────────
  const submitRes = await http(`/api/letters/${letterId}/submit-for-approval`, { method: 'POST' })
  results.push(check('POST /submit-for-approval → 200', 200, submitRes.status))

  // ── Reject with comment ───────────────────────────────────────────────────
  console.log('\n[A] Reject with reason "audit gap"')
  const rejectRes = await http(`/api/letters/${letterId}/reject`, {
    method: 'POST',
    body: { comment: 'audit gap' },
  })
  results.push(check('POST /reject → 200', 200, rejectRes.status))

  // ── GET detail and assert status + rejection_reason ───────────────────────
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`, { method: 'GET' })
  results.push(check('GET /letters/:id → 200', 200, getRes.status))
  const row = getRes.body.data as LetterRow | undefined
  results.push(check('status = rejected', 'rejected', row?.status))
  results.push(check('rejection_reason persisted', 'audit gap', row?.rejection_reason))

  // Cleanup
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
