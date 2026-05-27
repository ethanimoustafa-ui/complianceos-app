export {} // module scope

// W29-L4: Letter send with 0 or 1 attachments — never 500.
//
// Asserts:
//   1. Letter with 0 attachments → Send → 200 (not 500).
//   2. Letter with 1 attachment registered → Send → 200 (not 500).
//
// USAGE:
//   npx tsx tests/probes/letter-send-handles-attachments.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.'); process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> { data?: T }
interface LetterRow { id: string; status: string }

async function http<T>(path: string, opts: { method: string; body?: unknown } = { method: 'GET' }) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = await res.json() as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = expected === actual
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${expected}, got=${actual})`)
  return ok
}
function checkNot(label: string, banned: number, actual: number): boolean {
  const ok = actual !== banned
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (must NOT be ${banned}, got=${actual})`)
  return ok
}

async function createAndApprove(tag: string): Promise<string | undefined> {
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: { authority: 'sama', type: 'inquiry', subject: tag, priority: 'standard',
            framework_ids: [], placeholder_defs: [], placeholder_values: {} },
  })
  const id = (createRes.body.data as LetterRow | undefined)?.id
  if (!id) return undefined
  await http(`/api/letters/${id}/submit-for-approval`, { method: 'POST' })
  await http(`/api/letters/${id}/approve`, { method: 'POST', body: {} })
  return id
}

async function main() {
  console.log(`\nW29-L4 send handles attachments probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L4s-${Date.now()}`

  // ── Case A: 0 attachments → Send → 200 ────────────────────────────────────
  console.log('[A] Letter with 0 attachments → Send → 200')
  const id0 = await createAndApprove(`${tag}-0att`)
  if (id0) {
    const sendRes = await http(`/api/letters/${id0}/send`, { method: 'POST' })
    results.push(check('Send with 0 attachments → 200', 200, sendRes.status))
    results.push(checkNot('Send with 0 attachments → not 500', 500, sendRes.status))
    await http(`/api/letters/${id0}`, { method: 'DELETE' })
  } else {
    console.log('  SKIP  could not create letter'); results.push(false)
  }

  // ── Case B: 1 attachment registered → Send → 200 ─────────────────────────
  console.log('\n[B] Letter with 1 attachment → Send → 200')
  const id1 = await createAndApprove(`${tag}-1att`)
  if (id1) {
    // Register attachment metadata (storage path is synthetic — send route doesn't fetch bytes)
    await http(`/api/letters/${id1}/attachments`, {
      method: 'POST',
      body: { name: 'evidence.pdf', storage_path: `${id1}/evidence.pdf`, type: 'application/pdf', size: 2048 },
    })
    const sendRes = await http(`/api/letters/${id1}/send`, { method: 'POST' })
    results.push(check('Send with 1 attachment → 200', 200, sendRes.status))
    results.push(checkNot('Send with 1 attachment → not 500', 500, sendRes.status))
    await http(`/api/letters/${id1}`, { method: 'DELETE' })
  } else {
    console.log('  SKIP  could not create letter'); results.push(false)
  }

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
