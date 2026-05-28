export {} // module scope

// P7 (W30) — Policy document uploaded at create time must persist.
//
// Verifies that:
//   1. Create a policy.
//   2. POST /api/policies/{id}/attachments with a file payload → 201.
//   3. GET /api/policies/{id} → attachments array is non-empty.
//   4. Attachment has the correct name.
//   5. Cleanup.
//
// NOTE: The client-side fix (RegisterPolicyModal) calls addAttachment AFTER
// create with the newPolicy.id. This probe tests the API path that the fixed
// modal follows, not the modal UI directly.
//
// USAGE:
//   npx tsx tests/probes/policy-attachment-at-create-p7.ts --cookie="sb-…=…"

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
function checkTrue(label: string, actual: boolean, detail?: string): boolean {
  console.log(`  ${actual ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  return actual
}

interface PolicyRow { id: string; attachments?: Array<{ id: string; name: string }> }
interface AttachmentRow { id: string; name: string }

async function main(): Promise<void> {
  console.log(`policy-attachment-at-create-p7 probe at ${BASE}\n`)
  const results: boolean[] = []

  // 1. Create policy
  console.log('[1] Create policy')
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: `P7-attachment-at-create-${Date.now()}`,
      description: 'Attachment at create probe (P7 W30)',
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

  // 2. POST attachment (mirrors the RegisterPolicyModal client flow post-create)
  console.log('\n[2] POST /api/policies/{id}/attachments → 201')
  const fileName = `policy-document-${Date.now()}.pdf`
  const attachRes = await http<AttachmentRow>(`/api/policies/${policyId}/attachments`, {
    method: 'POST',
    body: {
      name: fileName,
      storage_path: 'data:application/pdf;base64,JVBERi0=',
      size: 1234,
    },
  })
  results.push(check('POST /attachments → 201', 201, attachRes.status))
  const attachId = (attachRes.body.data as AttachmentRow | undefined)?.id
  results.push(checkTrue(
    'Attachment row has an id',
    typeof attachId === 'string' && attachId.length > 0,
    `id=${attachId ?? 'null'}`,
  ))

  // 3. GET policy detail → attachments array is non-empty
  console.log('\n[3] GET policy detail → attachment persisted')
  const detailRes = await http<PolicyRow>(`/api/policies/${policyId}`)
  results.push(check('GET /api/policies/{id} → 200', 200, detailRes.status))
  const atts = (detailRes.body.data as PolicyRow | undefined)?.attachments ?? []
  results.push(checkTrue(
    'Attachments array is non-empty',
    atts.length > 0,
    `count=${atts.length}`,
  ))
  results.push(checkTrue(
    'Attachment has the correct filename',
    atts.some((a) => a.name === fileName),
    `found=${atts.some((a) => a.name === fileName)}`,
  ))

  // 4. Cleanup
  console.log('\n[4] Cleanup')
  const delRes = await http(`/api/policies/${policyId}`, { method: 'DELETE' })
  results.push(check('DELETE /api/policies → 200', 200, delRes.status))

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
