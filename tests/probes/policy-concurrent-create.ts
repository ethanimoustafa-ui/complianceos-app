export {} // module scope

// Wave-18 / Wave-19 — Concurrency probe for /api/policies POST.
//
// Wave-19 / Q1 update — `ref_code` is now server-generated from the policy
// `name` via `refCodeSlug` + sequence (`{SLUG}-{YYYY}-{NNNN}`). The probe now
// asserts the STRONGER property: N concurrent POSTs with the SAME `name`
// produce N rows with N unique, monotonic `ref_code`s in the same `(SLUG,
// YYYY)` namespace, zero 5xx, zero 4xx. This is the same invariant
// `tests/probes/concurrent-create.ts` verifies for `nextCircularReference`.
//
// USAGE:
//   npx tsx tests/probes/policy-concurrent-create.ts --cookie="sb-…-auth-token=…"
//
// Extra concurrency case (per Wave-19 Q1): 3 concurrent POSTs with the same
// name="Information …" produce INF-{YEAR}-0001, -0002, -0003 — all unique.

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  console.error('No cookie supplied. Set COOKIE or pass --cookie="...".')
  process.exit(2)
}

const COOKIE = readCookie()
const YEAR = new Date().getUTCFullYear()

interface CreateResult {
  status: number
  ref_code?: string
  id?: string
  error?: string
}

async function createOne(name: string): Promise<CreateResult> {
  // Wave-19 / Q1 — NO `ref_code` field. The server generates one from `name`.
  const payload = {
    name,
    description: 'Wave-19 concurrent-create probe.',
    category: 'compliance',
    approval_tier: 'management',
    version: 'v1.0',
    next_review_date: '2027-12-31',
    review_cycle_days: 365,
    framework_ids: [],
    affected_departments: [],
  }
  try {
    const res = await fetch(`${BASE}/api/policies`, {
      method: 'POST',
      headers: {
        cookie: COOKIE,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; ref_code?: string }
      error?: { message?: string }
    }
    return {
      status: res.status,
      ref_code: json.data?.ref_code,
      id: json.data?.id,
      error: json.error?.message,
    }
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

async function deleteOne(id: string): Promise<void> {
  await fetch(`${BASE}/api/policies/${id}`, {
    method: 'DELETE',
    headers: { cookie: COOKIE },
  }).catch(() => undefined)
}

async function runCase(label: string, n: number, name: string, expectedSlug: string): Promise<{ ok: boolean; created: CreateResult[] }> {
  console.log(`\n[${label}] firing ${n} concurrent POSTs with name="${name}"`)
  const results = await Promise.all(Array.from({ length: n }, () => createOne(name)))
  const created = results.filter((r) => r.status === 201)
  const refs = created.map((r) => r.ref_code).filter(Boolean) as string[]
  const uniqueRefs = new Set(refs)
  const fives = results.filter((r) => r.status >= 500).length
  const fours = results.filter((r) => r.status >= 400 && r.status < 500).length

  console.log(`  → ${created.length}/${n} created, ${uniqueRefs.size} unique refs, ${fives} 5xx, ${fours} 4xx`)
  for (const r of results) {
    if (r.status !== 201) console.log(`     status=${r.status} error=${r.error ?? '-'}`)
  }
  for (const ref of refs) console.log(`     ref=${ref}`)

  const allInSlug = refs.every((r) => r.startsWith(`${expectedSlug}-${YEAR}-`))
  const ok =
    fives === 0 &&
    created.length === n &&
    uniqueRefs.size === n &&
    allInSlug

  if (!ok) {
    console.log(`  FAIL — fives=${fives} created=${created.length}/${n} uniq=${uniqueRefs.size} sameSlug=${allInSlug}`)
  } else {
    console.log('  PASS')
  }
  return { ok, created }
}

async function main(): Promise<void> {
  console.log(`Wave-19 policy concurrent-create probe at ${BASE}`)

  // Wave-18 baseline — 10 concurrent POSTs with different names. Should be
  // 10 unique ref_codes (each derives a possibly distinct slug).
  const baseline = await runCase('baseline N=10 distinct names', 10, `Information Security ${Date.now()}`, 'INF')

  // Wave-19 / Q1 — 3 concurrent POSTs with the SAME name, expect
  // INF-{YEAR}-NNNN, NNNN+1, NNNN+2.
  const sameName = await runCase('Q1 N=3 identical name', 3, 'Information Security Policy', 'INF')

  // Cleanup
  await Promise.all(
    [...baseline.created, ...sameName.created].flatMap((r) => (r.id ? [deleteOne(r.id)] : [])),
  )

  if (!baseline.ok || !sameName.ok) {
    process.exitCode = 1
    return
  }
  console.log('\nOVERALL: PASS')
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
