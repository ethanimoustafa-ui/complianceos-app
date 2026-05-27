export {} // module scope

// W29.1-PrintPDF: GET /api/letters/{id}/print-pdf returns a real PDF.
//
// Asserts:
//   1. GET /api/letters → list has at least one letter to print.
//   2. GET /api/letters/{id}/print-pdf → 200.
//   3. Response content-type starts with "application/pdf".
//   4. Response body starts with the PDF magic bytes "%PDF-".
//
// USAGE:
//   npx tsx tests/probes/letter-print-pdf-returns-pdf.ts --cookie="sb-…=…"

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
interface LetterRow { id: string; reference?: string }

async function fetchJson<T>(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: COOKIE } })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = expected === actual
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${expected}, got=${actual})`)
  return ok
}
function predicate(label: string, fn: () => boolean, desc: string): boolean {
  let ok = false
  try { ok = fn() } catch { ok = false }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (${desc})`)
  return ok
}

async function main() {
  console.log(`\nW29.1 print-pdf probe at ${BASE}\n`)
  const results: boolean[] = []

  const listRes = await fetchJson<{ items?: LetterRow[] } | LetterRow[]>('/api/letters?pageSize=1')
  results.push(check('GET /api/letters → 200', 200, listRes.status))

  const rawData = listRes.body.data
  const letters: LetterRow[] = Array.isArray(rawData)
    ? rawData as LetterRow[]
    : Array.isArray((rawData as { items?: LetterRow[] })?.items)
      ? (rawData as { items: LetterRow[] }).items
      : []

  if (letters.length === 0) {
    console.log('  SKIP  no letters to print — create one first')
    process.exitCode = 1
    return
  }

  const letter = letters[0]
  const pdfRes = await fetch(`${BASE}/api/letters/${letter.id}/print-pdf`, {
    headers: { cookie: COOKIE },
  })

  results.push(check('GET /print-pdf → 200', 200, pdfRes.status))
  const ct = pdfRes.headers.get('content-type') ?? ''
  results.push(predicate(
    'content-type starts with application/pdf',
    () => ct.startsWith('application/pdf'),
    `got content-type=${ct}`,
  ))

  const buf = Buffer.from(await pdfRes.arrayBuffer())
  const magic = buf.subarray(0, 5).toString('utf8')
  results.push(predicate(
    'body starts with PDF magic "%PDF-"',
    () => magic === '%PDF-',
    `got magic=${JSON.stringify(magic)}, length=${buf.length}`,
  ))

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
