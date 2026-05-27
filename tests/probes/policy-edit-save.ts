export {} // module scope

// P3 — Policy edit-save persistence probe.
//
// Verifies that PATCH /api/policies/{id} persists all editable fields and
// they round-trip correctly via GET.
//
// USAGE:
//   npx tsx tests/probes/policy-edit-save.ts --cookie="sb-…=…"

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

interface PolicyRow {
  id: string
  name: string
  description: string
  category: string
  approval_tier: string
  version: string
  next_review_date: string | null
  updated_at: string
}

async function main(): Promise<void> {
  console.log(`policy-edit-save probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create
  const baseName = `P3-edit-probe-${Date.now()}`
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: baseName,
      description: 'Original description',
      category: 'Operational',
      approval_tier: 'board',
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check('POST /api/policies → 201', 201, createRes.status))
  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  const updatedAt = (createRes.body.data as PolicyRow | undefined)?.updated_at
  if (!policyId) { console.error('  FATAL: no policyId'); process.exitCode = 1; return }

  // 2. PATCH multiple fields
  console.log('\n[2] PATCH multiple fields')
  const NEW_NAME = `${baseName}-updated`
  const NEW_DESC = 'Updated description with more detail'
  const NEW_TIER = 'sharia'
  const NEW_DATE = '2027-06-30'
  const patchRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
    method: 'PATCH',
    body: {
      name: NEW_NAME,
      description: NEW_DESC,
      approval_tier: NEW_TIER,
      next_review_date: NEW_DATE,
    },
    headers: updatedAt ? { 'If-Match': `W/"${updatedAt}"` } : {},
  })
  results.push(check('PATCH → 200', 200, patchRes.status))
  const patched = patchRes.body.data as PolicyRow | undefined
  results.push(checkEq('name patched', NEW_NAME, patched?.name))
  results.push(checkEq('description patched', NEW_DESC, patched?.description))
  results.push(checkEq('approval_tier patched', NEW_TIER, patched?.approval_tier))
  results.push(checkEq('next_review_date patched', NEW_DATE, patched?.next_review_date))

  // 3. GET — verify all fields survived round-trip
  console.log('\n[3] GET — verify round-trip')
  const getRes = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check('GET → 200', 200, getRes.status))
  const got = getRes.body.data as PolicyRow | undefined
  results.push(checkEq('GET name', NEW_NAME, got?.name))
  results.push(checkEq('GET description', NEW_DESC, got?.description))
  results.push(checkEq('GET approval_tier', NEW_TIER, got?.approval_tier))
  results.push(checkEq('GET next_review_date', NEW_DATE, got?.next_review_date))

  // 4. Cleanup
  console.log('\n[4] Cleanup')
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
