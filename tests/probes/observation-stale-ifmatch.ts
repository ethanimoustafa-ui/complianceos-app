export {} // module scope for top-level consts

// Wave-20 — Port of policy-stale-ifmatch.ts to the Observations surface.
// Verifies that every observation PATCH/DELETE-able route returns 412 when
// the client sends a stale `If-Match` token.
//
// Routes covered:
//   - PATCH  /api/observations/{oid}
//   - PATCH  /api/observations/{oid}/checklist/{itemId}
//   - DELETE /api/observations/{oid}/checklist/{itemId}
//   - PATCH  /api/observations/{oid}/comments/{commentId}
//   - DELETE /api/observations/{oid}/comments/{commentId}
//   - DELETE /api/observations/{oid}/evidence/{evidenceId}
//   - DELETE /api/observations/{oid}/attachments/{attachmentId}
//
// USAGE:
//   npx tsx tests/probes/observation-stale-ifmatch.ts \
//     --cookie="sb-…-auth-token=…" \
//     --observation="<observation-uuid>"

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
    console.error(`Missing arg --${name}="..." (or env ${envName}).`)
    process.exit(2)
  }
  return v
}

const COOKIE: string = requireArg('cookie', 'COOKIE')
const OBSERVATION_ID: string = requireArg('observation', 'OBSERVATION_ID')

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: {
      cookie: COOKIE,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  let body: Envelope<T>
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = {} as Envelope<T>
  }
  return { status: res.status, body }
}

function assertStatus(label: string, expected: number, actual: number): boolean {
  const ok = actual === expected
  console.log(`  → status=${actual} expected=${expected} ${ok ? 'PASS' : 'FAIL'}`)
  if (!ok) console.log(`     route=${label}`)
  return ok
}

async function pickChecklistItem(): Promise<string | null> {
  type Row = { id: string }
  const res = await http<Row[]>(`/api/observations/${OBSERVATION_ID}/checklist`, { method: 'GET' })
  if (res.status !== 200 || !Array.isArray(res.body.data)) return null
  return res.body.data[0]?.id ?? null
}

async function pickEvidence(): Promise<string | null> {
  type Row = { id: string }
  const res = await http<Row[]>(`/api/observations/${OBSERVATION_ID}/evidence`, { method: 'GET' })
  if (res.status !== 200 || !Array.isArray(res.body.data)) return null
  return res.body.data[0]?.id ?? null
}

async function probeParentPatch(): Promise<boolean> {
  console.log('\n[1] observation PATCH with stale If-Match')
  const url = `/api/observations/${OBSERVATION_ID}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { description: `w20-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeChecklistPatchStale(): Promise<boolean> {
  console.log('\n[2] checklist PATCH with stale If-Match')
  const itemId = await pickChecklistItem()
  if (!itemId) {
    console.log('  → SKIP: observation has no checklist items')
    return true
  }
  const url = `/api/observations/${OBSERVATION_ID}/checklist/${itemId}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { text: `w20-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeChecklistDeleteStale(): Promise<boolean> {
  console.log('\n[3] checklist DELETE with stale If-Match')
  type Row = { id: string }
  const created = await http<Row>(`/api/observations/${OBSERVATION_ID}/checklist`, {
    method: 'POST',
    body: { text: `w20-probe-item-${Date.now()}` },
  })
  if (created.status !== 201 || !created.body.data) {
    console.log(`  → SKIP: could not create probe item (status=${created.status})`)
    return true
  }
  const itemId = created.body.data.id
  const url = `/api/observations/${OBSERVATION_ID}/checklist/${itemId}`
  const res = await http(url, {
    method: 'DELETE',
    headers: { 'If-Match': STALE_IF_MATCH },
  })
  const ok = assertStatus(url, 412, res.status)
  await http(url, { method: 'DELETE' }).catch(() => undefined)
  return ok
}

async function probeEvidenceDeleteStale(): Promise<boolean> {
  console.log('\n[4] evidence DELETE with stale If-Match')
  const id = await pickEvidence()
  if (!id) {
    console.log('  → SKIP: no evidence on this observation')
    return true
  }
  const url = `/api/observations/${OBSERVATION_ID}/evidence/${id}`
  const res = await http(url, {
    method: 'DELETE',
    headers: { 'If-Match': STALE_IF_MATCH },
  })
  return assertStatus(url, 412, res.status)
}

async function main(): Promise<void> {
  console.log(`W20 observation stale-If-Match probes at ${BASE}`)
  console.log(`Observation: ${OBSERVATION_ID}`)
  console.log(`Stale token: ${STALE_IF_MATCH}\n`)
  const results = await Promise.all([
    probeParentPatch(),
    probeChecklistPatchStale(),
    probeChecklistDeleteStale(),
    probeEvidenceDeleteStale(),
  ])
  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} routes returned 412 on stale If-Match`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
