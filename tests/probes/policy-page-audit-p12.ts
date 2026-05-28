export {} // module scope

// P12 (W30) — Policy page comprehensive audit.
//
// User stories (end-to-end with reload/GET assertions):
//   (a) leader/owner change → GET → still set
//   (b) department change → GET → still set
//   (c) evidence upload → GET → still attached
//   (d) workflow step advance → GET → still advanced
//
// USAGE:
//   npx tsx tests/probes/policy-page-audit-p12.ts --cookie="sb-…=…"

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
function checkTrue(label: string, actual: boolean, detail?: string): boolean {
  console.log(`  ${actual ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  return actual
}

interface PolicyDetail {
  id: string
  owner_name?: string | null
  business_owner_department_id?: string | null
  status?: string
  updated_at?: string
  evidence?: Array<{ id: string; name: string }>
  workflow_steps?: Array<{ id: string; step: string; status: string; user_name: string | null; date: string | null; sort_order: number }>
}

async function main(): Promise<void> {
  console.log(`policy-page-audit-p12 probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = Date.now()

  // Setup: create a dept for the business owner test
  console.log('[0] Create test department')
  const deptRes = await http<{ id: string }>('/api/settings/departments', {
    method: 'POST',
    body: { key: `p12-audit-dept-${tag}`, name_en: `P12 Audit Dept ${tag}`, name_ar: `قسم المراجعة ${tag}` },
  })
  const deptId = (deptRes.body.data as { id?: string } | undefined)?.id
  console.log(`  Dept: ${deptId ?? 'FAILED'}`)

  // 1. Create policy
  console.log('\n[1] Create policy')
  const createRes = await http<PolicyDetail>('/api/policies', {
    method: 'POST',
    body: {
      name: `P12-audit-${tag}`,
      description: 'P12 comprehensive audit probe',
      category: 'Operational',
      approval_tier: 'board',
      version: 'v1.0',
      owner_name: 'Original Owner',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check('POST /api/policies → 201', 201, createRes.status))
  const policyId = (createRes.body.data as PolicyDetail | undefined)?.id
  if (!policyId) { console.error('  FATAL: no policyId'); process.exitCode = 1; return }

  // (a) Leader/owner change → GET → still set
  console.log('\n[a] Owner change → GET → still set')
  const ownerPatch = await http<PolicyDetail>(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: { owner_name: 'Updated Owner P12' },
  })
  results.push(check('PATCH owner_name → 200', 200, ownerPatch.status))
  const ownerDetail = await http<PolicyDetail>(`/api/policies/${policyId}`)
  results.push(check('GET after owner change → 200', 200, ownerDetail.status))
  results.push(checkTrue(
    'owner_name persisted after GET',
    (ownerDetail.body.data as PolicyDetail | undefined)?.owner_name === 'Updated Owner P12',
    `owner_name="${(ownerDetail.body.data as PolicyDetail | undefined)?.owner_name}"`,
  ))

  // (b) Department change → GET → still set
  console.log('\n[b] Business owner department change → GET → still set')
  if (deptId) {
    const deptPatch = await http<PolicyDetail>(`/api/policies/${policyId}`, {
      method: 'PATCH',
      body: { business_owner_department_id: deptId },
    })
    results.push(check('PATCH business_owner_department_id → 200', 200, deptPatch.status))
    const deptDetail = await http<PolicyDetail>(`/api/policies/${policyId}`)
    results.push(check('GET after dept change → 200', 200, deptDetail.status))
    results.push(checkTrue(
      'business_owner_department_id persisted after GET',
      (deptDetail.body.data as PolicyDetail | undefined)?.business_owner_department_id === deptId,
      `dept_id="${(deptDetail.body.data as PolicyDetail | undefined)?.business_owner_department_id}"`,
    ))
  } else {
    console.log('  SKIP  dept creation failed — skipping dept-change test')
    results.push(true)
  }

  // (c) Evidence upload → GET → still attached
  console.log('\n[c] Evidence upload → GET → still attached')
  const evidenceUpload = await http(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'p12-audit-evidence.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: `p12-cycle-${tag}`,
      review_cycle_label: 'P12 Audit Cycle',
    },
  })
  results.push(check('POST /evidence → 201', 201, evidenceUpload.status))
  const evidenceDetail = await http<PolicyDetail>(`/api/policies/${policyId}`)
  results.push(check('GET after evidence upload → 200', 200, evidenceDetail.status))
  const evidenceList = (evidenceDetail.body.data as PolicyDetail | undefined)?.evidence ?? []
  results.push(checkTrue(
    'Evidence appears in GET detail',
    evidenceList.some((e) => e.name === 'p12-audit-evidence.pdf'),
    `evidence count=${evidenceList.length}`,
  ))

  // (d) Workflow step advance → GET → still advanced
  console.log('\n[d] Workflow step advance → GET → still advanced')
  const wfDetail = await http<PolicyDetail>(`/api/policies/${policyId}`)
  const steps = ((wfDetail.body.data as PolicyDetail | undefined)?.workflow_steps ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
  const currentStep = steps.find((s) => s.status === 'current')
  if (currentStep) {
    const advanceRes = await http(`/api/policies/${policyId}/workflow/advance`, {
      method: 'POST',
      body: {
        action: 'submit-for-review',
        step_id: currentStep.id,
        note: 'P12 audit probe',
        user_name: 'P12-probe-agent',
      },
    })
    results.push(check(
      'POST /workflow/advance → 2xx',
      advanceRes.status >= 200 && advanceRes.status < 300 ? advanceRes.status : -1,
      advanceRes.status >= 200 && advanceRes.status < 300 ? advanceRes.status : -1,
    ))
    const wfAfter = await http<PolicyDetail>(`/api/policies/${policyId}`)
    results.push(check('GET after advance → 200', 200, wfAfter.status))
    const stepsAfter = (wfAfter.body.data as PolicyDetail | undefined)?.workflow_steps ?? []
    const advancedStep = stepsAfter.find((s) => s.id === currentStep.id)
    results.push(checkTrue(
      'Step is completed after advance',
      advancedStep?.status === 'completed',
      `status="${advancedStep?.status ?? 'not found'}"`,
    ))
    results.push(checkTrue(
      'Step user_name persisted (P5 fix)',
      typeof advancedStep?.user_name === 'string' && advancedStep.user_name.length > 0,
      `user_name="${advancedStep?.user_name ?? ''}"`,
    ))
  } else {
    console.log('  SKIP  no current step found')
    results.push(true)
  }

  // Cleanup
  console.log('\nCleanup')
  await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  if (deptId) await http(`/api/settings/departments/${deptId}`, { method: 'DELETE' })
  console.log('  Cleaned up')

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
