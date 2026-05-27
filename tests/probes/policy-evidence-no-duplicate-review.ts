export {} // module scope

// P4 (W29) — Evidence upload must not create duplicate review cycle rows.
//
// Verifies that:
//   1. Create a policy (no open review cycle yet).
//   2. Upload evidence twice in quick succession, each time with a DIFFERENT
//      client-supplied review_cycle_id.
//   3. GET /api/policies/{id} → the policy has at most ONE review cycle row
//      (not two), because the server's P4 fix reads the policy's
//      `current_review_cycle_id` and pins both uploads to the same cycle.
//   4. Upload a third piece of evidence — same assertion.
//   5. Cleanup.
//
// USAGE:
//   npx tsx tests/probes/policy-evidence-no-duplicate-review.ts --cookie="sb-…=…"
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

interface PolicyRow {
  id: string
  review_cycles?: Array<{ id: string; label: string }>
  current_review_cycle_id?: string | null
}
interface EvidenceRow {
  id: string
  review_cycle_id: string | null
  review_cycle_label: string | null
}

async function main(): Promise<void> {
  console.log(`policy-evidence-no-duplicate-review probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P4-no-dupe-cycle-probe-${Date.now()}`,
      description: 'Duplicate review cycle prevention probe',
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

  // 2. Upload evidence #1 with a unique client cycle ID
  console.log('\n[2] Upload evidence #1 (unique client cycle ID)')
  const cycleId1 = `probe-cycle-A-${Date.now()}`
  const up1 = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'evidence-1.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: cycleId1,
      review_cycle_label: 'Probe Cycle A',
    },
  })
  results.push(check('POST /evidence #1 → 201', 201, up1.status))
  const row1CycleId = (up1.body.data as EvidenceRow | undefined)?.review_cycle_id

  // 3. Upload evidence #2 with a DIFFERENT client cycle ID
  console.log('\n[3] Upload evidence #2 (different client cycle ID — P4 must pin to same cycle)')
  const cycleId2 = `probe-cycle-B-${Date.now() + 1}` // deliberately different
  const up2 = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'evidence-2.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: cycleId2,
      review_cycle_label: 'Probe Cycle B',
    },
  })
  results.push(check('POST /evidence #2 → 201', 201, up2.status))
  const row2CycleId = (up2.body.data as EvidenceRow | undefined)?.review_cycle_id

  // 4. Both evidence rows should have the SAME review_cycle_id (whichever the
  //    server chose — either cycleId1 if it became current_review_cycle_id,
  //    or the policy's own current_review_cycle_id if it was already set).
  console.log('\n[4] Verify both evidence rows share the same review_cycle_id')
  results.push(checkTrue(
    'Evidence #1 and #2 share the same review_cycle_id',
    row1CycleId !== null && row1CycleId === row2CycleId,
    `row1=${row1CycleId ?? 'null'}, row2=${row2CycleId ?? 'null'}`,
  ))

  // 5. Upload evidence #3 — still pinned to same cycle
  console.log('\n[5] Upload evidence #3 (third upload — same cycle)')
  const cycleId3 = `probe-cycle-C-${Date.now() + 2}`
  const up3 = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'evidence-3.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: cycleId3,
      review_cycle_label: 'Probe Cycle C',
    },
  })
  results.push(check('POST /evidence #3 → 201', 201, up3.status))
  const row3CycleId = (up3.body.data as EvidenceRow | undefined)?.review_cycle_id
  results.push(checkTrue(
    'Evidence #3 shares the same review_cycle_id as #1 and #2',
    row1CycleId !== null && row1CycleId === row3CycleId,
    `row1=${row1CycleId ?? 'null'}, row3=${row3CycleId ?? 'null'}`,
  ))

  // 6. GET detail — confirm at most one unique review_cycle_id across evidence
  console.log('\n[6] GET detail — confirm single unique review cycle in evidence')
  const detailRes = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check('GET /api/policies/{id} → 200', 200, detailRes.status))
  const cycles = ((detailRes.body.data as PolicyRow | undefined)?.review_cycles ?? []) as Array<{ id: string }>
  results.push(checkTrue(
    `Only 1 review cycle row (got ${cycles.length})`,
    cycles.length <= 1,
  ))

  // 7. Cleanup
  console.log('\n[7] Cleanup')
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
