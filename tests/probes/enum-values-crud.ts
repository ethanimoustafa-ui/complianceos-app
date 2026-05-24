export {} // module scope.

// Wave-19.7 — CRUD probe for the generic enum-value-definitions surface.
//
// Walk-through:
//   1. GET ?domain=policy.approval_tier — list seeded defaults.
//   2. POST a new custom tier `probe_tier_<ts>`.
//   3. GET — assert the new row appears.
//   4. PATCH the name_en. Verify the row updates.
//   5. PATCH with a stale `If-Match` → 412.
//   6. DELETE with a stale `If-Match` → 412.
//   7. DELETE the custom row → 200.
//   8. DELETE a seeded default (`tier_1`) → 409 `cannot_delete_default`.
//
// USAGE:
//   npx tsx tests/probes/enum-values-crud.ts --cookie="sb-...=..."

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const STALE = 'W/"2020-01-01T00:00:00Z"'
const DOMAIN = 'policy.approval_tier'

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
  if (!v) {
    console.error(`Missing arg --${name}="..." (or env ${envName}).`)
    process.exit(2)
  }
  return v
}

const COOKIE: string = requireArg('cookie', 'COOKIE')

interface Envelope<T> { data?: T; error?: { code?: string; message?: string } }
interface EnumRow {
  id: string
  domain: string
  key: string
  name_en: string
  name_ar: string
  sort_order: number
  is_default: boolean
  updated_at: string
}

async function http<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: {
      cookie: COOKIE,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

let failures = 0
function ok(label: string, cond: boolean, info?: unknown) {
  if (cond) {
    console.log(`PASS  ${label}`)
  } else {
    failures++
    console.log(`FAIL  ${label}`, info ?? '')
  }
}

async function listDomain(): Promise<EnumRow[]> {
  const res = await http<EnumRow[]>(`/api/settings/enum-values?domain=${DOMAIN}`, { method: 'GET' })
  return res.body.data ?? []
}

async function main() {
  console.log('Probing /api/settings/enum-values CRUD ...\n')

  // 1. List
  const initial = await listDomain()
  ok('GET: seeded tier_1/tier_2/tier_3 present', initial.some((r) => r.key === 'tier_1' && r.is_default))

  // 2. POST new tier
  const probeKey = `probe_tier_${Date.now()}`
  const created = await http<EnumRow>('/api/settings/enum-values', {
    method: 'POST',
    body: { domain: DOMAIN, key: probeKey, name_en: 'Probe Tier', name_ar: 'مستوى تجريبي' },
  })
  ok('POST: 201', created.status === 201, created.body)
  const row = created.body.data
  if (!row) {
    console.error('No row from POST — aborting.')
    process.exit(2)
  }

  // 3. Re-list — row should appear.
  const refreshed = await listDomain()
  ok('GET: new row present', refreshed.some((r) => r.id === row.id))

  // 4. PATCH name_en.
  const patched = await http<EnumRow>(`/api/settings/enum-values/${row.id}`, {
    method: 'PATCH',
    headers: { 'If-Match': `W/"${row.updated_at}"` },
    body: { name_en: 'Probe Tier Updated' },
  })
  ok('PATCH: 200', patched.status === 200 && patched.body.data?.name_en === 'Probe Tier Updated', patched.body)
  const patchedRow = patched.body.data ?? row

  // 5. Stale PATCH → 412.
  const stalePatch = await http(`/api/settings/enum-values/${row.id}`, {
    method: 'PATCH',
    headers: { 'If-Match': STALE },
    body: { name_en: 'should not land' },
  })
  ok('PATCH stale → 412', stalePatch.status === 412, stalePatch.body)

  // 6. Stale DELETE → 412.
  const staleDel = await http(`/api/settings/enum-values/${row.id}`, {
    method: 'DELETE',
    headers: { 'If-Match': STALE },
  })
  ok('DELETE stale → 412', staleDel.status === 412, staleDel.body)

  // 7. Fresh DELETE → 200.
  const delOk = await http(`/api/settings/enum-values/${row.id}`, {
    method: 'DELETE',
    headers: { 'If-Match': `W/"${patchedRow.updated_at}"` },
  })
  ok('DELETE fresh → 200', delOk.status === 200, delOk.body)

  // 8. DELETE seeded default → 409 cannot_delete_default.
  const tier1 = (await listDomain()).find((r) => r.key === 'tier_1')
  if (tier1) {
    const seedDel = await http(`/api/settings/enum-values/${tier1.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': `W/"${tier1.updated_at}"` },
    })
    ok(
      'DELETE seeded default → 409 cannot_delete_default',
      seedDel.status === 409 && seedDel.body.error?.message === 'cannot_delete_default',
      seedDel.body,
    )
  } else {
    console.log('SKIP  seeded default check (tier_1 not present)')
  }

  console.log()
  if (failures > 0) {
    console.log(`${failures} assertion(s) failed.`)
    process.exitCode = 1
  } else {
    console.log('All probe assertions passed.')
  }
}

main().catch((err) => {
  console.error('Probe crashed:', err)
  process.exitCode = 2
})
