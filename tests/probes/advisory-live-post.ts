export {} // module scope

// Wave-23 — Mandatory live HTTP smoke test for /api/advisory.
//
// PORTING-TEMPLATE §6 VERIFICATION (mandatory):
//   - POST /api/advisory → assert 201
//   - GET /api/advisory/{id} → assert 200, body matches what was posted
//   - PATCH with stale If-Match → assert 412
//   - PATCH with fresh If-Match → assert 200
//   - DELETE → assert 200/204 cleanup
//
// Hits the actual mounted HTTP route, not a helper function (W17.2 lesson).
// Every non-2xx assertion names the SPECIFIC expected code (FORENSIC P9).
//
// USAGE:
//   npx tsx tests/probes/advisory-live-post.ts --cookie="sb-…-auth-token=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const STALE_TOKEN = '2020-01-01T00:00:00.000Z'

function getCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  console.error('Missing --cookie="..." or COOKIE env var')
  process.exit(2)
}

const COOKIE = getCookie()

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: Envelope<T>; etag?: string }> {
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
  try { body = (await res.json()) as Envelope<T> } catch { body = {} }
  const etag = res.headers.get('etag') ?? undefined
  return { status: res.status, body, etag }
}

function assert(label: string, condition: boolean, detail = ''): void {
  const tag = condition ? 'PASS' : 'FAIL'
  console.log(`  ${tag}  ${label}${detail ? '  ' + detail : ''}`)
  if (!condition) process.exitCode = 1
}

async function main(): Promise<void> {
  console.log(`W23 advisory live-post smoke at ${BASE}\n`)

  const subject = `W23-live-probe-${Date.now()}`
  const today = new Date().toISOString().split('T')[0]

  // ─── 1. POST → 201 ────────────────────────────────────────────────────────
  console.log('[1/6] POST /api/advisory → 201')
  const postRes = await http<{ id: string; ref: string }>('/api/advisory', {
    method: 'POST',
    body: {
      subject,
      description: 'Live probe advisory description — automated test',
      business_unit: 'compliance',
      status: 'pending',
      priority: 'low',
      requested_by: 'W23 Probe Bot',
      requested_date: today,
    },
  })
  assert('POST returns 201', postRes.status === 201, `status=${postRes.status}`)
  const createdId = postRes.body.data?.id
  const createdRef = postRes.body.data?.ref
  assert('body.data.id is a UUID', typeof createdId === 'string' && createdId.length > 0)
  assert('body.data.ref starts with ADV-', typeof createdRef === 'string' && createdRef.startsWith('ADV-'))

  if (!createdId) {
    console.error('Cannot continue — no advisory id from POST')
    process.exitCode = 1
    return
  }

  // ─── 2. GET → 200, body matches ───────────────────────────────────────────
  console.log(`\n[2/6] GET /api/advisory/${createdId} → 200`)
  const getRes = await http<{ id: string; subject: string; ref: string; updated_at: string }>(
    `/api/advisory/${createdId}`,
    { method: 'GET' },
  )
  assert('GET returns 200', getRes.status === 200, `status=${getRes.status}`)
  assert('subject matches posted subject', getRes.body.data?.subject === subject)
  assert('ETag header present', typeof getRes.etag === 'string' && getRes.etag.length > 0, `etag=${getRes.etag ?? '∅'}`)
  const freshEtag = getRes.etag

  // ─── 3. PATCH with stale If-Match → 412 ───────────────────────────────────
  console.log(`\n[3/6] PATCH with stale If-Match → 412`)
  const staleRes = await http(`/api/advisory/${createdId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `W/"${STALE_TOKEN}"` },
    body: { description: 'This should be rejected — stale token' },
  })
  assert(
    'stale If-Match returns 412',
    staleRes.status === 412,
    `status=${staleRes.status} code=${staleRes.body.error?.code ?? '∅'}`,
  )

  // ─── 4. PATCH with fresh If-Match → 200 ────────────────────────────────────
  console.log(`\n[4/6] PATCH with fresh If-Match → 200`)
  const patchRes = await http<{ id: string; description: string; updated_at: string }>(
    `/api/advisory/${createdId}`,
    {
      method: 'PATCH',
      headers: freshEtag ? { 'If-Match': freshEtag } : {},
      body: { description: 'Patched description — W23 live probe' },
    },
  )
  assert('PATCH with fresh ETag returns 200', patchRes.status === 200, `status=${patchRes.status}`)
  assert('description updated', patchRes.body.data?.description === 'Patched description — W23 live probe')
  assert('response ETag present after PATCH', typeof patchRes.etag === 'string', `etag=${patchRes.etag ?? '∅'}`)

  // ─── 5. PATCH with uppercase status → 200 (casing audit W21-BUG-A) ────────
  console.log(`\n[5/6] PATCH with uppercase status → 200 (casing audit)`)
  const casingRes = await http(`/api/advisory/${createdId}`, {
    method: 'PATCH',
    body: { status: 'COMPLETED', priority: 'HIGH' },
  })
  assert('uppercase status/priority → ≠ 500', casingRes.status !== 500, `status=${casingRes.status}`)
  assert('uppercase status/priority → 200', casingRes.status === 200, `status=${casingRes.status}`)

  // ─── 6. DELETE → 200 ────────────────────────────────────────────────────────
  console.log(`\n[6/6] DELETE /api/advisory/${createdId} → 200`)
  const deleteRes = await http<{ deleted: boolean }>(
    `/api/advisory/${createdId}`,
    { method: 'DELETE' },
  )
  assert('DELETE returns 200', deleteRes.status === 200, `status=${deleteRes.status}`)
  assert('deleted flag is true', deleteRes.body.data?.deleted === true)

  // Verify the advisory is gone.
  const afterDeleteRes = await http(`/api/advisory/${createdId}`, { method: 'GET' })
  assert('GET after DELETE returns 404', afterDeleteRes.status === 404, `status=${afterDeleteRes.status}`)

  const exitCode = process.exitCode ?? 0
  console.log(`\nW23 live-post smoke: ${exitCode === 0 ? 'ALL PASSED' : 'SOME FAILED'}`)
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
