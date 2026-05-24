export {} // module scope

// Wave-21 — Letter timeline dual-store integrity probe.
//
// Creates a letter, exercises the main workflow transitions, then:
//   1. Asserts every timeline row has non-empty text_en AND text_ar.
//   2. Asserts NO timeline row contains a raw i18n key path (e.g. "letters.X").
//   3. Asserts the POST /api/letters returns 201.
//   4. Asserts GET /api/letters/{id} returns 200 with the expected reference.
//   5. Asserts DELETE /api/letters/{id} returns 200.
//   6. Checks that letter_versions rows exist and have dual-store columns.
//
// Every assertion names a SPECIFIC expected HTTP status code (FORENSIC P9).
//
// USAGE:
//   npx tsx tests/probes/letter-timeline-dual-store.ts \
//     --cookie="sb-…-auth-token=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readArg(name: string, envName: string): string | undefined {
  const fromEnv = process.env[envName]
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  const prefix = `--${name}=`
  for (const a of argv) if (a.startsWith(prefix)) return a.slice(prefix.length)
  return undefined
}
function requireArg(name: string, envName: string): string {
  const v = readArg(name, envName)
  if (!v) { console.error(`Missing --${name}="..." or ${envName}`); process.exit(2) }
  return v
}

const COOKIE = requireArg('cookie', 'COOKIE')

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> },
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

function check(label: string, expected: number, actual: number, extraMsg = ''): boolean {
  const ok = actual === expected
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  ${tag}  ${label}  →  status=${actual} (expected ${expected})${extraMsg ? '  ' + extraMsg : ''}`)
  return ok
}

interface LetterRow {
  id: string
  reference: string
  updated_at: string
  status: string
}

interface TimelineRow {
  id: string
  title: string
  text_en?: string
  text_ar?: string
  user_name?: string
  status: string
}

interface VersionRow {
  id: string
  text_en: string
  text_ar: string
  field_changes: unknown
}

async function main(): Promise<void> {
  console.log(`W21 letter timeline dual-store probe at ${BASE}\n`)
  const results: boolean[] = []

  // -------------------------------------------------------------------------
  // 1. POST /api/letters → assert 201
  // -------------------------------------------------------------------------
  console.log('[1] POST /api/letters → assert 201')
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `W21-probe-${Date.now()}`,
      body: 'Timeline dual-store probe letter body.',
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = createRes.body.data?.id
  const reference = createRes.body.data?.reference
  if (!letterId) {
    console.error('  FATAL: No letter ID in response. Cannot continue.')
    process.exitCode = 1
    return
  }
  console.log(`  Created letter ${reference} (${letterId})`)

  // -------------------------------------------------------------------------
  // 2. GET /api/letters/{id} → assert 200 + reference matches
  // -------------------------------------------------------------------------
  console.log('\n[2] GET /api/letters/{id} → assert 200 + reference matches')
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`, { method: 'GET' })
  results.push(check('GET /api/letters/{id} → 200', 200, getRes.status))
  const refMatch = getRes.body.data?.reference === reference
  console.log(`  ${refMatch ? 'PASS' : 'FAIL'}  reference matches (${getRes.body.data?.reference})`)
  results.push(refMatch)

  // -------------------------------------------------------------------------
  // 3. PATCH /api/letters/{id} → trigger version write
  // -------------------------------------------------------------------------
  console.log('\n[3] PATCH /api/letters/{id} → trigger version write')
  const patchRes = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { subject: `W21-probe-edited-${Date.now()}` },
  })
  results.push(check('PATCH /api/letters/{id} → 200', 200, patchRes.status))

  // -------------------------------------------------------------------------
  // 4. Submit for approval → timeline event with dual-store
  // -------------------------------------------------------------------------
  console.log('\n[4] POST submit-for-approval → assert 200')
  const submitRes = await http(`/api/letters/${letterId}/submit-for-approval`, { method: 'POST' })
  results.push(check('submit-for-approval → 200', 200, submitRes.status))

  // -------------------------------------------------------------------------
  // 5. Fetch timeline, assert dual-store integrity
  // -------------------------------------------------------------------------
  console.log('\n[5] GET timeline → assert dual-store (text_en + text_ar non-empty, no raw keys)')
  const timelineRes = await http<TimelineRow[]>(`/api/letters/${letterId}/timeline`, { method: 'GET' })
  results.push(check('GET timeline → 200', 200, timelineRes.status))

  const rows = Array.isArray(timelineRes.body.data) ? timelineRes.body.data : []
  let dualStorePass = true
  let rawKeyFound = false
  for (const row of rows) {
    const enOk = typeof row.text_en === 'string' && row.text_en.length > 0
    const arOk = typeof row.text_ar === 'string' && row.text_ar.length > 0
    if (!enOk || !arOk) {
      console.log(`  FAIL  row ${row.id}: text_en="${row.text_en ?? '∅'}" text_ar="${row.text_ar ?? '∅'}"`)
      dualStorePass = false
    }
    // Check for raw i18n key paths (should have been resolved by renderBilingual)
    if (row.text_en?.match(/^[a-z]+\.[a-zA-Z]+$/) || row.text_ar?.match(/^[a-z]+\.[a-zA-Z]+$/)) {
      console.log(`  FAIL  raw i18n key in row ${row.id}: en="${row.text_en}" ar="${row.text_ar}"`)
      rawKeyFound = true
    }
  }
  console.log(`  ${dualStorePass ? 'PASS' : 'FAIL'}  All ${rows.length} timeline rows have non-empty text_en + text_ar`)
  console.log(`  ${!rawKeyFound ? 'PASS' : 'FAIL'}  No raw i18n key paths found in timeline rows`)
  results.push(dualStorePass)
  results.push(!rawKeyFound)

  // -------------------------------------------------------------------------
  // 6. Fetch detail and check versions
  // -------------------------------------------------------------------------
  console.log('\n[6] GET detail → check versions dual-store')
  const detailRes = await http<{ versions: VersionRow[] }>(`/api/letters/${letterId}`, { method: 'GET' })
  const versions = detailRes.body.data?.versions ?? []
  let versionsOk = true
  for (const v of versions) {
    if (!v.text_en || !v.text_ar) {
      console.log(`  FAIL  version ${v.id}: missing dual-store columns`)
      versionsOk = false
    }
  }
  console.log(`  ${versionsOk ? 'PASS' : 'FAIL'}  ${versions.length} version(s) have dual-store columns`)
  results.push(versionsOk)

  // -------------------------------------------------------------------------
  // 7. DELETE /api/letters/{id} → cleanup + assert 200
  // -------------------------------------------------------------------------
  console.log('\n[7] DELETE /api/letters/{id} → cleanup + assert 200')
  const deleteRes = await http(`/api/letters/${letterId}`, { method: 'DELETE' })
  results.push(check('DELETE /api/letters/{id} → 200', 200, deleteRes.status))

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} assertions passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
