export {} // module scope

// P6 (W29) — Policy archive tag + filter probe.
//
// Verifies that:
//   1. Create two policies (A and B).
//   2. Archive policy A via PATCH /api/policies/{idA} { archived_at: <iso> }.
//   3. GET /api/policies?archive_filter=active → returns B but NOT A.
//   4. GET /api/policies?archive_filter=archived → returns A but NOT B.
//   5. GET /api/policies?archive_filter=all → returns both A and B.
//   6. Unarchive policy A via PATCH /api/policies/{idA} { archived_at: null }.
//   7. GET ?archive_filter=active → A is back.
//   8. GET /api/policies/{idA} → row includes `archived_at` field (not null).
//      (After step 6: archived_at should be null again.)
//   9. Cleanup both.
//
// USAGE:
//   npx tsx tests/probes/policy-archive-filter.ts --cookie="sb-…=…"
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

interface PolicyRow { id: string; archived_at?: string | null }

async function main(): Promise<void> {
  console.log(`policy-archive-filter probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create two policies
  console.log('[1] Create two policies')
  const tag = Date.now()
  const [resA, resB] = await Promise.all([
    http<PolicyRow>('/api/policies', {
      method: 'POST',
      body: {
        name: `P6-archive-probe-A-${tag}`,
        description: 'Archive filter probe policy A',
        category: 'Operational',
        approval_tier: 'board',
        version: 'v1.0',
        framework_ids: [],
        affected_departments: [],
      },
    }),
    http<PolicyRow>('/api/policies', {
      method: 'POST',
      body: {
        name: `P6-archive-probe-B-${tag}`,
        description: 'Archive filter probe policy B',
        category: 'Operational',
        approval_tier: 'board',
        version: 'v1.0',
        framework_ids: [],
        affected_departments: [],
      },
    }),
  ])
  results.push(check('POST /api/policies A → 201', 201, resA.status))
  results.push(check('POST /api/policies B → 201', 201, resB.status))
  const idA = (resA.body.data as PolicyRow | undefined)?.id
  const idB = (resB.body.data as PolicyRow | undefined)?.id
  if (!idA || !idB) { console.error('  FATAL: missing policy ids'); process.exitCode = 1; return }

  // 2. Archive policy A
  console.log('\n[2] Archive policy A')
  const archiveTs = new Date().toISOString()
  const archiveRes = await http(`/api/policies/${idA}`, {
    method: 'PATCH',
    body: { archived_at: archiveTs },
  })
  results.push(check('PATCH archived_at on A → 200', 200, archiveRes.status))

  // 3. GET ?archive_filter=active — B present, A absent
  console.log('\n[3] GET ?archive_filter=active')
  const activeRes = await http<PolicyRow[]>(`/api/policies?archive_filter=active`)
  results.push(check('GET ?archive_filter=active → 200', 200, activeRes.status))
  const activeRows = Array.isArray(activeRes.body.data) ? activeRes.body.data : []
  results.push(checkTrue('B in active list', activeRows.some((r) => r.id === idB)))
  results.push(checkTrue('A NOT in active list (archived)', !activeRows.some((r) => r.id === idA)))

  // 4. GET ?archive_filter=archived — A present, B absent
  console.log('\n[4] GET ?archive_filter=archived')
  const archivedRes = await http<PolicyRow[]>(`/api/policies?archive_filter=archived`)
  results.push(check('GET ?archive_filter=archived → 200', 200, archivedRes.status))
  const archivedRows = Array.isArray(archivedRes.body.data) ? archivedRes.body.data : []
  results.push(checkTrue('A in archived list', archivedRows.some((r) => r.id === idA)))
  results.push(checkTrue('B NOT in archived list', !archivedRows.some((r) => r.id === idB)))

  // 5. GET ?archive_filter=all — both present
  console.log('\n[5] GET ?archive_filter=all')
  const allRes = await http<PolicyRow[]>(`/api/policies?archive_filter=all`)
  results.push(check('GET ?archive_filter=all → 200', 200, allRes.status))
  const allRows = Array.isArray(allRes.body.data) ? allRes.body.data : []
  results.push(checkTrue('A in all list', allRows.some((r) => r.id === idA)))
  results.push(checkTrue('B in all list', allRows.some((r) => r.id === idB)))

  // 6. Unarchive policy A
  console.log('\n[6] Unarchive policy A')
  const unarchiveRes = await http(`/api/policies/${idA}`, {
    method: 'PATCH',
    body: { archived_at: null },
  })
  results.push(check('PATCH archived_at=null on A → 200', 200, unarchiveRes.status))

  // 7. GET ?archive_filter=active — A is back
  console.log('\n[7] GET ?archive_filter=active after unarchive')
  const activeRes2 = await http<PolicyRow[]>(`/api/policies?archive_filter=active`)
  const activeRows2 = Array.isArray(activeRes2.body.data) ? activeRes2.body.data : []
  results.push(checkTrue('A back in active list after unarchive', activeRows2.some((r) => r.id === idA)))

  // 8. GET detail of A — archived_at is null
  console.log('\n[8] GET detail of A — archived_at is null')
  const detailRes = await http<PolicyRow>(`/api/policies/${idA}`)
  results.push(check('GET /api/policies/{idA} → 200', 200, detailRes.status))
  const archivedAt = (detailRes.body.data as PolicyRow | undefined)?.archived_at
  results.push(checkTrue(
    'archived_at is null after unarchive',
    archivedAt === null || archivedAt === undefined,
    `archived_at=${String(archivedAt)}`,
  ))

  // 9. Cleanup
  console.log('\n[9] Cleanup')
  await Promise.all([
    http(`/api/policies/${idA}`, { method: 'DELETE' }),
    http(`/api/policies/${idB}`, { method: 'DELETE' }),
  ])
  console.log('  Deleted A and B')

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
