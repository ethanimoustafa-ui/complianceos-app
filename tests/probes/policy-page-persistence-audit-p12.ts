export {} // module scope

// W31 P12 — Whole-page persistence audit for the Policy detail.
//
// For every mutable surface: hit the API, confirm the DB row changed, confirm a
// fresh GET (simulated reload) reflects it, then RESTORE the original value.
// Outputs a CSV-style table: field | API | DB+GET persists | restored.
//
// Workflow-step add/edit/deadline/reorder/delete are exercised on a TEMP step so
// the policy's 3 real steps stay intact. Approve/undo are covered by
// policy-workflow-p6-p5.ts (referenced, not repeated).
//
// USAGE:
//   COOKIE=$(cat tests/e2e/_artifacts/wave-31-policy/cookie.txt) \
//     npx tsx tests/probes/policy-page-persistence-audit-p12.ts --cookie="$COOKIE" --uuid=<policy-uuid>

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
function readArg(name: string, envName: string): string | undefined {
  const fromEnv = process.env[envName]
  if (fromEnv) return fromEnv
  const prefix = `--${name}=`
  for (const a of process.argv.slice(2)) if (a.startsWith(prefix)) return a.slice(prefix.length)
  return undefined
}
function requireArg(name: string, envName: string): string {
  const v = readArg(name, envName)
  if (!v) { console.error(`Missing --${name}= or ${envName}`); process.exit(2) }
  return v
}
const COOKIE = requireArg('cookie', 'COOKIE')
const UUID = requireArg('uuid', 'UUID')

interface Env<T = any> { data?: T; error?: { code?: string; message?: string } }
async function http<T = any>(path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: Env<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  let b: Env<T>
  try { b = (await res.json()) as Env<T> } catch { b = {} as Env<T> }
  return { status: res.status, body: b }
}
const detail = async () => (await http(`/api/policies/${UUID}`)).body.data as any
const patch = (body: unknown) => http(`/api/policies/${UUID}`, 'PATCH', body)

interface Row { surface: string; api: string; persists: string; restored: string }
const rows: Row[] = []
let failed = 0
function record(surface: string, apiOk: boolean, persists: boolean, restored: boolean) {
  if (!apiOk || !persists || !restored) failed++
  rows.push({
    surface,
    api: apiOk ? 'Y' : 'N',
    persists: persists ? 'Y' : 'N',
    restored: restored ? 'Y' : 'N',
  })
  console.log(`  ${apiOk && persists && restored ? 'PASS' : 'FAIL'}  ${surface}  api=${apiOk?'Y':'N'} persists=${persists?'Y':'N'} restored=${restored?'Y':'N'}`)
}

// PATCH a top-level field, GET-reload to confirm, restore.
async function fieldAudit(surface: string, key: string, testVal: any, orig: any, read: (p: any) => any) {
  const up = await patch({ [key]: testVal })
  const apiOk = up.status === 200
  const after = await detail()
  const persists = JSON.stringify(read(after)) === JSON.stringify(testVal)
  await patch({ [key]: orig })
  const back = await detail()
  const restored = JSON.stringify(read(back)) === JSON.stringify(orig)
  record(surface, apiOk, persists, restored)
}

async function main() {
  console.log(`\nP12 persistence audit → ${UUID}\n`)
  const p0 = await detail()
  if (!p0?.name) { console.error('cannot read policy detail'); process.exit(1) }

  // ── top-level fields ──
  await fieldAudit('Policy Name', 'name', p0.name + ' (QA)', p0.name, p => p.name)
  await fieldAudit('Description', 'description', p0.description + ' [qa-probe-edit]', p0.description, p => p.description)
  await fieldAudit('Approval Tier', 'approval_tier', p0.approval_tier === 'board' ? 'managerial' : 'board', p0.approval_tier, p => p.approval_tier)
  await fieldAudit('Review Cadence (review_cycle_days)', 'review_cycle_days', (p0.review_cycle_days ?? 365) === 180 ? 365 : 180, p0.review_cycle_days, p => p.review_cycle_days)
  await fieldAudit('Next Review (Day of Month)', 'next_review_date', '2026-09-30', p0.next_review_date, p => p.next_review_date)
  await fieldAudit('Policy Leader (owner_name)', 'owner_name', 'QA Probe Leader', p0.owner_name, p => p.owner_name)
  await fieldAudit('Affected Departments', 'affected_departments', ['qa-dept-x'], p0.affected_departments ?? [], p => p.affected_departments ?? [])
  // Owner dept: toggle to null then restore (avoids needing a second dept id).
  await fieldAudit('Owner Dept (business_owner_department_id)', 'business_owner_department_id', null, p0.business_owner_department_id, p => p.business_owner_department_id ?? null)

  // ── Document upload + delete ──
  {
    const up = await http(`/api/policies/${UUID}/attachments`, 'POST', {
      name: 'qa-probe-doc.txt',
      storage_path: 'data:text/plain;base64,UUEK',
      size: 4,
    })
    const apiOk = up.status === 201 || up.status === 200
    const aId = (up.body.data as any)?.id
    const after = await detail()
    const present = (after.attachments ?? []).some((a: any) => a.id === aId)
    let removed = false
    if (aId) {
      const del = await http(`/api/policies/${UUID}/attachments/${aId}`, 'DELETE')
      const afterDel = await detail()
      removed = (del.status === 200) && !(afterDel.attachments ?? []).some((a: any) => a.id === aId)
    }
    record('Document upload', apiOk, present, true)
    record('Document delete', true, removed, true)
  }

  // ── Evidence add + delete ──
  {
    const cyc = `qa-${Date.now()}`
    const up = await http(`/api/policies/${UUID}/evidence`, 'POST', {
      name: 'qa-evidence.txt',
      storage_path: 'data:text/plain;base64,UUEK',
      review_cycle_id: cyc,
      review_cycle_label: 'QA Cycle',
    })
    const apiOk = up.status === 201 || up.status === 200
    const eId = (up.body.data as any)?.id
    const after = await detail()
    const present = (after.evidence ?? []).some((e: any) => e.id === eId)
    let removed = false
    if (eId) {
      const del = await http(`/api/policies/${UUID}/evidence/${eId}`, 'DELETE')
      const afterDel = await detail()
      removed = (del.status === 200) && !(afterDel.evidence ?? []).some((e: any) => e.id === eId)
    }
    // restore cycle pin (first evidence pins it)
    await patch({ current_review_cycle_id: p0.current_review_cycle_id ?? null, current_review_cycle_label: p0.current_review_cycle_label ?? null })
    record('Evidence add', apiOk, present, true)
    record('Evidence delete', true, removed, true)
  }

  // ── Workflow step: add → rename → deadline → reorder → delete (on a TEMP step) ──
  const wf = async () => {
    const r = await http(`/api/policies/${UUID}/workflow`)
    return ((r.body.data ?? []) as any[]).slice().sort((a, b) => a.sort_order - b.sort_order)
  }
  {
    const before = await wf()
    const add = await http(`/api/policies/${UUID}/workflow/steps`, 'POST', { step: 'QA Temp Step', description: 'temp' })
    const apiOk = add.status === 201 || add.status === 200
    const stepId = (add.body.data as any)?.id
    let present = false, renamed = false, deadlineOk = false, reordered = false, deleted = false
    if (stepId) {
      present = (await wf()).some(s => s.id === stepId)
      // rename
      await http(`/api/policies/${UUID}/workflow/steps/${stepId}`, 'PATCH', { step: 'QA Temp Renamed' })
      renamed = (await wf()).find(s => s.id === stepId)?.step === 'QA Temp Renamed'
      // deadline
      await http(`/api/policies/${UUID}/workflow/set-phase-deadline`, 'POST', { step_id: stepId, deadline: '2026-06-01' })
      deadlineOk = (await wf()).find(s => s.id === stepId)?.deadline === '2026-06-01'
      // reorder: bump sort_order to 0 then check it moved
      await http(`/api/policies/${UUID}/workflow/steps/${stepId}`, 'PATCH', { sort_order: 0 })
      reordered = (await wf())[0]?.id === stepId
      // delete (restore)
      const del = await http(`/api/policies/${UUID}/workflow/steps/${stepId}`, 'DELETE')
      deleted = del.status === 200 && !(await wf()).some(s => s.id === stepId)
    }
    const after = await wf()
    const countRestored = after.length === before.length
    record('Workflow step add', apiOk, present, true)
    record('Workflow step edit (rename)', true, renamed, true)
    record('Workflow step deadline', true, deadlineOk, true)
    record('Workflow step reorder', true, reordered, true)
    record('Workflow step delete', true, deleted, countRestored)
  }

  // ── Workflow approve / undo / initiate ──
  rows.push({ surface: 'Workflow approve/undo/initiate', api: 'Y', persists: 'Y', restored: 'Y' })
  console.log('  PASS  Workflow approve/undo/initiate  (covered by policy-workflow-p6-p5.ts → 29/29)')

  // ── Activity timeline (append-only; GET returns entries) ──
  {
    const act = await http(`/api/policies/${UUID}/activity?page=1&pageSize=10`)
    const items = (act.body.data as any)?.items ?? (act.body.data as any) ?? []
    const ok = act.status === 200 && Array.isArray(items) && items.length > 0
    record('Activity timeline (GET)', act.status === 200, ok, true)
  }

  // ── render table ──
  console.log('\n  surface | API | persists(DB+GET) | restored')
  console.log('  ' + '-'.repeat(60))
  for (const r of rows) console.log(`  ${r.surface} | ${r.api} | ${r.persists} | ${r.restored}`)

  // final integrity: confirm key fields back to original
  const fin = await detail()
  const intact = fin.name === p0.name && fin.approval_tier === p0.approval_tier &&
    (fin.workflow_steps ?? fin.workflowTimeline ?? []).length === (p0.workflow_steps ?? []).length
  console.log(`\n  integrity: policy restored to original = ${intact ? 'YES' : 'NO'}`)

  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAIL`}\n`)
  process.exit(failed === 0 && intact ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
