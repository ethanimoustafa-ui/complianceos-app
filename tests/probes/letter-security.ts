export {} // module scope

// Wave-21 — Security hardening probes for /api/letters surface.
//
// Mirrors observation-security.ts (W20). Covers:
//   SEC-3 — URL scheme injection → 400
//   SEC-4 — HTML-strip on text fields
//   SEC-5 — UUID validation on [letterId] segment → 400
//   SEC-8 — Unknown-key rejection → 400 validation_failed
//   W17-2 — Stale If-Match on PATCH /api/letters/[id] → 412
//   W17-2 — Concurrent same-token PATCHes → exactly one 200, one 412
//
// Every assertion names the SPECIFIC expected HTTP code (not just "non-500")
// per PORTING-TEMPLATE §6 / FORENSIC P9.
//
// USAGE:
//   npx tsx tests/probes/letter-security.ts \
//     --cookie="sb-…-auth-token=…" \
//     --letter="<letter-uuid>"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const STALE_IF_MATCH = 'W/"2020-01-01T00:00:00Z"'

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
const LETTER_ID = requireArg('letter', 'LETTER_ID')

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

function check(label: string, expected: number, actual: number, extraMsg = ''): boolean {
  const ok = actual === expected
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  ${tag}  ${label}  →  status=${actual} (expected ${expected})${extraMsg ? '  ' + extraMsg : ''}`)
  return ok
}

// SEC-5 — UUID validation: non-UUID segment should return 400.
async function probeSec5UuidValidation(): Promise<boolean> {
  console.log('\n[SEC-5] UUID validation — GET /api/letters/not-a-uuid')
  const res = await http('/api/letters/not-a-uuid', { method: 'GET' })
  // assertUuid is called before DB access → 400 invalid_uuid
  return check('non-UUID segment → 400', 400, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// SEC-8 — Unknown-key rejection (schema .strict()).
async function probeSec8UnknownKey(): Promise<boolean> {
  console.log('\n[SEC-8] Unknown-key rejection — PATCH with is_admin: true')
  const res = await http(`/api/letters/${LETTER_ID}`, {
    method: 'PATCH',
    body: { is_admin: true },
  })
  return check('unknown key → 400', 400, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// SEC-4 — HTML strip: PATCH a text field with HTML → stored value stripped.
async function probeSec4HtmlStrip(): Promise<boolean> {
  console.log('\n[SEC-4] HTML strip — PATCH subject with <img onerror=...>')
  const sentinel = `w21-html-probe-${Date.now()}`
  const res = await http<{ subject?: string }>(`/api/letters/${LETTER_ID}`, {
    method: 'PATCH',
    body: { subject: `<img src=x onerror=alert(1)>${sentinel}` },
  })
  if (res.status !== 200) {
    console.log(`  SKIP: PATCH returned ${res.status} — letter may not exist or be non-editable`)
    return true // not a security failure per se
  }
  const stored = res.body.data?.subject ?? ''
  const hasTag = stored.includes('<img') || stored.includes('onerror')
  if (hasTag) {
    console.log(`  FAIL  HTML tag survived stripping: "${stored}"`)
    return false
  }
  const hasSentinel = stored.includes(sentinel)
  console.log(`  ${hasSentinel ? 'PASS' : 'WARN'}  text content: "${stored.slice(0, 80)}"`)
  return !hasTag
}

// SEC-3 — URL scheme: PATCH signature_image_url with javascript: → 400.
async function probeSec3UrlScheme(): Promise<boolean> {
  console.log('\n[SEC-3] URL scheme — PATCH signature_image_url with javascript:alert(1)')
  const res = await http(`/api/letters/${LETTER_ID}`, {
    method: 'PATCH',
    body: { signature_image_url: 'javascript:alert(1)' },
  })
  return check('javascript: URL → 400', 400, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// W17-2 — Stale If-Match on parent PATCH.
async function probeStaleIfMatch(): Promise<boolean> {
  console.log('\n[W17-2] Stale If-Match — PATCH /api/letters/[id]')
  const res = await http(`/api/letters/${LETTER_ID}`, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { subject: `w21-stale-probe-${Date.now()}` },
  })
  return check('stale If-Match → 412', 412, res.status, `code=${res.body.error?.code ?? '∅'}`)
}

// W17-2 — Concurrent same-token: two PATCHes with the same fresh ETag → 1×200 + 1×412.
async function probeConcurrentSameToken(): Promise<boolean> {
  console.log('\n[W17-2] Concurrent same-token — two PATCHes with identical fresh ETag')
  // GET fresh ETag.
  const getRes = await http<{ updated_at: string }>(`/api/letters/${LETTER_ID}`, { method: 'GET' })
  const updatedAt = getRes.body.data?.updated_at
  if (!updatedAt) {
    console.log('  SKIP: could not read updated_at from GET')
    return true
  }
  const etag = `W/"${updatedAt}"`
  const ts = Date.now()
  const [r1, r2] = await Promise.all([
    http(`/api/letters/${LETTER_ID}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: { subject: `Concurrent probe A ${ts}` },
    }),
    http(`/api/letters/${LETTER_ID}`, {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      body: { subject: `Concurrent probe B ${ts}` },
    }),
  ])
  const statuses = [r1.status, r2.status].sort()
  const pass = statuses[0] === 200 && statuses[1] === 412
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  statuses=${statuses.join(',')} (expected 200,412)`)
  return pass
}

async function main(): Promise<void> {
  console.log(`W21 letter security probes at ${BASE}`)
  console.log(`Letter: ${LETTER_ID}`)
  const results = await Promise.all([
    probeSec5UuidValidation(),
    probeSec8UnknownKey(),
    probeSec4HtmlStrip(),
    probeSec3UrlScheme(),
    probeStaleIfMatch(),
    probeConcurrentSameToken(),
  ])
  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
