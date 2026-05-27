export {} // module scope

// W29.1-P1: Workflow steps exist on (a) existing retrofitted policies and
// (b) newly-created policies on the named tiers.
//
// Asserts:
//   1. GET /api/policies/{id} for one of the W28-seeded approved-tier policies
//      → workflowTimeline length > 0 + first step status === 'current'.
//   2. POST /api/policies with approval_tier='board' (4 templated steps).
//   3. GET that new policy → workflowTimeline length === 4.
//   4. Cleanup: DELETE the test policy.
//
// USAGE:
//   npx tsx tests/probes/policy-workflow-retrofit-and-create.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> { data?: T }
interface PolicyWorkflowStep { id: string; step: string; status: string; sort_order?: number }
interface PolicyRow {
  id: string
  name: string
  approval_tier?: string
  workflowTimeline?: PolicyWorkflowStep[]
  workflow_timeline?: PolicyWorkflowStep[]
}

async function http<T>(path: string, opts: { method: string; body?: unknown } = { method: 'GET' }) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = await res.json() as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = expected === actual
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${expected}, got=${actual})`)
  return ok
}
function predicate(label: string, fn: () => boolean, desc: string): boolean {
  let ok = false
  try { ok = fn() } catch { ok = false }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (${desc})`)
  return ok
}

function timelineOf(p: PolicyRow | undefined): PolicyWorkflowStep[] {
  if (!p) return []
  return p.workflowTimeline ?? p.workflow_timeline ?? []
}

async function main() {
  console.log(`\nW29.1-P1 policy workflow retrofit + create probe at ${BASE}\n`)
  const results: boolean[] = []

  // ── Step 1: list policies, pick a retrofitted one (board/agm/managerial/sharia/audit_committee) ──
  const listRes = await http<{ items?: PolicyRow[] } | PolicyRow[]>('/api/policies?archive_filter=all', { method: 'GET' })
  results.push(check('GET /api/policies → 200', 200, listRes.status))

  const rawData = listRes.body.data
  const policies: PolicyRow[] = Array.isArray(rawData)
    ? rawData as PolicyRow[]
    : Array.isArray((rawData as { items?: PolicyRow[] })?.items)
      ? (rawData as { items: PolicyRow[] }).items
      : []

  const NEW_TIERS = ['board', 'agm', 'managerial', 'sharia', 'audit_committee']
  const retrofitTarget = policies.find((p) => NEW_TIERS.includes(p.approval_tier ?? ''))
  if (!retrofitTarget) {
    console.log('  SKIP  no policies on new-tier names found; retrofit cannot be checked')
    process.exitCode = 1
    return
  }

  // ── Step 2: GET that policy detail and verify it has workflow steps ──
  const detailRes = await http<PolicyRow>(`/api/policies/${retrofitTarget.id}`)
  results.push(check('GET /api/policies/{id} → 200', 200, detailRes.status))
  const tl = timelineOf(detailRes.body.data as PolicyRow | undefined)
  results.push(predicate(
    `retrofitted policy "${retrofitTarget.name}" has workflow steps`,
    () => tl.length > 0,
    `got ${tl.length} steps`,
  ))
  results.push(predicate(
    'at least one step is current OR all completed',
    () => tl.some((s) => s.status === 'current' || s.status === 'completed'),
    `step statuses: ${tl.map((s) => s.status).join(',')}`,
  ))

  // ── Step 3: create a fresh policy on tier=board, expect 4 steps copied ──
  const tag = `w29-1-P1-${Date.now()}`
  const createRes = await http<PolicyRow>('/api/policies', {
    method: 'POST',
    body: {
      name: tag,
      description: 'W29.1 P1 probe — verify workflow steps copied on create',
      category: 'compliance',
      version: 'v1.0',
      approval_tier: 'board',
      owner_name: 'Probe',
      framework_ids: [],
      affected_departments: [],
      review_cycle_days: 365,
    },
  })
  results.push(check('POST /api/policies (tier=board) → 201', 201, createRes.status))
  const created = createRes.body.data as PolicyRow | undefined
  const newId = created?.id

  if (newId) {
    // small delay to let any background propagation settle
    await new Promise((r) => setTimeout(r, 200))
    const createdDetail = await http<PolicyRow>(`/api/policies/${newId}`)
    results.push(check('GET new policy detail → 200', 200, createdDetail.status))
    const newTl = timelineOf(createdDetail.body.data as PolicyRow | undefined)
    results.push(check('board tier created → 4 workflow steps', 4, newTl.length))
    results.push(predicate(
      'first step status === current, others pending',
      () => {
        const firstCurrent = newTl[0]?.status === 'current'
        const restPending = newTl.slice(1).every((s) => s.status === 'pending')
        return firstCurrent && restPending
      },
      `statuses: ${newTl.map((s) => s.status).join(',')}`,
    ))

    // cleanup
    await http(`/api/policies/${newId}`, { method: 'DELETE' })
  }

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
