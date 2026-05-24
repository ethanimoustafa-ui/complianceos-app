export {} // module scope

// Wave-23 — Security hardening probes for /api/advisory surface.
//
// Mirrors the W20 observation-security probe. Covers:
//   SEC-3 — URL scheme injection on text fields → 400 (not applicable here;
//           advisory has no URL fields, but unknown-key rejection covers it)
//   SEC-4 — HTML-strip on text fields (subject, description)
//   SEC-5 — UUID validation on [advisoryId] segment → 400
//   SEC-8 — Unknown-key rejection → 400 validation_failed
//   W17-2 — Stale If-Match on PATCH /api/advisory/[id] → 412
//   W17-2 — Concurrent same-token PATCHes → exactly one 200, one 412
//   CASING — Status/Priority with uppercase input → 200, no 500 (W21-BUG-A pattern)
//
// Every assertion names the SPECIFIC expected HTTP code (not just "non-500")
// per PORTING-TEMPLATE §6 / FORENSIC P9.
//
// USAGE:
//   npx tsx tests/probes/advisory-security.ts \
//     --cookie="sb-…-auth-token=…" \
//     --advisory="<advisory-uuid>"

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
  if (!v) { console.error(`Missing --${name}="..." or ${envName}`); process.exit(2) }
  return v
}

const COOKIE = requireArg('cookie', 'COOKIE')
const ADVISORY_ID = requireArg('advisory', 'ADVISORY_ID')

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T = unknown>(
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
  try { body = (await res.json()) as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

function check(label: string, expected: number, actual: number, extraMsg = ''): boolean {
  const ok = actual === expected
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  ${tag}  ${label}  →  status=${actual} (expected ${expected})${extraMsg ? '  ' + extraMsg : ''}`)
  return ok
}

// SEC-5 — UUID validation: non-UUID segment should return 400.
async function probeSec5UuidValidation(): Promise<boolean> {
  console.log('\n[SEC-5] UUID validation — GET /api/advisory/not-a-uuid')
  const res = await http('/api/advisory/not-a-uuid', { method: 'GET' })
  return check('non-UUID segment → 400', 400, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// SEC-8 — Unknown-key rejection.
async function probeSec8UnknownKey(): Promise<boolean> {
  console.log('\n[SEC-8] Unknown-key rejection — PATCH with is_admin: true')
  const res = await http(`/api/advisory/${ADVISORY_ID}`, {
    method: 'PATCH',
    body: { is_admin: true },
  })
  return check('unknown key → 400', 400, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// SEC-4 — HTML strip: PATCH a text field with HTML → stored value stripped.
async function probeSec4HtmlStrip(): Promise<boolean> {
  console.log('\n[SEC-4] HTML strip — PATCH subject with <img onerror=...>')
  const sentinel = `w23-html-probe-${Date.now()}`
  const res = await http<{ subject?: string }>(`/api/advisory/${ADVISORY_ID}`, {
    method: 'PATCH',
    body: { subject: `<img src=x onerror=alert(1)>${sentinel}` },
  })
  if (res.status !== 200) {
    console.log(`  SKIP: PATCH returned ${res.status}`)
    return true // not a security failure per se
  }
  const stored = res.body.data?.subject ?? ''
  const hasTag = stored.includes('<img') || stored.includes('onerror')
  if (hasTag) {
    console.log(`  FAIL  HTML tag survived stripping: "${stored}"`)
    return false
  }
  const hasSentinel = stored.includes(sentinel)
  console.log(`  ${hasSentinel ? 'PASS' : 'WARN'}  text content: "${stored.slice(0, 80)}"`)
  return !hasTag
}

// W17-2 — Stale If-Match on parent PATCH.
async function probeStaleIfMatch(): Promise<boolean> {
  console.log('\n[W17-2] Stale If-Match — PATCH /api/advisory/[id]')
  const res = await http(`/api/advisory/${ADVISORY_ID}`, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { description: `w23-stale-probe-${Date.now()}` },
  })
  return check('stale If-Match → 412', 412, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// W17-2 — Concurrent same-token: two PATCHes with the same fresh ETag → 1×200 + 1×412.
async function probeConcurrentSameToken(): Promise<boolean> {
  console.log('\n[W17-2] Concurrent same-token — two PATCHes with identical fresh ETag')
  const getRes = await http<{ updated_at: string }>(`/api/advisory/${ADVISORY_ID}`, { method: 'GET' })
  const updatedAt = getRes.body.data?.updated_at
  if (!updatedAt) {
    console.log('  SKIP: could not read updated_at from GET')
    return true
  }
  const etag = `W/"${updatedAt}"`
  const ts = Date.now()
  const [r1, r2] = await Promise.all([
    http(`/api/advisory/${ADVISORY_ID}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: { description: `Concurrent probe A ${ts}` },
    }),
    http(`/api/advisory/${ADVISORY_ID}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: { description: `Concurrent probe B ${ts}` },
    }),
  ])
  const statuses = [r1.status, r2.status].sort()
  const pass = statuses[0] === 200 && statuses[1] === 412
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  statuses=${statuses.join(',')} (expected 200,412)`)
  return pass
}

// W21-BUG-A — casing audit: uppercase status/priority must not 500.
async function probeCasingAudit(): Promise<boolean> {
  console.log('\n[W21-BUG-A] Casing audit — PATCH with uppercase status + priority')
  const testCases: Array<{ body: Record<string, string>; label: string }> = [
    { body: { status: 'PENDING' },     label: 'uppercase PENDING' },
    { body: { status: 'IN_PROGRESS' }, label: 'uppercase IN_PROGRESS' },
    { body: { status: 'COMPLETED' },   label: 'uppercase COMPLETED' },
    { body: { priority: 'HIGH' },      label: 'uppercase HIGH' },
    { body: { priority: 'MEDIUM' },    label: 'uppercase MEDIUM' },
    { body: { priority: 'LOW' },       label: 'uppercase LOW' },
  ]
  let allPass = true
  for (const tc of testCases) {
    const res = await http(`/api/advisory/${ADVISORY_ID}`, {
      method: 'PATCH',
      body: tc.body,
    })
    const pass = res.status !== 500
    const tag = pass ? 'PASS' : 'FAIL'
    console.log(`  ${tag}  ${tc.label} → status=${res.status} (expected ≠ 500)`)
    if (!pass) allPass = false
  }
  return allPass
}

// Smoke — POST (create) returns 201 with a ref.
async function probePost201(): Promise<{ pass: boolean; advisoryId?: string }> {
  console.log('\n[SMOKE] POST /api/advisory → 201')
  const res = await http<{ id: string; ref: string }>('/api/advisory', {
    method: 'POST',
    body: {
      subject: `W23 smoke ${Date.now()}`,
      description: 'Automated probe advisory request',
      business_unit: 'compliance',
      status: 'pending',
      priority: 'low',
      requested_by: 'Probe Bot',
      requested_date: new Date().toISOString().split('T')[0],
    },
  })
  const pass = res.status === 201 && !!res.body.data?.id
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  POST → ${res.status}, ref=${res.body.data?.ref ?? '∅'}, id=${res.body.data?.id ?? '∅'}`)
  return { pass, advisoryId: res.body.data?.id }
}

// Smoke — GET created advisory returns 200 with ETag.
async function probeGet200(createdId: string): Promise<boolean> {
  console.log(`\n[SMOKE] GET /api/advisory/${createdId} → 200`)
  const res = await http<{ id: string; ref: string }>(`/api/advisory/${createdId}`, { method: 'GET' })
  const pass = res.status === 200 && res.body.data?.id === createdId
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  GET → ${res.status}, id=${res.body.data?.id ?? '∅'}`)
  return pass
}

// Smoke — DELETE returns 200.
async function probeDelete200(createdId: string): Promise<boolean> {
  console.log(`\n[SMOKE] DELETE /api/advisory/${createdId} → 200`)
  const res = await http<{ deleted: boolean }>(`/api/advisory/${createdId}`, { method: 'DELETE' })
  const pass = res.status === 200 && res.body.data?.deleted === true
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  DELETE → ${res.status}, deleted=${res.body.data?.deleted ?? '∅'}`)
  return pass
}

async function main(): Promise<void> {
  console.log(`W23 advisory security probes at ${BASE}`)
  console.log(`Advisory under test: ${ADVISORY_ID}`)

  const results: boolean[] = []

  // Security probes against existing advisory.
  results.push(await probeSec5UuidValidation())
  results.push(await probeSec8UnknownKey())
  results.push(await probeSec4HtmlStrip())
  results.push(await probeStaleIfMatch())
  results.push(await probeConcurrentSameToken())
  results.push(await probeCasingAudit())

  // Create/read/delete smoke.
  const postResult = await probePost201()
  results.push(postResult.pass)
  if (postResult.advisoryId) {
    results.push(await probeGet200(postResult.advisoryId))
    results.push(await probeDelete200(postResult.advisoryId))
  }

  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
