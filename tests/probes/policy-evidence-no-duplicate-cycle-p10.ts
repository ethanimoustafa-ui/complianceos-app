export {} // module scope

// P10 (W30) — Adding policy evidence must NOT create duplicate review cycles.
//
// Root cause: when a policy has no current_review_cycle_id, each evidence upload
// sent with a different client-supplied cycle_id would land on a different cycle.
// The fix (evidence route P10) pins the first upload's cycle_id to the policy's
// current_review_cycle_id column so subsequent uploads use the same cycle.
//
// This probe mirrors policy-evidence-no-duplicate-review.ts but tests the
// exact client sequence: create policy (no cycle), upload evidence twice with
// different client cycle_ids, assert both land on the same cycle_id.
//
// USAGE:
//   npx tsx tests/probes/policy-evidence-no-duplicate-cycle-p10.ts --cookie="sb-…=…"

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
function checkTrue(label: string, actual: boolean, detail?: string): boolean {
  console.log(`  ${actual ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  return actual
}

interface PolicyRow { id: string; current_review_cycle_id?: string | null }
interface EvidenceRow { id: string; review_cycle_id: string | null; review_cycle_label: string | null }

async function main(): Promise<void> {
  console.log(`policy-evidence-no-duplicate-cycle-p10 probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy WITHOUT a current_review_cycle_id
  console.log('[1] Create policy (no initial review cycle)')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P10-no-dupe-cycle-${Date.now()}`,
      description: 'Duplicate cycle prevention probe (P10 W30)',
      category: 'Operational',
      approval_tier: 'board',
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
      // Deliberately omit current_review_cycle_id
    },
  })
  results.push(check('POST /api/policies → 201', 201, createRes.status))
  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  if (!policyId) { console.error('  FATAL: no policyId'); process.exitCode = 1; return }

  // 2. Upload evidence #1 — use a specific client cycle ID
  console.log('\n[2] Upload evidence #1 (cycle A)')
  const cycleA = `p10-cycle-A-${Date.now()}`
  const ev1 = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'evidence-p10-1.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: cycleA,
      review_cycle_label: 'P10 Cycle A',
    },
  })
  results.push(check('POST /evidence #1 → 201', 201, ev1.status))
  const cycle1 = (ev1.body.data as EvidenceRow | undefined)?.review_cycle_id

  // 3. Upload evidence #2 — use a DIFFERENT client cycle ID
  console.log('\n[3] Upload evidence #2 (cycle B — different client ID)')
  const cycleB = `p10-cycle-B-${Date.now() + 1}`
  const ev2 = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'evidence-p10-2.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: cycleB,
      review_cycle_label: 'P10 Cycle B',
    },
  })
  results.push(check('POST /evidence #2 → 201', 201, ev2.status))
  const cycle2 = (ev2.body.data as EvidenceRow | undefined)?.review_cycle_id

  // 4. Both must share the same review_cycle_id (fix: first upload pins the cycle)
  console.log('\n[4] Both evidence rows must share the same review_cycle_id')
  results.push(checkTrue(
    'Evidence #1 and #2 share the same review_cycle_id (P10 fix)',
    cycle1 !== null && cycle1 === cycle2,
    `ev1.cycle=${cycle1 ?? 'null'}, ev2.cycle=${cycle2 ?? 'null'}`,
  ))

  // 5. GET policy — current_review_cycle_id must be set (to the pinned cycle)
  console.log('\n[5] GET policy — current_review_cycle_id set after first upload')
  const policyDetail = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check('GET /api/policies/{id} → 200', 200, policyDetail.status))
  const cycleOnPolicy = (policyDetail.body.data as PolicyRow | undefined)?.current_review_cycle_id
  results.push(checkTrue(
    'Policy.current_review_cycle_id matches the evidence cycle',
    typeof cycleOnPolicy === 'string' && cycleOnPolicy === cycle1,
    `policy.cycle=${cycleOnPolicy ?? 'null'}, evidence.cycle=${cycle1 ?? 'null'}`,
  ))

  // 6. Cleanup
  console.log('\n[6] Cleanup')
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
