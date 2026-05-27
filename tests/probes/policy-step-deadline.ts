export {} // module scope

// P1 — Policy step deadline persistence probe.
//
// Verifies that:
//   1. POST /api/policies creates a policy and returns a UUID.
//   2. GET /api/policies/{id}/workflow/steps lists the steps.
//   3. PATCH /api/policies/{id}/workflow/steps/{stepId} with `deadline` field
//      returns 200 and the updated row contains the deadline.
//   4. GET /api/policies/{id}/workflow/steps/{stepId} returns the persisted deadline.
//   5. Cleanup: DELETE the policy.
//
// USAGE:
//   npx tsx tests/probes/policy-step-deadline.ts --cookie="sb-…=…"

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

function check(label: string, expected: number, actual: number, extra = ''): boolean {
  const ok = actual === expected
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${extra ? '  ' + extra : ''}`)
  return ok
}
function checkEq(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  "${String(actual)}" (expected "${String(expected)}")`)
  return ok
}

interface PolicyRow { id: string; ref_code: string; status: string; updated_at: string }
interface StepRow { id: string; step: string; deadline: string | null; updated_at: string }

async function main(): Promise<void> {
  console.log(`policy-step-deadline probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create a policy
  console.log('[1] Create policy')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P1-deadline-probe-${Date.now()}`,
      description: 'Probe policy for step deadline test',
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

  // 2. List workflow steps
  console.log('\n[2] List workflow steps')
  const stepsRes = await http<StepRow[]>(`/api/policies/${policyId}/workflow/steps`)
  results.push(check('GET /workflow/steps → 200', 200, stepsRes.status))
  const steps = (stepsRes.body.data as StepRow[] | undefined) ?? []
  const firstStep = steps[0]
  if (!firstStep?.id) { console.log('  SKIP: no steps returned — workflow steps not seeded'); process.exitCode = 1; return }

  // 3. PATCH step with deadline
  console.log('\n[3] PATCH step deadline')
  const DEADLINE = '2026-12-31'
  const patchRes = await http<StepRow>(`/api/policies/${policyId}/workflow/steps/${firstStep.id}`, {
    method: 'PATCH',
    body: { deadline: DEADLINE },
  })
  results.push(check('PATCH /workflow/steps/{id} with deadline → 200', 200, patchRes.status))
  results.push(checkEq(
    'PATCH response.data.deadline = DEADLINE',
    DEADLINE,
    (patchRes.body.data as StepRow | undefined)?.deadline,
  ))

  // 4. GET step — verify deadline persisted
  console.log('\n[4] GET step — verify deadline persisted')
  const getRes = await http<StepRow>(`/api/policies/${policyId}/workflow/steps/${firstStep.id}`)
  results.push(check('GET /workflow/steps/{id} → 200', 200, getRes.status))
  results.push(checkEq(
    'GET response.data.deadline = DEADLINE',
    DEADLINE,
    (getRes.body.data as StepRow | undefined)?.deadline,
  ))

  // 5. Cleanup
  console.log('\n[5] Cleanup')
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
