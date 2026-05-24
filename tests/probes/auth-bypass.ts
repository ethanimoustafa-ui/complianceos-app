export {} // make this file a module (so top-level `const BASE` is scoped)

// W17-V5 (SEC-12): every `/api/circulars/**` endpoint must return 401 with
// `{"error":{"code":"unauthenticated"}}` for an unauthenticated request.
//
// USAGE: `npx tsx tests/probes/auth-bypass.ts`
//
// The dev server is expected to be running on http://localhost:3000 already.
// The probe makes `credentials:'omit'` requests so no cookie is sent, then
// asserts each response is 401 with the documented error envelope. Exits
// non-zero on any deviation so this can run in CI.

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

// Synthetic UUID placeholders for dynamic segments. The auth gate runs BEFORE
// any UUID validation in every handler we audited, so even though these don't
// exist in the DB the expected response is 401, not 400 / 404.
const C = '00000000-0000-0000-0000-000000000001'
const I = '00000000-0000-0000-0000-000000000002'
const S = '00000000-0000-0000-0000-000000000003'
const T = '00000000-0000-0000-0000-000000000004'
const A = '00000000-0000-0000-0000-000000000005'

interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  // Bodies for POST/PATCH so the request isn't rejected by JSON parsing
  // before the auth gate gets to run.
  body?: unknown
}

const ENDPOINTS: Endpoint[] = [
  // Top-level list + create
  { method: 'GET',    path: `/api/circulars` },
  { method: 'POST',   path: `/api/circulars`, body: {} },
  // Single circular
  { method: 'GET',    path: `/api/circulars/${C}` },
  { method: 'PATCH',  path: `/api/circulars/${C}`, body: {} },
  { method: 'DELETE', path: `/api/circulars/${C}` },
  // Timeline
  { method: 'GET',    path: `/api/circulars/${C}/timeline` },
  { method: 'POST',   path: `/api/circulars/${C}/timeline`, body: {} },
  // Versions
  { method: 'GET',    path: `/api/circulars/${C}/versions` },
  // Attachments
  { method: 'GET',    path: `/api/circulars/${C}/attachments` },
  { method: 'POST',   path: `/api/circulars/${C}/attachments`, body: {} },
  { method: 'DELETE', path: `/api/circulars/${C}/attachments/${A}` },
  // Workflow advance / set-phase-deadline / steps
  { method: 'POST',   path: `/api/circulars/${C}/workflow/advance`, body: {} },
  { method: 'POST',   path: `/api/circulars/${C}/workflow/set-phase-deadline`, body: {} },
  { method: 'GET',    path: `/api/circulars/${C}/workflow/steps` },
  { method: 'POST',   path: `/api/circulars/${C}/workflow/steps`, body: {} },
  { method: 'POST',   path: `/api/circulars/${C}/workflow/steps/reorder`, body: {} },
  { method: 'PATCH',  path: `/api/circulars/${C}/workflow/steps/${S}`, body: {} },
  { method: 'DELETE', path: `/api/circulars/${C}/workflow/steps/${S}` },
  // Implementations (articles)
  { method: 'GET',    path: `/api/circulars/${C}/implementations` },
  { method: 'POST',   path: `/api/circulars/${C}/implementations`, body: {} },
  { method: 'PATCH',  path: `/api/circulars/${C}/implementations/${I}`, body: {} },
  { method: 'DELETE', path: `/api/circulars/${C}/implementations/${I}` },
  // Implementation children
  { method: 'GET',    path: `/api/circulars/${C}/implementations/${I}/checklist` },
  { method: 'POST',   path: `/api/circulars/${C}/implementations/${I}/checklist`, body: {} },
  { method: 'PATCH',  path: `/api/circulars/${C}/implementations/${I}/checklist/${T}`, body: {} },
  { method: 'DELETE', path: `/api/circulars/${C}/implementations/${I}/checklist/${T}` },
  { method: 'GET',    path: `/api/circulars/${C}/implementations/${I}/timeline` },
  { method: 'GET',    path: `/api/circulars/${C}/implementations/${I}/versions` },
  // Wave-18: Policies surface — auth gate must be the first check.
  { method: 'GET',    path: `/api/policies` },
  { method: 'POST',   path: `/api/policies`, body: {} },
  { method: 'GET',    path: `/api/policies/${C}` },
  { method: 'PATCH',  path: `/api/policies/${C}`, body: {} },
  { method: 'DELETE', path: `/api/policies/${C}` },
  { method: 'GET',    path: `/api/policies/${C}/activity` },
  { method: 'GET',    path: `/api/policies/${C}/versions` },
  { method: 'POST',   path: `/api/policies/${C}/versions`, body: {} },
  { method: 'GET',    path: `/api/policies/${C}/attachments` },
  { method: 'POST',   path: `/api/policies/${C}/attachments`, body: {} },
  { method: 'GET',    path: `/api/policies/${C}/attachments/${A}` },
  { method: 'DELETE', path: `/api/policies/${C}/attachments/${A}` },
  { method: 'GET',    path: `/api/policies/${C}/evidence` },
  { method: 'POST',   path: `/api/policies/${C}/evidence`, body: {} },
  { method: 'GET',    path: `/api/policies/${C}/evidence/${A}` },
  { method: 'PATCH',  path: `/api/policies/${C}/evidence/${A}`, body: {} },
  { method: 'DELETE', path: `/api/policies/${C}/evidence/${A}` },
  { method: 'GET',    path: `/api/policies/${C}/review-cycles` },
  { method: 'POST',   path: `/api/policies/${C}/review-cycles`, body: {} },
  { method: 'GET',    path: `/api/policies/${C}/review-cycles/${A}` },
  { method: 'PATCH',  path: `/api/policies/${C}/review-cycles/${A}`, body: {} },
  { method: 'DELETE', path: `/api/policies/${C}/review-cycles/${A}` },
  { method: 'GET',    path: `/api/policies/${C}/workflow` },
  { method: 'GET',    path: `/api/policies/${C}/workflow/steps` },
  { method: 'POST',   path: `/api/policies/${C}/workflow/steps`, body: {} },
  { method: 'GET',    path: `/api/policies/${C}/workflow/steps/${S}` },
  { method: 'PATCH',  path: `/api/policies/${C}/workflow/steps/${S}`, body: {} },
  { method: 'DELETE', path: `/api/policies/${C}/workflow/steps/${S}` },
  { method: 'POST',   path: `/api/policies/${C}/workflow/advance`, body: {} },
  { method: 'POST',   path: `/api/policies/${C}/workflow/set-phase-deadline`, body: {} },
  // Wave-20: Observations surface — auth gate must be the first check.
  { method: 'GET',    path: `/api/observations` },
  { method: 'POST',   path: `/api/observations`, body: {} },
  { method: 'GET',    path: `/api/observations/${C}` },
  { method: 'PATCH',  path: `/api/observations/${C}`, body: {} },
  { method: 'DELETE', path: `/api/observations/${C}` },
  { method: 'GET',    path: `/api/observations/${C}/timeline` },
  { method: 'GET',    path: `/api/observations/${C}/checklist` },
  { method: 'POST',   path: `/api/observations/${C}/checklist`, body: {} },
  { method: 'PATCH',  path: `/api/observations/${C}/checklist/${T}`, body: {} },
  { method: 'DELETE', path: `/api/observations/${C}/checklist/${T}` },
  { method: 'POST',   path: `/api/observations/${C}/comments`, body: {} },
  { method: 'PATCH',  path: `/api/observations/${C}/comments/${A}`, body: {} },
  { method: 'DELETE', path: `/api/observations/${C}/comments/${A}` },
  { method: 'GET',    path: `/api/observations/${C}/evidence` },
  { method: 'POST',   path: `/api/observations/${C}/evidence`, body: {} },
  { method: 'DELETE', path: `/api/observations/${C}/evidence/${A}` },
  { method: 'GET',    path: `/api/observations/${C}/attachments` },
  { method: 'POST',   path: `/api/observations/${C}/attachments`, body: {} },
  { method: 'DELETE', path: `/api/observations/${C}/attachments/${A}` },
  { method: 'POST',   path: `/api/observations/${C}/assign`, body: {} },
  { method: 'POST',   path: `/api/observations/${C}/close`, body: {} },
  { method: 'POST',   path: `/api/observations/${C}/reopen`, body: {} },
  { method: 'GET',    path: `/api/observations/${C}/remediation` },
  { method: 'POST',   path: `/api/observations/${C}/remediation`, body: {} },
  { method: 'PATCH',  path: `/api/observations/${C}/remediation/${A}`, body: {} },
  // Wave-19.6 — new workflow undo/reset endpoints.
  { method: 'POST',   path: `/api/circulars/${C}/workflow/undo`, body: {} },
  { method: 'POST',   path: `/api/circulars/${C}/workflow/reset`, body: {} },
  // Wave-19.7 — enum-value-definitions endpoints.
  { method: 'GET',    path: `/api/settings/enum-values?domain=policy.approval_tier` },
  { method: 'POST',   path: `/api/settings/enum-values`, body: {} },
  { method: 'PATCH',  path: `/api/settings/enum-values/${A}`, body: {} },
  { method: 'DELETE', path: `/api/settings/enum-values/${A}` },
]

interface ProbeResult {
  endpoint: Endpoint
  status: number
  bodyCode: string | null
  pass: boolean
}

async function probe(ep: Endpoint): Promise<ProbeResult> {
  const init: RequestInit = {
    method: ep.method,
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
  }
  if (ep.body !== undefined) init.body = JSON.stringify(ep.body)
  const res = await fetch(`${BASE}${ep.path}`, init)
  let bodyCode: string | null = null
  try {
    const parsed = (await res.json()) as { error?: { code?: string } }
    bodyCode = parsed?.error?.code ?? null
  } catch {
    // Not JSON — leave as null; the assertion will fail.
  }
  const pass = res.status === 401 && bodyCode === 'unauthenticated'
  return { endpoint: ep, status: res.status, bodyCode, pass }
}

async function main(): Promise<void> {
  console.log(`Probing ${ENDPOINTS.length} endpoints at ${BASE} with credentials:'omit' ...\n`)
  const results: ProbeResult[] = []
  for (const ep of ENDPOINTS) {
    results.push(await probe(ep))
  }
  let failures = 0
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL'
    if (!r.pass) failures++
    console.log(
      `${tag.padEnd(4)}  ${r.endpoint.method.padEnd(6)} ${r.endpoint.path}  →  status=${r.status} code=${r.bodyCode ?? '∅'}`,
    )
  }
  console.log(`\n${results.length - failures}/${results.length} endpoints returned 401 unauthenticated.`)
  if (failures > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Probe crashed:', err)
  process.exitCode = 2
})
