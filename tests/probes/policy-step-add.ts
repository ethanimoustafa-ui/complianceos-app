export {} // module scope

// P3 — Policy add-step persistence probe.
//
// Verifies that POST /api/policies/{id}/workflow/steps persists the step and
// it appears in a subsequent GET.
//
// USAGE:
//   npx tsx tests/probes/policy-step-add.ts --cookie="sb-…=…"

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
interface StepRow { id: string; step: string; description: string | null; status: string }

async function main(): Promise<void> {
  console.log(`policy-step-add probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P3-step-add-probe-${Date.now()}`,
      description: 'Probe policy for step add test',
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

  // 2. Add workflow step
  console.log('\n[2] POST /workflow/steps')
  const stepName = `Probe Step ${Date.now()}`
  const stepDesc = 'Step added by probe'
  const addStepRes = await http<StepRow>(`/api/policies/${policyId}/workflow/steps`, {
    method: 'POST',
    body: {
      step: stepName,
      description: stepDesc,
      action_type: 'send-for-review',
    },
  })
  results.push(check('POST /workflow/steps → 201', 201, addStepRes.status))
  const stepId = (addStepRes.body.data as StepRow | undefined)?.id
  results.push(checkEq('step.step = stepName', stepName, (addStepRes.body.data as StepRow | undefined)?.step))

  // 3. GET steps — new step must appear
  console.log('\n[3] GET /workflow/steps')
  const listRes = await http<StepRow[]>(`/api/policies/${policyId}/workflow/steps`)
  results.push(check('GET /workflow/steps → 200', 200, listRes.status))
  const rows = Array.isArray(listRes.body.data) ? listRes.body.data : []
  results.push(checkEq('new step appears in list', true, rows.some((r) => r.id === stepId)))

  // 4. GET single step
  if (stepId) {
    console.log('\n[4] GET /workflow/steps/{id}')
    const getSingleRes = await http<StepRow>(`/api/policies/${policyId}/workflow/steps/${stepId}`)
    results.push(check('GET /workflow/steps/{id} → 200', 200, getSingleRes.status))
    results.push(checkEq('single step.step = stepName', stepName, (getSingleRes.body.data as StepRow | undefined)?.step))
  }

  // 5. Cleanup
  console.log('\n[5] Cleanup')
  await http(`/api/policies/${policyId}`, { method: 'DELETE' })

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
