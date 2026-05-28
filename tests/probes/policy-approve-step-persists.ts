export {} // module scope

// P5 (W30) — After approving a workflow step, approved_by (user) + date persist.
//
// Verifies that:
//   1. Create a policy (board tier, with workflow steps seeded).
//   2. GET detail → identify the first 'current' step.
//   3. POST /workflow/advance (action=submit-for-review, step_id) → 200.
//   4. GET detail again → the completed step has non-empty user_name and date.
//   5. Cleanup.
//
// USAGE:
//   npx tsx tests/probes/policy-approve-step-persists.ts --cookie="sb-…=…"

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

interface PolicyRow { id: string; status: string }
interface WorkflowStepRow { id: string; step: string; status: string; user_name: string | null; date: string | null; sort_order: number }

async function main(): Promise<void> {
  console.log(`policy-approve-step-persists probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy (board tier)')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P5-approve-persists-${Date.now()}`,
      description: 'Approve step persistence probe',
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

  // 2. GET detail to find the current step
  console.log('\n[2] GET detail to find current step')
  const detailRes = await http<{ id: string; workflow_steps: WorkflowStepRow[] }>(`/api/policies/${policyId}`)
  results.push(check('GET /api/policies/{id} → 200', 200, detailRes.status))
  const detail = detailRes.body.data as { id: string; workflow_steps?: WorkflowStepRow[] } | undefined
  const steps = (detail?.workflow_steps ?? []) as WorkflowStepRow[]
  const sorted = [...steps].sort((a, b) => a.sort_order - b.sort_order)
  const currentStep = sorted.find((s) => s.status === 'current') ?? sorted[1] // first non-draft step
  results.push(checkTrue(
    `Current step found (${currentStep?.step ?? 'none'})`,
    currentStep !== undefined,
  ))
  if (!currentStep) { console.error('  FATAL: no current step'); process.exitCode = 1; return }

  // 3. Advance/approve the current step
  console.log(`\n[3] POST /workflow/advance (step: ${currentStep.step})`)
  const advanceRes = await http(`/api/policies/${policyId}/workflow/advance`, {
    method: 'POST',
    body: {
      action: 'submit-for-review',
      step_id: currentStep.id,
      note: 'P5 probe approval',
      user_name: 'P5-probe-agent',
    },
  })
  results.push(check(
    'POST /workflow/advance → 2xx',
    advanceRes.status >= 200 && advanceRes.status < 300 ? advanceRes.status : -1,
    advanceRes.status >= 200 && advanceRes.status < 300 ? advanceRes.status : -1,
  ))

  // 4. GET detail again → completed step must have user_name and date
  console.log('\n[4] GET detail → verify user_name + date persisted on completed step')
  const detail2Res = await http<{ id: string; workflow_steps: WorkflowStepRow[] }>(`/api/policies/${policyId}`)
  results.push(check('GET after advance → 200', 200, detail2Res.status))
  const steps2 = ((detail2Res.body.data as { workflow_steps?: WorkflowStepRow[] } | undefined)?.workflow_steps ?? []) as WorkflowStepRow[]
  const completedStep = steps2.find((s) => s.id === currentStep.id)
  results.push(checkTrue(
    'Completed step has status=completed',
    completedStep?.status === 'completed',
    `status=${completedStep?.status ?? 'not found'}`,
  ))
  results.push(checkTrue(
    'Completed step has non-empty user_name (approved_by)',
    typeof completedStep?.user_name === 'string' && completedStep.user_name.length > 0,
    `user_name="${completedStep?.user_name ?? ''}"`,
  ))
  results.push(checkTrue(
    'Completed step has non-empty date',
    typeof completedStep?.date === 'string' && completedStep.date.length > 0,
    `date="${completedStep?.date ?? ''}"`,
  ))

  // 5. Cleanup
  console.log('\n[5] Cleanup')
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
