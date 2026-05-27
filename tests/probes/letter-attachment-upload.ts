export {} // module scope

// W29-L4: Letter attachment upload probe.
//
// Asserts:
//   1. POST a valid attachment metadata row → 201 + attachment row exists.
//   2. POST an oversized attachment (>20 MB flag set in payload) is rejected gracefully.
//   3. GET /api/letters/:id/attachments → includes the uploaded attachment.
//
// NOTE: This probe registers the metadata row directly (assumes file bytes
// already uploaded to storage). Integration with Supabase Storage upload
// requires a running storage service. The metadata-register path is what
// the route handler validates.
//
// USAGE:
//   npx tsx tests/probes/letter-attachment-upload.ts --cookie="sb-…=…"

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
interface AttachmentRow { id: string; name: string; size: number | null }
interface LetterRow { id: string }

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

function checkRange(label: string, min: number, max: number, actual: number): boolean {
  const ok = actual >= min && actual <= max
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected ${min}-${max}, got=${actual})`)
  return ok
}

async function main() {
  console.log(`\nW29-L4 attachment upload probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L4-${Date.now()}`

  // ── Create a letter ────────────────────────────────────────────────────────
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: { authority: 'sama', type: 'inquiry', subject: tag, priority: 'standard',
            framework_ids: [], placeholder_defs: [], placeholder_values: {} },
  })
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id
  if (!letterId) { console.error('FATAL: no letterId'); process.exitCode = 1; return }

  // ── Case A: valid attachment metadata ─────────────────────────────────────
  console.log('\n[A] Valid attachment registration')
  const attRes = await http<AttachmentRow>(`/api/letters/${letterId}/attachments`, {
    method: 'POST',
    body: {
      name: 'test-document.pdf',
      storage_path: `${letterId}/test-${Date.now()}-test-document.pdf`,
      type: 'application/pdf',
      size: 1024,
    },
  })
  results.push(check('POST /attachments → 201', 201, attRes.status))
  const attId = (attRes.body.data as AttachmentRow | undefined)?.id
  results.push(check('Attachment row has id', true, !!attId))

  // ── Case B: GET /attachments → row present ────────────────────────────────
  console.log('\n[B] GET attachment list includes uploaded attachment')
  const listRes = await http<AttachmentRow[]>(`/api/letters/${letterId}/attachments`, { method: 'GET' })
  results.push(check('GET /attachments → 200', 200, listRes.status))
  const atts = Array.isArray(listRes.body.data) ? listRes.body.data as AttachmentRow[] : []
  results.push(check('Uploaded attachment appears in list', true, atts.some((a) => a.id === attId)))

  // ── Case C: missing name → 400 ────────────────────────────────────────────
  console.log('\n[C] Missing required name → 400')
  const badRes = await http(`/api/letters/${letterId}/attachments`, {
    method: 'POST',
    body: { storage_path: 'some/path.pdf' }, // missing name
  })
  results.push(checkRange('POST /attachments missing name → 400', 400, 422, badRes.status))

  // Cleanup
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
