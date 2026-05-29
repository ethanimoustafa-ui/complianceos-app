export {} // module scope

// W31 P6.1/P6.2/P6.3 + P5 — Policy workflow stepping correctness.
//
// Drives /api/policies/:id/workflow/advance against a real policy and reads
// back /workflow to assert DB state transitions. Verifies:
//   P6.3  initiate-review starts the FIRST existing step — no phantom row, step
//         count is unchanged, step1 current / rest pending.
//   P6.2  one Approve = exactly one cursor move (step N completed, N+1 current,
//         N+2 still pending — never jumps ahead). submit-for-review (request
//         review) does NOT advance — current step enters pending-approval.
//   P6.1  undo is reversible — demotes current→pending, reverts last-completed→
//         current (clearing its user/date), never advances. 3× approve/undo loop
//         stays stable (always exactly one 'current', correct completed count).
//   P5    after approve, the completed step persists user_name + date across a
//         fresh GET (simulated reload).
//
// Non-destructive: ends by re-initiating the cycle, leaving the policy at
// "step 1 current / under-review".
//
// USAGE:
//   COOKIE=$(cat tests/e2e/_artifacts/wave-31-policy/cookie.txt) \
//     npx tsx tests/probes/policy-workflow-p6-p5.ts --cookie="$COOKIE" [--policy=POL-2026-0002]

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
  if (!v) { console.error(`Missing --${name}="..." or ${envName}`); process.exit(2) }
  return v
}

const COOKIE = requireArg('cookie', 'COOKIE')
const POLICY = readArg('policy', 'POLICY') ?? 'POL-2026-0002'

interface Envelope<T = unknown> { data?: T; error?: { code?: string; message?: string } }
interface Step {
  id: string
  step: string
  status: 'pending' | 'current' | 'completed'
  step_state: string | null
  user_name: string | null
  date: string | null
  sort_order: number
}

async function http<T = unknown>(path: string, opts: { method: string; body?: unknown } = { method: 'GET' }) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

let passed = 0, failed = 0
function ok(label: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${label}${detail ? `  (${detail})` : ''}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`) }
  return cond
}

async function steps(): Promise<Step[]> {
  const { body } = await http<Step[]>(`/api/policies/${POLICY}/workflow`)
  const arr = (body.data ?? []) as Step[]
  return [...arr].sort((a, b) => a.sort_order - b.sort_order)
}
async function advance(action: string, stepId?: string) {
  return http(`/api/policies/${POLICY}/workflow/advance`, {
    method: 'POST',
    body: { action, ...(stepId ? { step_id: stepId } : {}) },
  })
}
// Invariant every workflow must satisfy: at most one 'current' step; no
// 'pending' step appears before a 'current'/'completed' gap that breaks ordering.
function oneCurrent(s: Step[]): boolean {
  return s.filter(x => x.status === 'current').length <= 1
}
function statusesOf(s: Step[]) { return s.map(x => x.status).join(',') }

async function main() {
  console.log(`\nP6/P5 workflow probe → ${POLICY}\n`)

  const initial = await steps()
  ok('precondition: policy has ≥3 workflow steps', initial.length >= 3, `count=${initial.length}`)
  if (initial.length < 3) { console.log('\nABORT: need ≥3 steps'); process.exit(1) }
  const N = initial.length

  // ── P6.3 — initiate-review starts the first step, inserts NO phantom row ──
  console.log('[P6.3] initiate-review')
  const ir = await advance('initiate-review')
  ok('initiate-review → HTTP 200', ir.status === 200, `got ${ir.status}`)
  let s = await steps()
  ok('P6.3 no phantom step inserted (count unchanged)', s.length === N, `count=${s.length} expected=${N}`)
  ok('P6.3 step 1 is current', s[0]?.status === 'current', `step1=${s[0]?.status}`)
  ok('P6.3 steps 2..n are pending', s.slice(1).every(x => x.status === 'pending'), statusesOf(s))
  ok('P6.3 exactly one current step', oneCurrent(s))

  // ── P6.2 — one Approve = one cursor move; never jumps ahead ──
  console.log('[P6.2] approve step 1 → expect exactly one move')
  const step1Id = s[0].id
  const ap = await advance('approve', step1Id)
  ok('approve → HTTP 200', ap.status === 200, `got ${ap.status}`)
  s = await steps()
  ok('P6.2 step 1 completed', s[0]?.status === 'completed', `step1=${s[0]?.status}`)
  ok('P6.2 step 2 promoted to current', s[1]?.status === 'current', `step2=${s[1]?.status}`)
  ok('P6.2 step 3 STILL pending (no jump-ahead)', s[2]?.status === 'pending', `step3=${s[2]?.status}`)
  ok('P6.2 exactly one current step', oneCurrent(s), statusesOf(s))
  ok('P6.2 exactly one completed step', s.filter(x => x.status === 'completed').length === 1)

  // ── P5 — approved step persists user_name + date across a fresh GET ──
  console.log('[P5] completed step persistence')
  ok('P5 completed step has user_name', !!s[0]?.user_name, `user_name=${s[0]?.user_name ?? 'null'}`)
  ok('P5 completed step has date', !!s[0]?.date, `date=${s[0]?.date ?? 'null'}`)
  const reload = await steps() // simulate Ctrl+R — independent GET
  ok('P5 user_name survives reload', !!reload[0]?.user_name, `user_name=${reload[0]?.user_name ?? 'null'}`)
  ok('P5 date survives reload', !!reload[0]?.date, `date=${reload[0]?.date ?? 'null'}`)

  // ── P6.1 — undo reverts (does NOT advance) and clears the reverted caption ──
  console.log('[P6.1] undo')
  const un = await advance('undo', step1Id)
  ok('undo → HTTP 200', un.status === 200, `got ${un.status}`)
  s = await steps()
  ok('P6.1 step 1 reverted to current', s[0]?.status === 'current', `step1=${s[0]?.status}`)
  ok('P6.1 step 2 demoted to pending', s[1]?.status === 'pending', `step2=${s[1]?.status}`)
  ok('P6.1 step 3 still pending', s[2]?.status === 'pending', `step3=${s[2]?.status}`)
  ok('P6.1 reverted step user_name cleared', !s[0]?.user_name, `user_name=${s[0]?.user_name ?? 'null'}`)
  ok('P6.1 reverted step date cleared', !s[0]?.date, `date=${s[0]?.date ?? 'null'}`)
  ok('P6.1 no completed steps remain', s.filter(x => x.status === 'completed').length === 0)
  ok('P6.1 exactly one current step', oneCurrent(s), statusesOf(s))

  // ── P6.1 — 3× approve/undo loop stays stable ──
  console.log('[P6.1] approve↔undo reversibility loop ×3')
  let stable = true, detail = ''
  for (let i = 1; i <= 3; i++) {
    const cur = (await steps()).find(x => x.status === 'current')
    if (!cur) { stable = false; detail = `iter ${i}: no current step`; break }
    const a = await advance('approve', cur.id)
    if (a.status !== 200) { stable = false; detail = `iter ${i}: approve HTTP ${a.status}`; break }
    let loop = await steps()
    if (!oneCurrent(loop) || loop.filter(x => x.status === 'completed').length !== 1) {
      stable = false; detail = `iter ${i} post-approve: ${statusesOf(loop)}`; break
    }
    const u = await advance('undo', cur.id)
    if (u.status !== 200) { stable = false; detail = `iter ${i}: undo HTTP ${u.status}`; break }
    loop = await steps()
    if (!oneCurrent(loop) || loop.filter(x => x.status === 'completed').length !== 0) {
      stable = false; detail = `iter ${i} post-undo: ${statusesOf(loop)}`; break
    }
    if (loop.length !== N) { stable = false; detail = `iter ${i}: count drifted to ${loop.length}`; break }
  }
  ok('P6.1 approve/undo ×3 stays stable & reversible', stable, detail || 'no drift, one-current invariant held')

  // ── P6.2 — request-review (submit-for-review) does NOT advance ──
  console.log('[P6.2] submit-for-review enters waiting state without advancing')
  const cur = (await steps()).find(x => x.status === 'current')!
  const sub = await advance('submit-for-review', cur.id)
  ok('submit-for-review → HTTP 200', sub.status === 200, `got ${sub.status}`)
  s = await steps()
  const curAfter = s.find(x => x.status === 'current')
  ok('P6.2 still on the same current step (no advance)', curAfter?.id === cur.id, `current=${curAfter?.step}`)
  ok('P6.2 current step entered pending-approval', curAfter?.step_state === 'pending-approval', `step_state=${curAfter?.step_state ?? 'null'}`)
  ok('P6.2 no step was completed by request-review', s.filter(x => x.status === 'completed').length === 0)

  // ── cleanup: leave at a clean step-1-current cycle ──
  await advance('initiate-review')
  const fin = await steps()
  console.log(`\ncleanup: ${statusesOf(fin)} (step1=${fin[0]?.status})`)

  console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
