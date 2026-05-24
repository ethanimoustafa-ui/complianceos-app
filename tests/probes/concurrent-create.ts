export {} // make this file a module (so top-level `const BASE` is scoped)

// W17-V4 (SEC-11): fire 10 concurrent POST `/api/circulars` and verify
//   - every response is 201
//   - every `reference` value is unique
//   - the suffix counter is monotonically increasing within the batch
//   - zero 500s
//
// USAGE:
//   1. Make sure the dev server is running (http://localhost:3000).
//   2. Get a logged-in session cookie. The simplest way is to log in via the
//      browser, open DevTools → Application → Cookies, and copy the
//      `sb-<project>-auth-token` cookie value. Pass it on the command line:
//        npx tsx tests/probes/concurrent-create.ts --cookie="sb-…-auth-token=…"
//      OR set env var COOKIE before running.
//
// CLEANUP: the probe deletes the 10 rows it created (soft-delete via the
// app's own DELETE handler if a circular id is returned).

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  console.error(
    'No cookie supplied. Set COOKIE env var or pass --cookie="..." on the cmd line.',
  )
  process.exit(2)
}

const COOKIE = readCookie()

interface CreateResult {
  status: number
  reference?: string
  id?: string
  error?: string
}

async function createOne(idx: number): Promise<CreateResult> {
  const payload = {
    authority: 'SAMA',
    title: `W17-V4 probe ${idx} ${Date.now()}`,
    priority: 'low',
    status: 'pending',
    applicability: 'pending',
    departments: [],
    progress: 0,
    issuance_date: '2026-01-01',
    due_date: '2026-12-31',
    cap_status: 'not-started',
    framework_ids: [],
  }
  try {
    const res = await fetch(`${BASE}/api/circulars`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: COOKIE,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      return { status: res.status, error: text.slice(0, 200) }
    }
    const parsed = (await res.json()) as { data?: { id?: string; reference?: string } }
    return {
      status: res.status,
      reference: parsed.data?.reference,
      id: parsed.data?.id,
    }
  } catch (e) {
    return { status: 0, error: String(e) }
  }
}

async function deleteOne(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/circulars/${id}`, {
      method: 'DELETE',
      headers: { cookie: COOKIE },
    })
  } catch {
    // best effort
  }
}

function tail(ref: string): number | null {
  const m = ref.match(/(\d+)$/)
  if (!m) return null
  return Number(m[1])
}

async function main(): Promise<void> {
  console.log(`Firing 10 concurrent POST /api/circulars at ${BASE} ...`)
  const start = Date.now()
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => createOne(i)),
  )
  const ms = Date.now() - start
  console.log(`Done in ${ms}ms.\n`)

  let failures = 0
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    console.log(
      `[${i}] status=${r.status} ref=${r.reference ?? '∅'}${r.error ? ` err=${r.error}` : ''}`,
    )
    if (r.status !== 201) failures++
  }

  const refs = results.map((r) => r.reference).filter((x): x is string => !!x)
  const uniq = new Set(refs)
  const allUnique = uniq.size === refs.length

  const tails = refs.map((r) => tail(r) ?? -1).sort((a, b) => a - b)
  const monotonic = tails.every((n, i) => i === 0 || n > tails[i - 1])

  console.log(`\nUnique references: ${uniq.size}/${refs.length} (${allUnique ? 'PASS' : 'FAIL'})`)
  console.log(`Monotonic suffixes (sorted): ${tails.join(', ')} (${monotonic ? 'PASS' : 'FAIL'})`)
  console.log(`Zero 500s: ${results.every((r) => r.status !== 500) ? 'PASS' : 'FAIL'}`)
  console.log(`All 201s:  ${results.every((r) => r.status === 201) ? 'PASS' : 'FAIL'}`)

  // Cleanup.
  console.log('\nCleaning up created rows ...')
  const ids = results.map((r) => r.id).filter((x): x is string => !!x)
  await Promise.all(ids.map((id) => deleteOne(id)))
  console.log(`Deleted ${ids.length} rows.`)

  if (failures > 0 || !allUnique || !monotonic) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
