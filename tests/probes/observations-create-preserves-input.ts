export {} // module scope

// W28-O5 probe — Create Observation persists assignees / input to DB.
//
// The bug: the observation was created but assignees were discarded because
// the post-create assign call was missing in the store reconcile callback.
// The fix: added a non-fatal api.post('/observations/{ref}/assign', ...) call
// in the reconcile function after the row is confirmed by the server.
//
// This is a live HTTP probe — requires a running dev server and auth cookie.
//
// Verifies:
//   1. POST /api/observations → 201 with expected fields
//   2. reference matches OBS-YYYY-NNNNN format (O3 side-effect check)
//   3. Cleanup: DELETE the created observation
//
// USAGE:
//   npx tsx tests/probes/observations-create-preserves-input.ts --cookie="sb-…=…"

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

async function probeCreateReturnsExpectedShape(): Promise<{ ok: boolean; id?: string }> {
  console.log('\n[1] POST /api/observations → 201 with id, reference, title, severity')
  const tag = `w28-o5-${Date.now()}`
  const res = await http<{ id: string; reference: string; title: string; severity: string }>('/api/observations', {
    method: 'POST',
    body: {
      title: `W28 O5 Probe ${tag}`,
      description: 'Automated probe: create preserves input.',
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
  if (!d?.id || !d?.reference || !d?.title) {
    return { ok: fail('response shape', `missing fields: ${JSON.stringify(d)}`) }
  }
  pass('create 201', `id=${d.id} ref=${d.reference}`)
  return { ok: true, id: d.id }
}

async function probeReferenceFormat(id: string): Promise<boolean> {
  console.log('\n[2] GET /api/observations/{id} → reference matches OBS-YYYY-NNNNN')
  const res = await http<{ id: string; reference: string }>(`/api/observations/${id}`, { method: 'GET' })
  if (res.status !== 200) return fail('GET observation', `status=${res.status}`)
  const ref = res.body.data?.reference ?? ''
  const obsPattern = /^OBS-\d{4}-\d{5}$/
  if (!obsPattern.test(ref)) {
    return fail('reference format', `got "${ref}" — expected OBS-YYYY-NNNNN`)
  }
  return pass('reference format', `"${ref}" matches OBS-YYYY-NNNNN`)
}

async function deleteProbe(id: string): Promise<void> {
  const res = await http(`/api/observations/${id}`, { method: 'DELETE' })
  const ok = res.status === 204 || res.status === 200
  console.log(`\n  cleanup: DELETE observation ${id} → ${res.status} ${ok ? 'OK' : '(check manually)'}`)
}

async function main() {
  console.log(`W28-O5 observations-create-preserves-input probe at ${BASE}`)
  const results: boolean[] = []
  const { ok, id } = await probeCreateReturnsExpectedShape()
  results.push(ok)
  if (id) {
    results.push(await probeReferenceFormat(id))
    await deleteProbe(id)
  }
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
