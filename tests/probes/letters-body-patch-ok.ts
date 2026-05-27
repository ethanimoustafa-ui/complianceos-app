export {} // module scope

// W27.1 — L3-NIT-A regression guard.
//
// Asserts that body-only and subject-only PATCH requests return 200 (not 400).
// The bug: UpdateLetterSchema used PlainTextMin (min(1)) for body/subject,
// causing 400 when an empty draft editor sent '' for those fields.
// Fix: changed to PlainText (no min) in the Update schema. This probe
// confirms the fix by PATCHing with content_en only, content_ar only,
// and an empty body — all should return 200.
//
// USAGE:
//   npx tsx tests/probes/letters-body-patch-ok.ts --cookie="sb-…=…"

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

interface LetterRow {
  id: string
  reference: string
  status: string
  updated_at: string
}

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T>; headers: Headers }> {
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
  return { status: res.status, body, headers: res.headers }
}

function check(label: string, expected: number, actual: number, detail = ''): boolean {
  const ok = actual === expected
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${detail ? '  ' + detail : ''}`,
  )
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW27.1 L3-NIT-A probe: body PATCH returns 200 at ${BASE}\n`)
  const results: boolean[] = []

  // Create a fresh draft letter for probing
  const tag = `w27.1-probe-${Date.now()}`
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `${tag} subject`,
      body: `${tag} initial body`,
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters → 201 (create probe letter)', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id
  if (!letterId) {
    console.error('  FATAL: no letterId returned — aborting')
    process.exitCode = 1
    return
  }

  // GET the fresh letter to capture ETag
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('GET /api/letters/:id → 200', 200, getRes.status))
  const etag = getRes.headers.get('etag') ?? undefined

  // --- Test 1: body-only PATCH (the primary failing case)
  console.log('\n[1] body-only PATCH with EN body text:')
  const patch1 = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { body: 'Updated body — EN only PATCH test.' },
    headers: etag ? { 'If-Match': etag } : {},
  })
  results.push(check('PATCH { body: "..." } → 200 (was 400)', 200, patch1.status,
    patch1.status !== 200 ? `body=${JSON.stringify(patch1.body)}` : ''))
  const etag2 = patch1.headers.get('etag') ?? etag

  // --- Test 2: body_ar only PATCH
  console.log('\n[2] body_ar-only PATCH:')
  const patch2 = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { body_ar: 'النص المحدث — اختبار التصحيح بالعربية فقط.' },
    headers: etag2 ? { 'If-Match': etag2 } : {},
  })
  results.push(check('PATCH { body_ar: "..." } → 200', 200, patch2.status,
    patch2.status !== 200 ? `body=${JSON.stringify(patch2.body)}` : ''))
  const etag3 = patch2.headers.get('etag') ?? etag2

  // --- Test 3: empty body PATCH (blank draft — the original trigger for 400)
  console.log('\n[3] empty body PATCH (blank draft scenario):')
  const patch3 = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { body: '', subject: '' },
    headers: etag3 ? { 'If-Match': etag3 } : {},
  })
  results.push(check('PATCH { body: "", subject: "" } → 200 (blank draft)', 200, patch3.status,
    patch3.status !== 200 ? `body=${JSON.stringify(patch3.body)}` : ''))

  // Cleanup
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })

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
