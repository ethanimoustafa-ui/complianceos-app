export {} // module scope

// W28-L1: letters send-route probe.
//
// Asserts:
//   1. POST /send on an approved letter → 200.
//   2. POST /send on a draft letter (not approved) → 409.
//   3. POST /send never returns 500.
//
// USAGE:
//   npx tsx tests/probes/letters-send-200-or-409.ts --cookie="sb-…=…"

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

interface LetterRow {
  id: string
  reference: string
  status: string
  updated_at: string
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
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
  return { status: res.status, body }
}

function check(label: string, expected: number, actual: number, detail = ''): boolean {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${detail ? '  ' + detail : ''}`,
  )
  return ok
}

function checkNot(label: string, banned: number, actual: number): boolean {
  const ok = actual !== banned
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (must NOT be ${banned})`,
  )
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW28-L1 send 200/409 probe at ${BASE}\n`)
  const results: boolean[] = []

  // ── Case A: Draft letter → submit for approval → approve → send → 200 ────
  console.log('[A] Approved letter → POST /send → 200')
  const tag = `w28-L1-send-${Date.now()}`
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

  // Submit for approval
  const submitRes = await http(`/api/letters/${letterId}/submit-for-approval`, { method: 'POST' })
  results.push(check('POST /submit-for-approval → 200', 200, submitRes.status))

  // Approve
  const approveRes = await http(`/api/letters/${letterId}/approve`, {
    method: 'POST',
    body: {},
  })
  results.push(check('POST /approve → 200', 200, approveRes.status))

  // Send — should return 200
  const sendRes = await http<LetterRow>(`/api/letters/${letterId}/send`, { method: 'POST' })
  results.push(check('POST /send on approved letter → 200', 200, sendRes.status,
    sendRes.status !== 200 ? `body=${JSON.stringify(sendRes.body)}` : ''))
  results.push(checkNot('POST /send → not 500', 500, sendRes.status))

  // Cleanup
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })

  // ── Case B: Draft letter → POST /send → 409 (wrong state) ────────────────
  console.log('\n[B] Draft letter → POST /send → 409')
  const createRes2 = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `${tag}-draft subject`,
      body: `${tag}-draft body`,
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters (draft) → 201', 201, createRes2.status))
  const letterId2 = (createRes2.body.data as LetterRow | undefined)?.id
  if (letterId2) {
    const sendDraftRes = await http(`/api/letters/${letterId2}/send`, { method: 'POST' })
    results.push(check('POST /send on draft letter → 409', 409, sendDraftRes.status,
      sendDraftRes.status !== 409 ? `body=${JSON.stringify(sendDraftRes.body)}` : ''))
    results.push(checkNot('POST /send on draft → not 500', 500, sendDraftRes.status))
    await http(`/api/letters/${letterId2}`, { method: 'DELETE' })
  } else {
    console.log('  SKIP  could not create draft letter for Case B')
    results.push(false)
  }

  // Summary
  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
