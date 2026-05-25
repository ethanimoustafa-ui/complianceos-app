export {} // module scope

// W26-B — HTTP probe for /api/reports/compliance-evaluations surface.
//
// Covers per PORTING-TEMPLATE §6 + FORENSIC P9:
//   1. POST (valid payload) → 201 with expected shape
//   2. GET list → 200, paginated shape, cache: no-store header
//   3. GET [id] → 200 with ETag header, cache: no-store
//   4. PATCH with stale If-Match → 412
//   5. PATCH with fresh If-Match → 200, new ETag echoed
//   6. POST /bulk with valid payload → 201
//   7. GET /score-summary → 200, correct shape, cache: no-store
//   8. DELETE → 200, deleted: true
//   9. SEC-5 (UUID): GET with non-existent id returns 404 not 500
//  10. SEC-8: POST with unknown key → 400 validation_failed
//  11. Uppercase enum casing: POST verdict='COMPLIANT' → 400 validation_failed
//
// Every assertion names the SPECIFIC expected HTTP code (FORENSIC P9).
//
// USAGE:
//   npx tsx tests/probes/reports-compliance-review.ts \
//     --cookie="sb-…-auth-token=…" \
//     --item-id="<policy-or-rule-uuid>" \
//     --department-id="<department-uuid>"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const STALE_IF_MATCH = 'W/"2020-01-01T00:00:00Z"'

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
  if (!v) {
    console.error(`Missing --${name}="..." or ${envName} env var`)
    process.exit(2)
  }
  return v
}

const COOKIE = requireArg('cookie', 'COOKIE')
const ITEM_ID = requireArg('item-id', 'ITEM_ID')
const DEPT_ID = requireArg('department-id', 'DEPT_ID')

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string; details?: unknown }
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> },
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
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = {}
  }
  return { status: res.status, body, headers: res.headers }
}

function check(label: string, expected: number, actual: number, extra = ''): boolean {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  status=${actual} (expected ${expected})${extra ? '  ' + extra : ''}`,
  )
  return ok
}

// [1] Valid POST → 201
async function probeCreate(): Promise<{ ok: boolean; evalId?: string }> {
  console.log('\n[1] POST valid payload → 201')
  const res = await http<{ id: string; verdict: string }>('/api/reports/compliance-evaluations', {
    method: 'POST',
    body: {
      kind: 'policy',
      item_id: ITEM_ID,
      department_id: DEPT_ID,
      verdict: 'compliant',
      notes: 'W26 probe note',
    },
  })
  const ok = check('valid POST', 201, res.status, `body=${JSON.stringify(res.body).slice(0, 120)}`)
  const evalId = res.body.data?.id
  if (!evalId) {
    console.log('  FAIL  response missing id')
    return { ok: false }
  }
  return { ok, evalId }
}

// [2] GET list → 200, paginated shape, no-store cache
async function probeList(): Promise<boolean> {
  console.log('\n[2] GET list → 200 + no-store cache header')
  const res = await http('/api/reports/compliance-evaluations', { method: 'GET' })
  if (!check('GET list', 200, res.status)) return false
  const cc = res.headers.get('cache-control') ?? ''
  const noStore = cc.includes('no-store')
  console.log(`  ${noStore ? 'PASS' : 'FAIL'}  Cache-Control: no-store  →  "${cc}"`)
  const d = res.body.data as { items?: unknown[]; total?: number } | undefined
  const hasShape = Array.isArray(d?.items) && typeof d?.total === 'number'
  console.log(`  ${hasShape ? 'PASS' : 'FAIL'}  paginated shape (items[]+total)`)
  return noStore && hasShape
}

// [3] GET [id] → 200 + ETag + no-store
async function probeGet(evalId: string): Promise<{ ok: boolean; etag?: string }> {
  console.log(`\n[3] GET [id] → 200 + ETag + no-store`)
  const res = await http(`/api/reports/compliance-evaluations/${encodeURIComponent(evalId)}`, {
    method: 'GET',
  })
  if (!check('GET [id]', 200, res.status)) return { ok: false }
  const cc = res.headers.get('cache-control') ?? ''
  const noStore = cc.includes('no-store')
  console.log(`  ${noStore ? 'PASS' : 'FAIL'}  Cache-Control: no-store  →  "${cc}"`)
  const etag = res.headers.get('etag') ?? undefined
  const hasEtag = !!etag
  console.log(`  ${hasEtag ? 'PASS' : 'FAIL'}  ETag header present  →  "${etag ?? '∅'}"`)
  return { ok: noStore && hasEtag, etag }
}

// [4] PATCH stale If-Match → 412
async function probeStaleIfMatch(evalId: string): Promise<boolean> {
  console.log('\n[4] PATCH stale If-Match → 412')
  const res = await http(`/api/reports/compliance-evaluations/${encodeURIComponent(evalId)}`, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { verdict: 'non-compliant' },
  })
  return check('stale If-Match → 412', 412, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// [5] PATCH with fresh If-Match → 200 + new ETag
async function probePatchFresh(evalId: string, etag: string): Promise<boolean> {
  console.log('\n[5] PATCH with fresh If-Match → 200 + new ETag')
  const res = await http(`/api/reports/compliance-evaluations/${encodeURIComponent(evalId)}`, {
    method: 'PATCH',
    headers: { 'If-Match': etag },
    body: { verdict: 'na', notes: 'W26 probe updated' },
  })
  if (!check('PATCH fresh → 200', 200, res.status)) return false
  const newEtag = res.headers.get('etag')
  const hasNewEtag = !!newEtag && newEtag !== etag
  console.log(`  ${hasNewEtag ? 'PASS' : 'WARN'}  new ETag differs  →  "${newEtag ?? '∅'}"`)
  return true
}

// [6] POST /bulk → 201
async function probeBulk(): Promise<boolean> {
  console.log('\n[6] POST /bulk → 201')
  const res = await http<{ upserted: number }>('/api/reports/compliance-evaluations/bulk', {
    method: 'POST',
    body: {
      evaluations: [
        { kind: 'policy', item_id: ITEM_ID, department_id: DEPT_ID, verdict: 'compliant' },
      ],
    },
  })
  if (!check('POST /bulk', 201, res.status)) return false
  const upserted = (res.body.data as { upserted?: number } | undefined)?.upserted
  const ok = typeof upserted === 'number' && upserted >= 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  upserted=${upserted} (expected ≥ 1)`)
  return ok
}

// [7] GET /score-summary → 200 + no-store
async function probeScoreSummary(): Promise<boolean> {
  console.log('\n[7] GET /score-summary → 200 + no-store')
  const res = await http('/api/reports/compliance-evaluations/score-summary', { method: 'GET' })
  if (!check('GET /score-summary', 200, res.status)) return false
  const cc = res.headers.get('cache-control') ?? ''
  const noStore = cc.includes('no-store')
  console.log(`  ${noStore ? 'PASS' : 'FAIL'}  Cache-Control: no-store  →  "${cc}"`)
  return noStore
}

// [8] DELETE → 200
async function probeDelete(evalId: string): Promise<boolean> {
  console.log(`\n[8] DELETE [id] → 200`)
  const res = await http(`/api/reports/compliance-evaluations/${encodeURIComponent(evalId)}`, {
    method: 'DELETE',
  })
  return check('DELETE → 200', 200, res.status, `body=${JSON.stringify(res.body).slice(0, 80)}`)
}

// [9] SEC-5 non-existent composite id → 404 not 500
async function probeSec5NonExistent(): Promise<boolean> {
  console.log('\n[9] SEC-5 non-existent composite id → 404 (not 500)')
  const bogus = `policy:00000000-0000-0000-0000-000000000001::00000000-0000-0000-0000-000000000002`
  const res = await http(`/api/reports/compliance-evaluations/${encodeURIComponent(bogus)}`, {
    method: 'GET',
  })
  const ok = res.status === 404
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  non-existent id → status=${res.status} (expected 404)`)
  return ok
}

// [10] SEC-8 unknown key on POST → 400 validation_failed
async function probeSec8UnknownKey(): Promise<boolean> {
  console.log('\n[10] SEC-8 unknown key → 400 validation_failed')
  const res = await http('/api/reports/compliance-evaluations', {
    method: 'POST',
    body: {
      kind: 'policy',
      item_id: ITEM_ID,
      department_id: DEPT_ID,
      verdict: 'compliant',
      is_admin: true,   // unknown key — must be rejected by .strict()
    },
  })
  if (!check('unknown key → 400', 400, res.status)) return false
  const code = res.body.error?.code
  const ok = code === 'validation_failed'
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  code=validation_failed  →  "${code ?? '∅'}"`)
  return ok
}

// [11] Casing audit: uppercase verdict → 400
async function probeUpperCaseEnum(): Promise<boolean> {
  console.log('\n[11] Uppercase enum casing: verdict="COMPLIANT" → 400 validation_failed')
  const res = await http('/api/reports/compliance-evaluations', {
    method: 'POST',
    body: {
      kind: 'policy',
      item_id: ITEM_ID,
      department_id: DEPT_ID,
      verdict: 'COMPLIANT',   // uppercase — must be rejected
    },
  })
  if (!check('uppercase verdict → 400', 400, res.status)) return false
  const code = res.body.error?.code
  const ok = code === 'validation_failed'
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  code=validation_failed  →  "${code ?? '∅'}"`)
  return ok
}

async function main(): Promise<void> {
  console.log(`W26-B compliance-review probe at ${BASE}`)
  console.log(`  item_id=${ITEM_ID}  department_id=${DEPT_ID}\n`)

  const results: boolean[] = []

  const { ok: created, evalId } = await probeCreate()
  results.push(created)

  results.push(await probeList())

  if (evalId) {
    const { ok: gotOk, etag } = await probeGet(evalId)
    results.push(gotOk)

    results.push(await probeStaleIfMatch(evalId))

    if (etag) {
      results.push(await probePatchFresh(evalId, etag))
    } else {
      console.log('\n[5] SKIP — no ETag from GET [id]; cannot test fresh PATCH')
      results.push(false)
    }
  } else {
    console.log('\n[3][4][5] SKIP — eval creation failed; skipping id-scoped probes')
    results.push(false, false, false)
  }

  results.push(await probeBulk())
  results.push(await probeScoreSummary())

  if (evalId) {
    results.push(await probeDelete(evalId))
  } else {
    console.log('\n[8] SKIP — no eval to delete')
    results.push(false)
  }

  results.push(await probeSec5NonExistent())
  results.push(await probeSec8UnknownKey())
  results.push(await probeUpperCaseEnum())

  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
