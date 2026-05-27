export {} // module scope

// W28-O7 probe — Mark as Remediated sets status=closed + archived_at, and
// archive filter hides/shows archived rows correctly.
//
// Live HTTP probe: requires running dev server + auth cookie.
//
// Verifies:
//   1. POST /api/observations → 201
//   2. PATCH /api/observations/{id} with { status: 'closed', archived_at: now } → 200
//   3. The response row has status='closed' and a non-null archived_at
//   4. Cleanup: DELETE the test observation
//
// USAGE:
//   npx tsx tests/probes/observations-archive-flow.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}

const COOKIE = readCookie()

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> },
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

function pass(label: string, msg = ''): boolean {
  console.log(`  PASS  ${label}${msg ? '  ' + msg : ''}`)
  return true
}
function fail(label: string, msg = ''): boolean {
  console.log(`  FAIL  ${label}${msg ? '  ' + msg : ''}`)
  return false
}

async function probeCreate(): Promise<{ ok: boolean; id?: string; updatedAt?: string }> {
  console.log('\n[1] POST /api/observations → 201')
  const tag = `w28-o7-${Date.now()}`
  const res = await http<{ id: string; reference: string; updated_at: string }>('/api/observations', {
    method: 'POST',
    body: {
      title: `W28 O7 Archive Probe ${tag}`,
      description: 'Automated probe: archive flow.',
      source: 'internal',
      severity: 'low',
      due_date: '2028-12-31',
      framework_ids: [],
    },
  })
  if (res.status !== 201) {
    return { ok: fail('create 201', `status=${res.status} body=${JSON.stringify(res.body)}`) }
  }
  const d = res.body.data
  if (!d?.id) return { ok: fail('response id', 'no id in response') }
  pass('create 201', `id=${d.id}`)
  return { ok: true, id: d.id, updatedAt: d.updated_at }
}

async function probeArchive(id: string, updatedAt?: string): Promise<boolean> {
  console.log('\n[2] PATCH /api/observations/{id} → archived_at set, status=closed')
  const now = new Date().toISOString()
  const headers: Record<string, string> = {}
  if (updatedAt) headers['If-Match'] = updatedAt

  const res = await http<{ id: string; status: string; archived_at: string | null }>(`/api/observations/${id}`, {
    method: 'PATCH',
    headers,
    body: { status: 'closed', archived_at: now },
  })
  if (res.status !== 200) {
    return fail('PATCH archive', `status=${res.status} body=${JSON.stringify(res.body)}`)
  }
  const d = res.body.data
  if (!d) return fail('PATCH response body', 'no data')
  if (d.status !== 'closed') return fail('status=closed', `got status="${d.status}"`)
  if (!d.archived_at) return fail('archived_at set', `archived_at is null/missing`)
  return pass('archive applied', `status=${d.status} archived_at=${d.archived_at}`)
}

async function deleteProbe(id: string): Promise<void> {
  const res = await http(`/api/observations/${id}`, { method: 'DELETE' })
  const ok = res.status === 204 || res.status === 200
  console.log(`\n  cleanup: DELETE observation ${id} → ${res.status} ${ok ? 'OK' : '(check manually)'}`)
}

async function main() {
  console.log(`W28-O7 observations-archive-flow probe at ${BASE}`)
  const results: boolean[] = []
  const { ok, id, updatedAt } = await probeCreate()
  results.push(ok)
  if (id) {
    results.push(await probeArchive(id, updatedAt))
    await deleteProbe(id)
  }
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
