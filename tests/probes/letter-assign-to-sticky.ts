export {} // module scope

// W28.1-L6: Letter assignee picker stickiness.
//
// Root cause: the EditableSelect assignee picker used `m.name` as the item id,
// but `assigned_to` is a uuid FK column (→ profiles) and UpdateLetterSchema
// validates it with Uuid.nullable().optional(). Sending a display-name string
// caused a 400 validation_failed, the store rolled back the optimistic update,
// and the sidebar reverted to "Unassigned".
//
// Fix: items now use `m.id` (UUID) as the picker value; the display resolves
// the UUID back to a name via teamMembers.
//
// This probe validates the API-layer invariant:
//   1. PATCH /api/letters/:id with a valid UUID in assigned_to returns 200.
//   2. The GET after PATCH reflects the UUID in assigned_to.
//   3. PATCH with a display-name string (old behaviour) returns 422/400 —
//      confirming the schema still enforces UUID-only (no regression).
//
// USAGE:
//   npx tsx tests/probes/letter-assign-to-sticky.ts --cookie="sb-…=…"

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

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

interface LetterRow {
  id: string
  reference: string
  assigned_to: string | null
  updated_at: string
}

interface TeamMemberRow {
  id: string
  name: string
  status: string
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
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body, headers: res.headers }
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
  console.log(`\nW28.1-L6 letter-assign-to-sticky probe at ${BASE}\n`)
  const results: boolean[] = []

  // Look up an active team member to use as the assignee
  console.log('[0] GET /api/team/members — find an active member UUID')
  const teamRes = await http<TeamMemberRow[]>('/api/team/members')
  const members = Array.isArray(teamRes.body.data) ? teamRes.body.data : []
  const activeMember = members.find((m) => m.status === 'active')
  if (!activeMember) {
    console.error('  FATAL: no active team members found — cannot probe assigned_to')
    process.exitCode = 1
    return
  }
  console.log(`  Using member: ${activeMember.name} (${activeMember.id})`)

  // Create a fresh draft letter
  console.log('\n[1] POST /api/letters — create probe letter')
  const tag = `w28.1-L6-assign-probe-${Date.now()}`
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `${tag} subject`,
      body: `${tag} body`,
      priority: 'standard',
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters → 201', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id
  if (!letterId) {
    console.error('  FATAL: no letterId — aborting')
    process.exitCode = 1
    return
  }

  // GET to capture ETag
  const getRes = await http<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('GET /api/letters/:id → 200', 200, getRes.status))
  const etag = getRes.headers.get('etag') ?? undefined

  // [2] PATCH with a valid UUID (the fixed behaviour)
  console.log('\n[2] PATCH assigned_to with valid UUID → should return 200')
  const patchRes = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { assigned_to: activeMember.id },
    headers: etag ? { 'If-Match': etag } : {},
  })
  results.push(check(
    `PATCH { assigned_to: "<uuid>" } → 200 (fixed — was 400 when name-string sent)`,
    200,
    patchRes.status,
    patchRes.status !== 200 ? `body=${JSON.stringify(patchRes.body)}` : '',
  ))
  results.push(checkEq(
    'PATCH response has assigned_to = member UUID',
    activeMember.id,
    (patchRes.body.data as LetterRow | undefined)?.assigned_to,
  ))
  const etag2 = patchRes.headers.get('etag') ?? etag

  // [3] GET after PATCH — assigned_to persists
  console.log('\n[3] GET /api/letters/:id — assigned_to persists after PATCH')
  const getRes2 = await http<LetterRow>(`/api/letters/${letterId}`)
  results.push(check('GET /api/letters/:id after PATCH → 200', 200, getRes2.status))
  results.push(checkEq(
    'assigned_to persists in GET (= member UUID)',
    activeMember.id,
    (getRes2.body.data as LetterRow | undefined)?.assigned_to,
  ))

  // [4] PATCH with a display-name string (the OLD broken behaviour) — must still
  // return 400/422 so the schema guard is confirmed intact.
  console.log('\n[4] PATCH assigned_to with display-name string → should return 400/422 (schema guard)')
  const patchBadRes = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { assigned_to: activeMember.name },
    headers: etag2 ? { 'If-Match': etag2 } : {},
  })
  results.push(checkTrue(
    'PATCH with name-string returns 400 or 422 (schema rejects non-UUID)',
    patchBadRes.status === 400 || patchBadRes.status === 422,
    `got ${patchBadRes.status}`,
  ))

  // [5] PATCH assigned_to to null — should clear the assignee
  console.log('\n[5] PATCH assigned_to=null → clear assignee')
  const patchNullRes = await http<LetterRow>(`/api/letters/${letterId}`, {
    method: 'PATCH',
    body: { assigned_to: null },
    headers: etag2 ? { 'If-Match': etag2 } : {},
  })
  results.push(check(
    'PATCH { assigned_to: null } → 200 (clear assignee)',
    200,
    patchNullRes.status,
    patchNullRes.status !== 200 ? `body=${JSON.stringify(patchNullRes.body)}` : '',
  ))
  results.push(checkEq(
    'PATCH response has assigned_to = null after clear',
    null,
    (patchNullRes.body.data as LetterRow | undefined)?.assigned_to ?? null,
  ))

  // Cleanup
  console.log('\n[Cleanup]')
  await http(`/api/letters/${letterId}`, { method: 'DELETE' })
  console.log('  deleted probe letter')

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
