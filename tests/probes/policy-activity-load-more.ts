export {} // module scope

// P5 (W29) — Policy activity tab: 10 newest first + Load More pagination.
//
// Verifies that:
//   1. Create a policy.
//   2. Write 15 activity entries via internal API (or by making 15 state changes).
//      Since we can't inject activity directly, we'll proxy via the store's
//      loadMorePolicyActivity path: GET /api/policies/{id}/activity?page=1,
//      GET /api/policies/{id}/activity?page=2.
//   3. Page 1 returns at most 10 items.
//   4. Page 2 returns the remaining items.
//   5. Items are sorted newest-first (descending timestamp).
//   6. Cleanup.
//
// NOTE: parse-load only — do not execute in CI without a live dev server.
//
// USAGE:
//   npx tsx tests/probes/policy-activity-load-more.ts --cookie="sb-…=…"

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
interface ActivityRow { id: string; timestamp: string; type: string }

async function main(): Promise<void> {
  console.log(`policy-activity-load-more probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P5-activity-probe-${Date.now()}`,
      description: 'Activity load-more probe policy',
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

  // 2. Generate 12 activity entries by POSTing evidence 12 times.
  //    Each evidence upload writes a policy_activity row server-side.
  console.log('\n[2] Seed 12 activity entries via 12 evidence uploads')
  for (let i = 1; i <= 12; i++) {
    const r = await http<unknown>(`/api/policies/${policyId}/evidence`, {
      method: 'POST',
      body: {
        name: `activity-seed-${i}.pdf`,
        storage_path: 'data:application/pdf;base64,JVBERi0=',
        review_cycle_id: `probe-cycle-${Date.now()}`,
        review_cycle_label: 'Probe Cycle',
      },
    })
    if (r.status !== 201) console.warn(`  WARN: evidence ${i} returned ${r.status}`)
  }
  console.log('  Seeded 12 evidence uploads')

  // 3. GET detail — activity_log (first page, max 10 per services/policies.ts constant PAGE=10)
  console.log('\n[3] GET /api/policies/{id} — activity_log length ≤ 10')
  const detailRes = await http<{ activity_log?: ActivityRow[]; activity_log_has_more?: boolean }>(
    `/api/policies/${policyId}`,
  )
  results.push(check('GET /api/policies/{id} → 200', 200, detailRes.status))
  const page1 = (detailRes.body.data as { activity_log?: ActivityRow[] } | undefined)?.activity_log ?? []
  const hasMore = (detailRes.body.data as { activity_log_has_more?: boolean } | undefined)?.activity_log_has_more ?? false
  results.push(checkTrue(
    `activity_log page 1 length ≤ 10 (got ${page1.length})`,
    page1.length <= 10,
  ))
  results.push(checkTrue(
    'activity_log_has_more is true (more pages available)',
    hasMore,
  ))

  // 4. Verify items are sorted newest-first (descending timestamp)
  console.log('\n[4] Verify newest-first sort order')
  let sortedOk = true
  for (let i = 1; i < page1.length; i++) {
    if (page1[i - 1].timestamp < page1[i].timestamp) {
      sortedOk = false
      console.error(`  Sort error: item[${i - 1}].timestamp=${page1[i - 1].timestamp} < item[${i}].timestamp=${page1[i].timestamp}`)
    }
  }
  results.push(checkTrue('activity_log page 1 is sorted newest-first', sortedOk))

  // 5. GET activity page 2
  console.log('\n[5] GET /api/policies/{id}/activity?page=2')
  const page2Res = await http<ActivityRow[]>(`/api/policies/${policyId}/activity?page=2`)
  results.push(check('GET /activity?page=2 → 200', 200, page2Res.status))
  const page2 = Array.isArray(page2Res.body.data) ? page2Res.body.data : []
  results.push(checkTrue(
    `page 2 has items (got ${page2.length})`,
    page2.length > 0,
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
