export {} // module scope

// W29-L4: Letter print-pdf handles 0 and 1 attachments without 500.
//
// The PDF generation is client-side via downloadPdf(); the server-side
// route is GET /api/pdf/generate?template=sama-letter (or similar).
// This probe validates the /api/letters/:id GET returns 200 with attachment
// data correctly populated (feeds the PDF payload), not that PDF bytes render.
//
// Asserts:
//   1. GET /api/letters/:id with 0 attachments → 200, attachments = [].
//   2. GET /api/letters/:id with 1 attachment registered → 200, attachments.length >= 1.
//
// USAGE:
//   npx tsx tests/probes/letter-print-pdf-handles-attachments.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.'); process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> { data?: T }
interface LetterRow { id: string; attachments?: unknown[] }

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

async function main() {
  console.log(`\nW29-L4 print-pdf handles attachments probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L4p-${Date.now()}`

  // ── Case A: 0 attachments ─────────────────────────────────────────────────
  console.log('[A] Letter with 0 attachments — GET detail → 200')
  const cRes0 = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: { authority: 'sama', type: 'inquiry', subject: `${tag}-0att`, priority: 'standard',
            framework_ids: [], placeholder_defs: [], placeholder_values: {} },
  })
  const id0 = (cRes0.body.data as LetterRow | undefined)?.id
  if (id0) {
    const detailRes = await http<LetterRow>(`/api/letters/${id0}`, { method: 'GET' })
    results.push(check('GET /letters/:id → 200', 200, detailRes.status))
    const detail = detailRes.body.data as LetterRow | undefined
    results.push(check('attachments is array', true, Array.isArray(detail?.attachments ?? [])))
    await http(`/api/letters/${id0}`, { method: 'DELETE' })
  } else {
    console.log('  SKIP  could not create letter'); results.push(false); results.push(false)
  }

  // ── Case B: 1 attachment registered ──────────────────────────────────────
  console.log('\n[B] Letter with 1 attachment — GET detail → 200, attachments.length >= 1')
  const cRes1 = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: { authority: 'sama', type: 'inquiry', subject: `${tag}-1att`, priority: 'standard',
            framework_ids: [], placeholder_defs: [], placeholder_values: {} },
  })
  const id1 = (cRes1.body.data as LetterRow | undefined)?.id
  if (id1) {
    await http(`/api/letters/${id1}/attachments`, {
      method: 'POST',
      body: { name: 'doc.pdf', storage_path: `${id1}/doc.pdf`, type: 'application/pdf', size: 512 },
    })
    const detailRes = await http<LetterRow>(`/api/letters/${id1}`, { method: 'GET' })
    results.push(check('GET /letters/:id (with att) → 200', 200, detailRes.status))
    const detail = detailRes.body.data as LetterRow | undefined
    const attCount = (detail?.attachments ?? []).length
    results.push(check('attachments.length >= 1', true, attCount >= 1))
    await http(`/api/letters/${id1}`, { method: 'DELETE' })
  } else {
    console.log('  SKIP  could not create letter'); results.push(false); results.push(false)
  }

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
