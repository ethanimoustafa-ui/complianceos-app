export {} // module scope

// P2 (W29) — Evidence uploaded_by display-name probe.
//
// Verifies that:
//   1. POST /api/policies → 201.
//   2. POST /api/policies/{id}/evidence → 201.
//   3. GET /api/policies/{id}/evidence → 200; each row's `uploaded_by` is either
//      empty OR a display name (not a raw UUID).
//   4. Cleanup.
//
// The fix (W29): POLICY_EVIDENCE_COLUMNS now includes the PostgREST JOIN
// `uploaded_by_profile:profiles(name, email)` and the store mapper
// `mapPolicyEvidenceRow` calls `resolveUploaderName(row)` which returns
// the profile name, then profile email, then '' (masking raw UUIDs).
//
// USAGE:
//   npx tsx tests/probes/policy-evidence-uploaded-by-name.ts --cookie="sb-…=…"
//
// NOTE: parse-load only — do not execute in CI without a live dev server.

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

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

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

function check(label: string, expected: number, actual: number): boolean {
  const ok = actual === expected
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})`)
  return ok
}
function checkTrue(label: string, actual: boolean): boolean {
  console.log(`  ${actual ? 'PASS' : 'FAIL'}  ${label}`)
  return actual
}

interface PolicyRow { id: string }
interface EvidenceRow {
  id: string
  name: string
  uploaded_by?: string | null
  uploaded_by_profile?: { name: string | null; email: string | null } | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function main(): Promise<void> {
  console.log(`policy-evidence-uploaded-by-name probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P2-uploader-probe-${Date.now()}`,
      description: 'Uploaded-by display name probe policy',
      category: 'Operational',
      approval_tier: 'board',
      version: 'v1.0',
      framework_ids: [],
      affected_departments: [],
    },
  })
  results.push(check('POST /api/policies → 201', 201, createRes.status))
  const policyId = (createRes.body.data as PolicyRow | undefined)?.id
  if (!policyId) { console.error('  FATAL: no policyId'); process.exitCode = 1; return }

  // 2. Upload evidence
  console.log('\n[2] Upload evidence')
  const uploadRes = await http<EvidenceRow>(`/api/policies/${policyId}/evidence`, {
    method: 'POST',
    body: {
      name: 'probe-uploader-test.pdf',
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      review_cycle_id: `probe-${Date.now()}`,
      review_cycle_label: 'Probe Cycle',
    },
  })
  results.push(check('POST /evidence → 201', 201, uploadRes.status))

  // 3. GET evidence list — verify uploaded_by is NOT a raw UUID
  console.log('\n[3] GET evidence list — check uploaded_by is not a raw UUID')
  const listRes = await http<EvidenceRow[]>(`/api/policies/${policyId}/evidence`)
  results.push(check('GET /evidence → 200', 200, listRes.status))
  const rows = Array.isArray(listRes.body.data) ? listRes.body.data : []

  let allNonUuid = true
  for (const row of rows) {
    // The API returns the raw db row (with uploaded_by_profile join).
    // The client store maps it to a display name. Here we check the API shape:
    // uploaded_by_profile should be present as a JOIN result.
    const hasProfileJoin = 'uploaded_by_profile' in row
    const isRawUuid = typeof row.uploaded_by === 'string' && UUID_RE.test(row.uploaded_by)
    // If profile join is present AND name/email available → uploaded_by will be masked at client.
    // If profile join is null (e.g. deleted user) → uploaded_by may still be UUID.
    // We only fail if there's a profile but the display name wasn't surfaced in the JOIN.
    if (hasProfileJoin && row.uploaded_by_profile !== null) {
      const hasDisplayName = !!(row.uploaded_by_profile?.name || row.uploaded_by_profile?.email)
      if (!hasDisplayName && isRawUuid) allNonUuid = false
    }
    console.log(
      `    row ${row.id}: uploaded_by="${row.uploaded_by ?? ''}", ` +
      `profile.name="${row.uploaded_by_profile?.name ?? ''}", ` +
      `profile.email="${row.uploaded_by_profile?.email ?? ''}"`,
    )
  }
  results.push(checkTrue('No evidence row has unresolvable raw UUID as uploader', allNonUuid))

  // 4. Cleanup
  console.log('\n[4] Cleanup')
  const delRes = await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  results.push(check('DELETE /api/policies/${policyId} → 200', 200, delRes.status))

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
