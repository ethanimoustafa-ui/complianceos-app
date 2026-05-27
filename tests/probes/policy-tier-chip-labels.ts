export {} // module scope

// W28.1-P2: Policy tier chip labels — no raw key leakage in the list view.
//
// Verifies that each policy row returned by GET /api/policies carries
// a `approval_tier` value that, when routed through the static fallback map,
// would NOT pass through verbatim. The root cause was that `managerial` and
// `audit_committee` were missing from both `POLICY_APPROVAL_TIER_KEYS` (the
// static fallback in lib/format/enum.ts) and `TIER_COLORS` (in RegDocCard.tsx),
// so `formatPolicyApprovalTier` returned the raw key unchanged.
//
// API-layer assertions:
//   1. GET /api/policies returns 200 and an array of rows.
//   2. Every row's `approval_tier` is a recognised key (not an unknown value
//      that would cause the chip to display raw lowercase e.g. "managerial").
//      Known keys: board, agm, managerial, sharia, audit_committee, management.
//   3. Creates a probe policy with tier=managerial, asserts it round-trips
//      correctly (the stored value comes back as "managerial" not silently
//      coerced or rejected).
//
// USAGE:
//   npx tsx tests/probes/policy-tier-chip-labels.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}

const COOKIE = readCookie()

// Known tier keys — every stored value must be in this set so the static map
// (and TIER_COLORS) covers it and the chip renders a Title-Cased label.
const KNOWN_TIER_KEYS = new Set([
  'board', 'agm', 'managerial', 'sharia', 'audit_committee',
  // `management` is the legacy key (pre-migration-074); still valid for rows
  // seeded before the rename. The static map covers it.
  'management',
])

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

interface PolicyRow {
  id: string
  name: string
  approval_tier: string
  updated_at?: string
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

function check(label: string, expected: number, actual: number, detail = ''): boolean {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${detail ? '  ' + detail : ''}`,
  )
  return ok
}

function checkEq(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  "${String(actual)}" (expected "${String(expected)}")`,
  )
  return ok
}

function checkTrue(label: string, value: boolean, detail = ''): boolean {
  console.log(`  ${value ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  return value
}

async function main(): Promise<void> {
  console.log(`\nW28.1-P2 policy-tier-chip-labels probe at ${BASE}\n`)
  const results: boolean[] = []

  // [1] GET /api/policies — list view
  console.log('[1] GET /api/policies (list view)')
  const listRes = await http<PolicyRow[]>('/api/policies')
  results.push(check('GET /api/policies → 200', 200, listRes.status))

  const policies = Array.isArray(listRes.body.data) ? listRes.body.data : []
  console.log(`     Found ${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}`)

  // [2] Walk every row and assert the tier key is in our known set
  console.log('\n[2] Tier key coverage — no raw-key leak')
  let unknownTierFound = false
  for (const p of policies) {
    const tier = p.approval_tier
    if (tier && !KNOWN_TIER_KEYS.has(tier)) {
      console.log(`  FAIL  Unknown tier key "${tier}" on policy "${p.name}" (${p.id})`)
      unknownTierFound = true
    }
  }
  results.push(checkTrue(
    'All existing policy rows have a recognised tier key',
    !unknownTierFound,
    unknownTierFound ? '(one or more rows have an unknown tier key — chip would show raw lowercase)' : '',
  ))

  // [3] Create a probe policy with tier=managerial and assert round-trip
  console.log('\n[3] POST /api/policies with approval_tier=managerial')
  const tag = `w28.1-P2-tier-probe-${Date.now()}`
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: tag,
      description: 'Probe policy — tier chip label test',
      category: 'Operational',
      approval_tier: 'managerial',
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check('POST /api/policies (tier=managerial) → 201', 201, createRes.status,
    createRes.status !== 201 ? `body=${JSON.stringify(createRes.body)}` : ''))

  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  if (policyId) {
    // Verify GET returns managerial (not silently coerced)
    console.log('\n[4] GET /api/policies/:id — managerial tier round-trips correctly')
    const getRes = await http<PolicyRow>(`/api/policies/${policyId}`)
    results.push(check('GET /api/policies/:id → 200', 200, getRes.status))
    results.push(checkEq(
      'approval_tier=managerial in GET response',
      'managerial',
      (getRes.body.data as PolicyRow | undefined)?.approval_tier,
    ))

    // [5] PATCH to audit_committee
    console.log('\n[5] PATCH approval_tier → audit_committee')
    const patchRes = await http<PolicyRow>(`/api/policies/${policyId}`, {
      method: 'PATCH',
      body: { approval_tier: 'audit_committee' },
    })
    results.push(check('PATCH approval_tier=audit_committee → 200', 200, patchRes.status,
      patchRes.status !== 200 ? `body=${JSON.stringify(patchRes.body)}` : ''))
    results.push(checkEq(
      'approval_tier=audit_committee in PATCH response',
      'audit_committee',
      (patchRes.body.data as PolicyRow | undefined)?.approval_tier,
    ))

    // Cleanup
    console.log('\n[Cleanup]')
    await http(`/api/policies/${policyId}`, { method: 'DELETE' })
    console.log('  deleted probe policy')
  } else {
    console.log('  SKIP: no policyId — skipping GET/PATCH/cleanup assertions')
    results.push(false) // mark as failed if create returned no id
  }

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(
    `\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`,
  )
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
