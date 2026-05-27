export {} // module scope

// P3 — Policy evidence upload persistence probe.
//
// Verifies that:
//   1. POST /api/policies creates a policy.
//   2. POST /api/policies/{id}/evidence → 201, returns the evidence row.
//   3. GET /api/policies/{id}/evidence → 200, evidence row appears in list.
//   4. DELETE the evidence row → 200.
//   5. Cleanup: DELETE the policy.
//
// USAGE:
//   npx tsx tests/probes/policy-evidence-upload.ts --cookie="sb-…=…"

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

interface PolicyRow { id: string }
interface EvidenceRow { id: string; name: string; review_cycle_id: string }

async function main(): Promise<void> {
  console.log(`policy-evidence-upload probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P3-evidence-probe-${Date.now()}`,
      description: 'Probe policy for evidence upload test',
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

  // 2. Upload evidence
  console.log('\n[2] Upload evidence')
  const cycleId = `probe-cycle-${Date.now()}`
  const uploadRes = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'probe-evidence.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: cycleId,
      review_cycle_label: 'Probe Cycle',
    },
  })
  results.push(check('POST /evidence → 201', 201, uploadRes.status))
  const evidenceId = (uploadRes.body.data as EvidenceRow | undefined)?.id
  results.push(checkEq(
    'evidence.name = "probe-evidence.pdf"',
    'probe-evidence.pdf',
    (uploadRes.body.data as EvidenceRow | undefined)?.name,
  ))

  // 3. GET evidence list — row must appear
  console.log('\n[3] GET evidence list')
  const listRes = await http<EvidenceRow[]>(`/api/policies/${policyId}/evidence`)
  results.push(check('GET /evidence → 200', 200, listRes.status))
  const rows = Array.isArray(listRes.body.data) ? listRes.body.data : []
  results.push(checkEq('evidence appears in list', true, rows.some((r) => r.id === evidenceId)))

  // 4. DELETE evidence row
  if (evidenceId) {
    console.log('\n[4] DELETE evidence row')
    const delEvidenceRes = await http(`/api/policies/${policyId}/evidence/${evidenceId}`, { method: 'DELETE' })
    results.push(check('DELETE /evidence/{id} → 200', 200, delEvidenceRes.status))
  }

  // 5. Cleanup policy
  console.log('\n[5] Cleanup policy')
  const delRes = await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  results.push(check('DELETE policy → 200', 200, delRes.status))

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
