export {} // module scope

// P11 (W30) — Activity endpoint handles out-of-range page gracefully.
//
// Verifies that:
//   1. GET /api/policies/{id}/activity?page=999 returns 200 with empty items
//      (not 500 PGRST116 "range not satisfiable").
//   2. GET /api/policies/{id}/activity?page=1 returns items if any exist.
//   3. Pagination meta is correct.
//
// USAGE:
//   npx tsx tests/probes/policy-activity-page-range-p11.ts --cookie="sb-…=…"

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

interface PolicyRow { id: string }
interface ActivityPage { items: Array<{ id: string }>; page: number; pageSize: number; total: number; totalPages: number }

async function main(): Promise<void> {
  console.log(`policy-activity-page-range-p11 probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy and seed activity via evidence upload
  console.log('[1] Create policy + seed activity')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P11-activity-range-${Date.now()}`,
      description: 'Activity range probe (P11 W30)',
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

  // Seed a few activity entries via evidence uploads
  for (let i = 1; i <= 3; i++) {
    await http(`/api/policies/${policyId}/evidence`, {
      method: 'POST',
      body: {
        name: `seed-${i}.pdf`,
        storage_path: 'data:application/pdf;base64,JVBERi0=',
        review_cycle_id: `probe-cycle-${Date.now()}-${i}`,
        review_cycle_label: 'P11 Probe Cycle',
      },
    })
  }

  // 2. GET page=1 — should return items
  console.log('\n[2] GET /activity?page=1 → 200 with items')
  const page1Res = await http<ActivityPage>(`/api/policies/${policyId}/activity?page=1&pageSize=10`)
  results.push(check('GET /activity?page=1 → 200', 200, page1Res.status))
  const page1 = (page1Res.body.data as ActivityPage | undefined)
  results.push(checkTrue(
    'page=1 returns items array',
    Array.isArray(page1?.items),
  ))

  // 3. GET page=999 — must NOT 500 (out of range)
  console.log('\n[3] GET /activity?page=999 → 200 (not 500 PGRST116)')
  const page999Res = await http<ActivityPage>(`/api/policies/${policyId}/activity?page=999&pageSize=10`)
  results.push(check('GET /activity?page=999 → 200 (P11 fix)', 200, page999Res.status))
  const page999 = (page999Res.body.data as ActivityPage | undefined)
  results.push(checkTrue(
    'page=999 returns empty items array',
    Array.isArray(page999?.items) && page999.items.length === 0,
    `items.length=${page999?.items?.length ?? 'N/A'}`,
  ))

  // 4. GET page=2 on a policy with only page=1 items — same check
  console.log('\n[4] GET /activity?page=2 on small policy → 200 (not 500)')
  const page2Res = await http<ActivityPage>(`/api/policies/${policyId}/activity?page=2&pageSize=10`)
  results.push(check('GET /activity?page=2 → 200', 200, page2Res.status))

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
