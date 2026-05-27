export {} // module scope

// P3 — Policy actions (kebab) menu probe.
//
// Verifies the four sidebar action buttons work end-to-end:
//   1. Edit (PATCH) — name change persists.
//   2. Archive — status → 'expired' persists.
//   3. Unarchive — status reverts to 'approved' persists.
//   4. Delete — row disappears from list.
//
// USAGE:
//   npx tsx tests/probes/policy-actions-menu.ts --cookie="sb-…=…"

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
  opts: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
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

interface PolicyRow { id: string; name: string; status: string; updated_at: string }

async function main(): Promise<void> {
  console.log(`policy-actions-menu probe at ${BASE}\n`)
  const results: boolean[] = []

  // Create a test policy
  const baseName = `P3-actions-probe-${Date.now()}`
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: baseName,
      description: 'Probe policy for actions menu test',
      category: 'Operational',
      approval_tier: 'board',
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check('POST /api/policies → 201', 201, createRes.status))
  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  const updatedAt0 = (createRes.body.data as PolicyRow | undefined)?.updated_at
  if (!policyId) { console.error('  FATAL: no policyId'); process.exitCode = 1; return }

  // [A] Edit (PATCH name)
  console.log('\n[A] Edit — PATCH name')
  const newName = `${baseName}-edited`
  const patchRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { name: newName },
  })
  results.push(check('PATCH /api/policies/{id} → 200', 200, patchRes.status))
  results.push(checkEq('PATCH response.data.name = newName', newName, (patchRes.body.data as PolicyRow | undefined)?.name))

  // Verify with GET
  const getAfterEdit = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(checkEq('GET name after edit = newName', newName, (getAfterEdit.body.data as PolicyRow | undefined)?.name))

  // [B] Archive — PATCH status → 'expired'
  console.log('\n[B] Archive — PATCH status → expired')
  const updatedAt1 = (patchRes.body.data as PolicyRow | undefined)?.updated_at
  const archiveRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { status: 'expired' },
    ...(updatedAt1 ? { headers: { 'If-Match': `W/"${updatedAt1}"` } } : {}),
  })
  results.push(check('PATCH status=expired → 200', 200, archiveRes.status))
  results.push(checkEq('status = "expired"', 'expired', (archiveRes.body.data as PolicyRow | undefined)?.status))

  // [C] Unarchive — PATCH status → 'approved'
  console.log('\n[C] Unarchive — PATCH status → approved')
  const updatedAt2 = (archiveRes.body.data as PolicyRow | undefined)?.updated_at
  const unarchiveRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { status: 'approved' },
    ...(updatedAt2 ? { headers: { 'If-Match': `W/"${updatedAt2}"` } } : {}),
  })
  results.push(check('PATCH status=approved → 200', 200, unarchiveRes.status))
  results.push(checkEq('status = "approved"', 'approved', (unarchiveRes.body.data as PolicyRow | undefined)?.status))

  // [D] Delete
  console.log('\n[D] Delete')
  const delRes = await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  results.push(check('DELETE /api/policies/{id} → 200', 200, delRes.status))

  // Confirm gone
  const getAfterDel = await http(`/api/policies/${policyId}`)
  results.push(check('GET after DELETE → 404', 404, getAfterDel.status))

  // Summary
  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
