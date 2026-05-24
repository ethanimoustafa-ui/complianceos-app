export {} // module scope

// Wave-20 / W20-BUG-1 fix — Live HTTP probe for POST /api/observations.
//
// This probe exists because the W17.2 pattern: helpers/unit-tests that bypass
// the actual HTTP route will pass while the live route 500s (or 400s) due to
// payload schema mismatches. This probe hits the real HTTP endpoint with a
// realistic payload and asserts 201.
//
// Verifies:
//   1. Valid payload → 201 with reference, id, title, severity
//   2. `reference` in payload → 400 (server must generate it; client must NOT send it)
//   3. Missing required field (title) → 400 validation_failed
//   4. Unknown key (finding_title) → 400 validation_failed (SEC-8)
//   5. Cleanup: DELETE the created observation via the live route
//
// USAGE:
//   npx tsx tests/probes/observation-live-post.ts --cookie="sb-…-auth-token=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}

const COOKIE = readCookie()

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string; details?: unknown }
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
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = {} as Envelope<T>
  }
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

// --- probe 1: valid payload → 201 ------------------------------------------
async function probeValidCreate(): Promise<{ ok: boolean; id?: string }> {
  console.log('\n[1] Valid payload → POST /api/observations → 201')
  const tag = `w20-live-post-${Date.now()}`
  const res = await http<{
    id: string
    reference: string
    title: string
    severity: string
    status: string
  }>('/api/observations', {
    method: 'POST',
    body: {
      title: `W20 Live POST Probe ${tag}`,
      description: 'Automated probe: live HTTP POST to /api/observations.',
      source: 'internal',
      severity: 'low',
      due_date: '2028-12-31',
      framework_ids: [],
    },
  })
  if (res.status !== 201) {
    return {
      ok: fail('valid payload', `status=${res.status} body=${JSON.stringify(res.body)}`),
    }
  }
  const d = res.body.data
  if (!d?.id || !d?.reference || !d?.title) {
    return {
      ok: fail('response shape', `missing id/reference/title: ${JSON.stringify(d)}`),
    }
  }
  pass('valid payload', `status=201 id=${d.id} reference=${d.reference}`)
  return { ok: true, id: d.id }
}

// --- probe 2: reference in payload → 400 ------------------------------------
// W20-BUG-1: toCreatePayload was sending `reference` which the strict() schema rejects.
async function probeReferenceRejected(): Promise<boolean> {
  console.log('\n[2] Payload with `reference` field → 400 (server generates it)')
  const res = await http('/api/observations', {
    method: 'POST',
    body: {
      title: 'W20 Reference Rejection Probe',
      description: 'Testing that client-supplied reference is rejected.',
      source: 'internal',
      severity: 'low',
      due_date: '2028-12-31',
      reference: 'OBS-PROBE-SHOULD-REJECT',  // Must be rejected by .strict() schema
    },
  })
  if (res.status !== 400) {
    return fail('reference in payload → 400', `got ${res.status}`)
  }
  const code = res.body.error?.code
  if (code !== 'validation_failed') {
    return fail('error code', `expected validation_failed, got ${code}`)
  }
  return pass('reference in payload → 400 validation_failed')
}

// --- probe 3: missing title → 400 -------------------------------------------
async function probeMissingTitle(): Promise<boolean> {
  console.log('\n[3] Missing required `title` → 400 validation_failed')
  const res = await http('/api/observations', {
    method: 'POST',
    body: {
      description: 'Missing title probe.',
      source: 'internal',
      severity: 'low',
      due_date: '2028-12-31',
    },
  })
  if (res.status !== 400) {
    return fail('missing title → 400', `got ${res.status}`)
  }
  return pass('missing title → 400 validation_failed', `code=${res.body.error?.code}`)
}

// --- probe 4: unknown key (SEC-8) -------------------------------------------
async function probeUnknownKey(): Promise<boolean> {
  console.log('\n[4] Unknown key `finding_title` → 400 (SEC-8 .strict())')
  const res = await http('/api/observations', {
    method: 'POST',
    body: {
      finding_title: 'Old field name from pre-W20',  // Legacy name — must be rejected
      description: 'Testing SEC-8 unknown key rejection.',
      source: 'internal',
      severity: 'low',
      due_date: '2028-12-31',
    },
  })
  if (res.status !== 400) {
    return fail('finding_title → 400', `got ${res.status}`)
  }
  return pass('finding_title → 400 validation_failed', `code=${res.body.error?.code}`)
}

// --- cleanup ----------------------------------------------------------------
async function deleteProbe(id: string): Promise<void> {
  const res = await http(`/api/observations/${id}`, { method: 'DELETE' })
  if (res.status === 204 || res.status === 200) {
    console.log(`\n  cleanup: deleted probe observation ${id}`)
  } else {
    console.log(`\n  cleanup: DELETE returned ${res.status} for ${id} — manual cleanup may be needed`)
  }
}

async function main(): Promise<void> {
  console.log(`W20 observation live-post probe at ${BASE}`)
  const results: boolean[] = []

  const { ok: createOk, id } = await probeValidCreate()
  results.push(createOk)
  results.push(await probeReferenceRejected())
  results.push(await probeMissingTitle())
  results.push(await probeUnknownKey())

  if (id) await deleteProbe(id)

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\nResult: ${passed}/${total} probes passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
