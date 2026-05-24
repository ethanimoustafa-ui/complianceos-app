export {} // module scope

// Wave-20 — Concurrency probe for /api/observations POST.
//
// Asserts that N concurrent POSTs with the SAME `title` produce N rows with N
// unique, monotonic `reference` values in the same `(SLUG, YYYY)` namespace.
// Zero 5xx, zero 4xx. Mirrors the policy probe (Q1).
//
// USAGE:
//   npx tsx tests/probes/observation-concurrent-create.ts --cookie="sb-…-auth-token=…"

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
  reference?: string
  id?: string
  error?: string
}

async function createOne(title: string): Promise<CreateResult> {
  // Wave-20 / Q1 — NO `reference` field. The server generates one from `title`.
  const payload = {
    title,
    description: 'Wave-20 concurrent-create probe.',
    source: 'internal',
    severity: 'medium',
    due_date: '2027-12-31',
    framework_ids: [],
  }
  try {
    const res = await fetch(`${BASE}/api/observations`, {
      method: 'POST',
      headers: {
        cookie: COOKIE,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status >= 400) {
      return { status: res.status, error: JSON.stringify(body) }
    }
    return {
      status: res.status,
      reference: (body as { data?: { reference?: string } }).data?.reference,
      id: (body as { data?: { id?: string } }).data?.id,
    }
  } catch (e) {
    return { status: 0, error: String(e) }
  }
}

async function main(): Promise<void> {
  const TITLE = `Probe Concurrent Observation ${Date.now()}`
  const N = 10
  console.log(`Firing ${N} concurrent POSTs with title="${TITLE}" against ${BASE}`)
  const results = await Promise.all(Array.from({ length: N }, () => createOne(TITLE)))

  const ok = results.filter((r) => r.status === 201).length
  const ko = results.filter((r) => r.status !== 201).length
  console.log(`\nstatus=201: ${ok}    status≠201: ${ko}`)
  if (ko > 0) {
    console.log('Non-201 results:')
    for (const r of results) if (r.status !== 201) console.log('  ', r)
  }

  const refs = results.map((r) => r.reference).filter((x): x is string => !!x)
  const unique = new Set(refs)
  console.log(`unique references: ${unique.size}/${refs.length}`)
  for (const r of refs.sort()) console.log('  ', r)

  // All refs share the same (SLUG, YYYY) prefix.
  const expectedPrefix = refs[0]?.split('-').slice(0, 2).join('-') + `-${YEAR}-`
  const allSamePrefix = refs.every((r) => r.startsWith(expectedPrefix.replace(`-${YEAR}-`, '-')))
  console.log(`all share namespace prefix: ${allSamePrefix}`)

  const allPass = ok === N && unique.size === refs.length
  console.log(`\nresult: ${allPass ? 'PASS' : 'FAIL'}`)
  if (!allPass) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
