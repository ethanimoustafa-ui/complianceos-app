export {} // module scope

// P3 — Policy tier change persistence probe.
//
// Verifies that PATCH /api/policies/{id} with `approval_tier` persists the
// tier change and the GET reflects it. Tests the five seeded tier codes.
//
// USAGE:
//   npx tsx tests/probes/policy-tier-change.ts --cookie="sb-…=…"

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
    headers: { cookie: COOKIE, 'content-type': 'application/json', ...(opts.headers ?? {}) },
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

interface PolicyRow { id: string; approval_tier: string; updated_at: string }

// The five tiers from migration 074
const TIERS = ['board', 'agm', 'managerial', 'sharia', 'audit_committee'] as const

async function main(): Promise<void> {
  console.log(`policy-tier-change probe at ${BASE}\n`)
  const results: boolean[] = []

  // Create policy with initial tier = 'board'
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P3-tier-probe-${Date.now()}`,
      description: 'Probe policy for tier change test',
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

  let currentUpdatedAt = (createRes.body.data as PolicyRow | undefined)?.updated_at

  // Cycle through all five tiers
  for (const tier of TIERS) {
    console.log(`\n[PATCH] tier → ${tier}`)
    const patchRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
      method: 'PATCH',
      body: { approval_tier: tier },
      headers: currentUpdatedAt ? { 'If-Match': `W/"${currentUpdatedAt}"` } : {},
    })
    results.push(check(`PATCH approval_tier=${tier} → 200`, 200, patchRes.status))
    results.push(checkEq(
      `approval_tier=${tier} in PATCH response`,
      tier,
      (patchRes.body.data as PolicyRow | undefined)?.approval_tier,
    ))
    currentUpdatedAt = (patchRes.body.data as PolicyRow | undefined)?.updated_at

    // Verify with GET
    const getRes = await http<PolicyRow>(`/api/policies/${policyId}`)
    results.push(checkEq(
      `GET approval_tier=${tier} persisted`,
      tier,
      (getRes.body.data as PolicyRow | undefined)?.approval_tier,
    ))
    currentUpdatedAt = (getRes.body.data as PolicyRow | undefined)?.updated_at
  }

  // Cleanup
  console.log('\n[Cleanup]')
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
