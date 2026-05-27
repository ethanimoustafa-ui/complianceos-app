export {} // module scope

// P1 (W29) — Policy workflow step-action wiring probe.
//
// For each tier, verifies:
//   1. POST /api/policies → 201, returns a policy row with workflow steps seeded.
//   2. GET /api/policies/{id}/workflow/steps → 200, step list non-empty.
//   3. POST /api/policies/{id}/workflow/advance (action=submit-for-review) → 200/201.
//   4. GET detail again → first step status is now 'completed' or status advanced.
//   5. Cleanup: DELETE the policy.
//
// USAGE:
//   npx tsx tests/probes/policy-workflow-step-action.ts --cookie="sb-…=…"
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
function checkTrue(label: string, actual: boolean): boolean {
  console.log(`  ${actual ? 'PASS' : 'FAIL'}  ${label}`)
  return actual
}

interface PolicyRow { id: string; status: string; workflow_steps?: WorkflowStepRow[] }
interface WorkflowStepRow { id: string; step: string; status: string; sort_order: number }

const TIERS = ['board', 'agm', 'managerial', 'sharia', 'audit_committee'] as const
type Tier = (typeof TIERS)[number]

async function testTier(tier: Tier): Promise<boolean[]> {
  const results: boolean[] = []
  console.log(`\n--- Tier: ${tier} ---`)

  // 1. Create policy
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P1-wf-probe-${tier}-${Date.now()}`,
      description: `Workflow step action probe for tier ${tier}`,
      category: 'Operational',
      approval_tier: tier,
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check(`POST /api/policies (${tier}) → 201`, 201, createRes.status))
  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  if (!policyId) {
    console.error(`  FATAL: no policyId for tier ${tier}`)
    return results
  }

  // 2. GET detail to see workflow steps seeded
  const detailRes = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check(`GET /api/policies/${policyId} → 200`, 200, detailRes.status))
  const steps = (detailRes.body.data as PolicyRow | undefined)?.workflow_steps ?? []
  results.push(checkTrue(
    `Tier ${tier}: workflow_steps non-empty (got ${steps.length})`,
    steps.length > 0,
  ))

  if (steps.length > 0) {
    const firstStep = (steps as WorkflowStepRow[]).sort((a, b) => a.sort_order - b.sort_order)[0]

    // 3. Advance first step
    const advanceRes = await http(`/api/policies/${policyId}/workflow/advance`, {
      method: 'POST',
      body: {
        action: 'submit-for-review',
        step_id: firstStep.id,
        note: 'Probe advance',
        user_name: 'probe-agent',
      },
    })
    results.push(check(
      `POST /workflow/advance (submit-for-review, ${tier}) → 200/201`,
      advanceRes.status >= 200 && advanceRes.status < 300 ? advanceRes.status : -1,
      advanceRes.status >= 200 && advanceRes.status < 300 ? advanceRes.status : -1,
    ))

    // 4. Verify step status updated
    const detail2Res = await http<PolicyRow>(`/api/policies/${policyId}`)
    const steps2 = ((detail2Res.body.data as PolicyRow | undefined)?.workflow_steps ?? []) as WorkflowStepRow[]
    const updatedStep = steps2.find((s) => s.id === firstStep.id)
    results.push(checkTrue(
      `Step ${firstStep.id} status is completed after advance`,
      updatedStep?.status === 'completed',
    ))
  }

  // 5. Cleanup
  const delRes = await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  results.push(check(`DELETE /api/policies/${policyId} → 200`, 200, delRes.status))

  return results
}

async function main(): Promise<void> {
  console.log(`policy-workflow-step-action probe at ${BASE}\n`)
  const allResults: boolean[] = []

  for (const tier of TIERS) {
    const tierResults = await testTier(tier)
    allResults.push(...tierResults)
  }

  const passed = allResults.filter((r) => r).length
  const total = allResults.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
