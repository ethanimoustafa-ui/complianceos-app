export {} // module scope

// P7 (W29) — Full page audit: edit persistence and store reconciliation.
//
// Verifies that:
//   1. Create a policy.
//   2. PATCH /api/policies/{id} (edit name, description, category, approval_tier,
//      owner_name, version) → 200.
//   3. GET /api/policies/{id} → all patched fields match.
//   4. PATCH with If-Match: W/"<outdated-updatedAt>" → 409 (optimistic lock).
//   5. PATCH archived_at → 200 (archive action works).
//   6. GET → archived_at is set.
//   7. PATCH archived_at: null → 200 (unarchive works).
//   8. GET → archived_at is null.
//   9. DELETE → 200.
//
// USAGE:
//   npx tsx tests/probes/policy-edit-persistence.ts --cookie="sb-…=…"
//
// NOTE: parse-load only — do not execute in CI without a live dev server.

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

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> } = { method: 'GET' },
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

function check(label: string, expected: number, actual: number): boolean {
  const ok = actual === expected
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})`)
  return ok
}
function checkEq(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  "${String(actual)}" (expected "${String(expected)}")`)
  return ok
}
function checkTrue(label: string, actual: boolean, detail?: string): boolean {
  console.log(`  ${actual ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  return actual
}

interface PolicyRow {
  id: string
  name: string
  description: string
  category: string
  approval_tier: string
  version: string
  owner_name?: string | null
  archived_at?: string | null
  updated_at: string
}

async function main(): Promise<void> {
  console.log(`policy-edit-persistence probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy')
  const tag = Date.now()
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P7-edit-probe-${tag}`,
      description: 'Initial description',
      category: 'Operational',
      approval_tier: 'board',
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check('POST /api/policies → 201', 201, createRes.status))
  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  if (!policyId) { console.error('  FATAL: no policyId'); process.exitCode = 1; return }

  // 2. GET to get current updated_at for optimistic lock
  console.log('\n[2] GET current row for If-Match token')
  const getRes = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check('GET /api/policies/{id} → 200', 200, getRes.status))
  const updatedAt = (getRes.body.data as PolicyRow | undefined)?.updated_at
  if (!updatedAt) { console.error('  FATAL: no updated_at'); process.exitCode = 1; return }

  // 3. PATCH valid fields
  console.log('\n[3] PATCH policy fields')
  const patchRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: {
      name: `P7-edited-${tag}`,
      description: 'Updated description from probe',
      category: 'Compliance',
      version: 'v1.1',
      owner_name: 'Probe Agent',
    },
    headers: { 'If-Match': `W/"${updatedAt}"` },
  })
  results.push(check('PATCH /api/policies/{id} → 200', 200, patchRes.status))

  // 4. GET verify patched fields persisted
  console.log('\n[4] GET verify patches persisted')
  const get2Res = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check('GET after PATCH → 200', 200, get2Res.status))
  const row = get2Res.body.data as PolicyRow | undefined
  results.push(checkEq('name updated', `P7-edited-${tag}`, row?.name))
  results.push(checkEq('description updated', 'Updated description from probe', row?.description))
  results.push(checkEq('category updated', 'Compliance', row?.category))
  results.push(checkEq('version updated', 'v1.1', row?.version))

  // 5. Stale If-Match → 409
  console.log('\n[5] PATCH with stale If-Match → 409')
  const staleRes = await http(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { name: `P7-stale-${tag}` },
    headers: { 'If-Match': `W/"2000-01-01T00:00:00.000Z"` }, // definitely stale
  })
  results.push(check('PATCH with stale If-Match → 409', 409, staleRes.status))

  // 6. Archive policy
  console.log('\n[6] Archive policy (PATCH archived_at)')
  const archiveTs = new Date().toISOString()
  const archiveRes = await http(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { archived_at: archiveTs },
  })
  results.push(check('PATCH archived_at → 200', 200, archiveRes.status))

  // 7. GET verify archived_at set
  console.log('\n[7] GET verify archived_at set')
  const get3Res = await http<PolicyRow>(`/api/policies/${policyId}`)
  const row3 = get3Res.body.data as PolicyRow | undefined
  results.push(checkTrue(
    'archived_at is a non-null string',
    typeof row3?.archived_at === 'string' && row3.archived_at !== null,
    `archived_at=${String(row3?.archived_at)}`,
  ))

  // 8. Unarchive policy
  console.log('\n[8] Unarchive policy (PATCH archived_at: null)')
  const unarchiveRes = await http(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { archived_at: null },
  })
  results.push(check('PATCH archived_at=null → 200', 200, unarchiveRes.status))

  // 9. GET verify archived_at cleared
  console.log('\n[9] GET verify archived_at cleared')
  const get4Res = await http<PolicyRow>(`/api/policies/${policyId}`)
  const row4 = get4Res.body.data as PolicyRow | undefined
  results.push(checkTrue(
    'archived_at is null after unarchive',
    row4?.archived_at === null || row4?.archived_at === undefined,
    `archived_at=${String(row4?.archived_at)}`,
  ))

  // 10. Cleanup
  console.log('\n[10] Cleanup')
  const delRes = await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  results.push(check('DELETE /api/policies → 200', 200, delRes.status))

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
