export {} // module scope

// W29-L2: Letter mark-response-received with optional note probe.
//
// Asserts:
//   1. POST /mark-response-received with a note → 200.
//   2. GET /letters/:id after → response_note persisted = "ack from SAMA".
//   3. POST /mark-response-received without a note body → 200 (note is optional).
//
// USAGE:
//   npx tsx tests/probes/letter-mark-response-with-note.ts --cookie="sb-…=…"

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
  status: string
  response_note?: string | null
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
  console.log(`\nW29-L2 mark-response-received with note probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L2-${Date.now()}`

  // ── Create a letter ────────────────────────────────────────────────────────
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: { authority: 'sama', type: 'inquiry', subject: `${tag}`, priority: 'standard',
            framework_ids: [], placeholder_defs: [], placeholder_values: {} },
  })
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id
  if (!letterId) { console.error('FATAL: no letterId'); process.exitCode = 1; return }

  // Advance to sent status via submit → approve → send
  await http(`/api/letters/${letterId}/submit-for-approval`, { method: 'POST' })
  await http(`/api/letters/${letterId}/approve`, { method: 'POST', body: {} })
  const sendRes = await http(`/api/letters/${letterId}/send`, { method: 'POST' })
  results.push(check('Letter advanced to sent', 200, sendRes.status))

  // ── Case A: mark response received WITH a note ─────────────────────────────
  console.log('\n[A] mark-response-received with note "ack from SAMA"')
  const markRes = await http<LetterRow>(`/api/letters/${letterId}/mark-response-received`, {
    method: 'POST',
    body: { response_note: 'ack from SAMA' },
  })
  results.push(check('POST /mark-response-received → 200', 200, markRes.status))

  // GET letter and check response_note
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`, { method: 'GET' })
  results.push(check('GET /letters/:id → 200', 200, getRes.status))
  const row = getRes.body.data as LetterRow | undefined
  results.push(check('response_note persisted', 'ack from SAMA', row?.response_note))
  results.push(check('status = response-received', 'response-received', row?.status))

  // Cleanup
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })

  // ── Case B: mark response received WITHOUT a note body ────────────────────
  console.log('\n[B] mark-response-received with no note body')
  const createRes2 = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: { authority: 'sama', type: 'inquiry', subject: `${tag}-b`, priority: 'standard',
            framework_ids: [], placeholder_defs: [], placeholder_values: {} },
  })
  const letterId2 = (createRes2.body.data as LetterRow | undefined)?.id
  if (letterId2) {
    await http(`/api/letters/${letterId2}/submit-for-approval`, { method: 'POST' })
    await http(`/api/letters/${letterId2}/approve`, { method: 'POST', body: {} })
    await http(`/api/letters/${letterId2}/send`, { method: 'POST' })
    const markNoNote = await http(`/api/letters/${letterId2}/mark-response-received`, { method: 'POST' })
    results.push(check('POST /mark-response-received (no body) → 200', 200, markNoNote.status))
    await http(`/api/letters/${letterId2}`, { method: 'DELETE' })
  } else {
    console.log('  SKIP  could not create letter for Case B')
    results.push(false)
  }

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
