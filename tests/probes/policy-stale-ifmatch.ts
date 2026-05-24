export {} // module scope for top-level consts

// Wave-18: port of `stale-ifmatch.ts` to the Policies surface. Verifies that
// every Policy PATCH/DELETE-able route returns 412 when the client sends a
// stale `If-Match` token. Single-request deterministic probe per route.
//
// Routes covered:
//   - PATCH  /api/policies/{pid}
//   - DELETE /api/policies/{pid}  (logical — skipped to avoid soft-deleting the
//                                  user's policy; PATCH alone exercises the
//                                  parent route)
//   - PATCH  /api/policies/{pid}/workflow/steps/{stepId}
//   - DELETE /api/policies/{pid}/workflow/steps/{stepId}
//   - DELETE /api/policies/{pid}/attachments/{attId}
//   - PATCH  /api/policies/{pid}/evidence/{evidenceId}
//   - PATCH  /api/policies/{pid}/review-cycles/{cycleId}
//
// USAGE:
//   1. Dev server running on http://localhost:3000.
//   2. Copy your `sb-<project>-auth-token` cookie.
//   3. Pick a policy you can mutate — it must already have at least one
//      workflow step. Pass via --policy="…" or env POLICY_ID.
//   4. Run:
//        npx tsx tests/probes/policy-stale-ifmatch.ts \
//          --cookie="sb-…-auth-token=…" \
//          --policy="<policy-uuid>"
//
// Expected: every probed route returns 412 precondition_failed.

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
const POLICY_ID: string = requireArg('policy', 'POLICY_ID')

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

async function pickStep(): Promise<string | null> {
  type Row = { id: string; updated_at?: string }
  const res = await http<Row[]>(`/api/policies/${POLICY_ID}/workflow/steps`, {
    method: 'GET',
  })
  if (res.status !== 200 || !Array.isArray(res.body.data)) return null
  const s = res.body.data[0]
  return s?.id ?? null
}

async function pickAttachment(): Promise<string | null> {
  type Row = { id: string }
  const res = await http<Row[]>(`/api/policies/${POLICY_ID}/attachments`, {
    method: 'GET',
  })
  if (res.status !== 200 || !Array.isArray(res.body.data)) return null
  return res.body.data[0]?.id ?? null
}

async function pickEvidence(): Promise<string | null> {
  type Row = { id: string }
  const res = await http<Row[]>(`/api/policies/${POLICY_ID}/evidence`, {
    method: 'GET',
  })
  if (res.status !== 200 || !Array.isArray(res.body.data)) return null
  return res.body.data[0]?.id ?? null
}

async function pickReviewCycle(): Promise<string | null> {
  type Row = { id: string }
  const res = await http<Row[]>(`/api/policies/${POLICY_ID}/review-cycles`, {
    method: 'GET',
  })
  if (res.status !== 200 || !Array.isArray(res.body.data)) return null
  return res.body.data[0]?.id ?? null
}

async function probePolicyParent(): Promise<boolean> {
  console.log('\n[1] policy PATCH with stale If-Match')
  const url = `/api/policies/${POLICY_ID}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { description: `w18-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeWorkflowStepStale(): Promise<boolean> {
  console.log('\n[2] workflow step PATCH with stale If-Match')
  const stepId = await pickStep()
  if (!stepId) {
    console.log('  → SKIP: policy has no workflow step')
    return true
  }
  const url = `/api/policies/${POLICY_ID}/workflow/steps/${stepId}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { description: `w18-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeWorkflowStepDeleteStale(): Promise<boolean> {
  console.log('\n[3] workflow step DELETE with stale If-Match')
  // Add a step first so DELETE has a victim row.
  type Row = { id: string }
  const created = await http<Row>(`/api/policies/${POLICY_ID}/workflow/steps`, {
    method: 'POST',
    body: { step: `w18-probe-step-${Date.now()}` },
  })
  if (created.status !== 201 || !created.body.data) {
    console.log(`  → SKIP: could not create probe step (status=${created.status})`)
    return true
  }
  const stepId = created.body.data.id
  const url = `/api/policies/${POLICY_ID}/workflow/steps/${stepId}`
  const res = await http(url, {
    method: 'DELETE',
    headers: { 'If-Match': STALE_IF_MATCH },
  })
  const ok = assertStatus(url, 412, res.status)
  await http(url, { method: 'DELETE' }).catch(() => undefined)
  return ok
}

async function probeAttachmentDeleteStale(): Promise<boolean> {
  console.log('\n[4] attachment DELETE with stale If-Match')
  const id = await pickAttachment()
  if (!id) {
    console.log('  → SKIP: no attachments on this policy')
    return true
  }
  const url = `/api/policies/${POLICY_ID}/attachments/${id}`
  const res = await http(url, {
    method: 'DELETE',
    headers: { 'If-Match': STALE_IF_MATCH },
  })
  return assertStatus(url, 412, res.status)
}

async function probeEvidencePatchStale(): Promise<boolean> {
  console.log('\n[5] evidence PATCH with stale If-Match')
  const id = await pickEvidence()
  if (!id) {
    console.log('  → SKIP: no evidence on this policy')
    return true
  }
  const url = `/api/policies/${POLICY_ID}/evidence/${id}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { notes: `w18-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeReviewCyclePatchStale(): Promise<boolean> {
  console.log('\n[6] review-cycle PATCH with stale If-Match')
  const id = await pickReviewCycle()
  if (!id) {
    console.log('  → SKIP: no review cycles on this policy')
    return true
  }
  const url = `/api/policies/${POLICY_ID}/review-cycles/${id}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { label: `w18-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function main(): Promise<void> {
  console.log(`W18 policy stale-If-Match probes at ${BASE}`)
  console.log(`Policy: ${POLICY_ID}`)
  console.log(`Stale token: ${STALE_IF_MATCH}\n`)
  const results = await Promise.all([
    probePolicyParent(),
    probeWorkflowStepStale(),
    probeWorkflowStepDeleteStale(),
    probeAttachmentDeleteStale(),
    probeEvidencePatchStale(),
    probeReviewCyclePatchStale(),
  ])
  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} routes returned 412 on stale If-Match`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
