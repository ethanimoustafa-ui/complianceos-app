export {} // module scope for top-level consts.

// Wave-19.6 — end-to-end verification of the new DB-backed workflow
// Undo / Reset routes.
//
// 1. Fetch a circular detail.
// 2. Pick its first 'current' step (or the first step), advance it to
//    completed via /workflow/advance.
// 3. Fire POST /workflow/undo. Assert exactly one step flips back to
//    'pending' and that a timeline + version row landed with non-empty
//    text_en / text_ar.
// 4. Advance every step to completed, then POST /workflow/reset. Assert
//    every step is 'pending' afterwards.
// 5. Stale `If-Match: W/"2020-01-01T00:00:00Z"` → 412 on both routes.
//
// USAGE:
//   npx tsx tests/probes/workflow-undo-reset.ts \
//     --cookie="sb-...auth-token=..." \
//     --circular="<circular-uuid>"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const STALE = 'W/"2020-01-01T00:00:00Z"'

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
  if (!v) {
    console.error(`Missing arg --${name}="..." (or env ${envName}).`)
    process.exit(2)
  }
  return v
}

const COOKIE: string = requireArg('cookie', 'COOKIE')
const CIRCULAR_ID: string = requireArg('circular', 'CIRCULAR_ID')

interface Envelope<T> { data?: T; error?: { code?: string; message?: string } }

async function http<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: {
      cookie: COOKIE,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

interface CircularDetail {
  id: string
  updated_at: string
  workflow_steps?: Array<{ id: string; status: string; label: string }>
}

interface TimelineRow {
  id: string
  text_en?: string
  text_ar?: string
}

interface VersionRow {
  version: number
  text_en?: string
  text_ar?: string
  field_changes?: unknown
}

let failures = 0
function ok(label: string, cond: boolean, info?: unknown) {
  if (cond) {
    console.log(`PASS  ${label}`)
  } else {
    failures++
    console.log(`FAIL  ${label}`, info ?? '')
  }
}

async function fetchDetail(): Promise<CircularDetail> {
  const { status, body } = await http<CircularDetail>(`/api/circulars/${CIRCULAR_ID}`, { method: 'GET' })
  if (status !== 200 || !body.data) {
    console.error('Could not fetch circular detail —', status, body.error)
    process.exit(2)
  }
  return body.data
}

async function main() {
  console.log(`Probing workflow undo/reset on circular ${CIRCULAR_ID} ...\n`)

  // ── 1. Stale If-Match on undo → 412 ─────────────────────────────────────
  const undoStale = await http(`/api/circulars/${CIRCULAR_ID}/workflow/undo`, {
    method: 'POST',
    headers: { 'If-Match': STALE },
    body: {},
  })
  ok('undo: stale If-Match → 412', undoStale.status === 412, undoStale.body)

  // ── 2. Stale If-Match on reset → 412 ────────────────────────────────────
  const resetStale = await http(`/api/circulars/${CIRCULAR_ID}/workflow/reset`, {
    method: 'POST',
    headers: { 'If-Match': STALE },
    body: {},
  })
  ok('reset: stale If-Match → 412', resetStale.status === 412, resetStale.body)

  // ── 3. Make sure at least one step is completed; fire undo + verify ────
  let detail = await fetchDetail()
  const steps = detail.workflow_steps ?? []
  if (steps.length === 0) {
    console.error('Circular has no workflow steps — cannot probe.')
    process.exit(2)
  }
  const firstCurrent = steps.find((s) => s.status === 'current') ?? steps.find((s) => s.status !== 'completed')
  if (firstCurrent) {
    const advance = await http(`/api/circulars/${CIRCULAR_ID}/workflow/advance`, {
      method: 'POST',
      body: { step_id: firstCurrent.id, notes: 'probe — advance' },
    })
    ok('advance: ok', advance.status === 200, advance.body)
    detail = await fetchDetail()
  }
  const stepsBefore = detail.workflow_steps ?? []
  const completedBefore = stepsBefore.filter((s) => s.status === 'completed').length
  const currentBefore = stepsBefore.find((s) => s.status === 'current')

  // Capture the targeted promoted_step_id from the response body so we can
  // assert its status flipped to 'current' specifically (not just "some" row
  // became current). This is the W19.6-BUG-1 hardening — the previous
  // assertion only checked the count, which would pass even if the route had
  // promoted the WRONG step.
  interface UndoOkPayload {
    items: Array<{ id: string; status: string }>
    promoted: { id: string; label: string; status: string }
    demoted_id: string | null
  }
  const undoOk = await http<UndoOkPayload>(`/api/circulars/${CIRCULAR_ID}/workflow/undo`, {
    method: 'POST',
    headers: { 'If-Match': `W/"${detail.updated_at}"` },
    body: {},
  })
  ok('undo: fresh If-Match → 200', undoOk.status === 200, undoOk.body)
  const promotedId = undoOk.body.data?.promoted?.id
  const demotedId = undoOk.body.data?.demoted_id ?? null
  ok('undo: response body names promoted step id', !!promotedId, undoOk.body)

  detail = await fetchDetail()
  const stepsAfter = detail.workflow_steps ?? []
  const completedAfter = stepsAfter.filter((s) => s.status === 'completed').length
  // Dual-flip cursor model (Wave-19.6 corrected) — the completed step gets
  // PROMOTED to 'current' (not demoted to 'pending'), so the completed count
  // drops by 1 AND a new 'current' step appears in its place.
  ok('undo: completed count -1', completedAfter === completedBefore - 1, { completedBefore, completedAfter })
  // The previously-current step (if any) must now be 'pending'.
  if (currentBefore) {
    const demoted = stepsAfter.find((s) => s.id === currentBefore.id)
    ok(
      'undo: previously-current step demoted to pending',
      !!demoted && demoted.status === 'pending',
      { before: currentBefore, after: demoted },
    )
    ok(
      'undo: response.demoted_id matches the previously-current step id',
      demotedId === currentBefore.id,
      { responseDemotedId: demotedId, expectedId: currentBefore.id },
    )
  }
  // Specifically named promoted step must now be 'current' in the DB.
  if (promotedId) {
    const promotedRow = stepsAfter.find((s) => s.id === promotedId)
    ok(
      'undo: response.promoted step is status=current in the DB',
      !!promotedRow && promotedRow.status === 'current',
      { responsePromotedId: promotedId, dbRow: promotedRow },
    )
  }
  // Exactly one step should be 'current' after the undo (the promoted one).
  const currentsAfter = stepsAfter.filter((s) => s.status === 'current')
  ok(
    'undo: exactly one step is current after undo',
    currentsAfter.length === 1,
    currentsAfter,
  )

  // ── 4. Timeline + Version row landed bilingual ──────────────────────────
  const tlPage = await http<{ items: TimelineRow[] }>(
    `/api/circulars/${CIRCULAR_ID}/timeline?limit=5`,
    { method: 'GET' },
  )
  const newestTl = tlPage.body.data?.items?.[0]
  ok(
    'undo: timeline row has text_en + text_ar',
    !!newestTl && !!newestTl.text_en && !!newestTl.text_ar && newestTl.text_en.length > 0,
    newestTl,
  )

  const versionsPage = await http<{ items: VersionRow[] }>(
    `/api/circulars/${CIRCULAR_ID}/versions?limit=5`,
    { method: 'GET' },
  )
  const newestVer = versionsPage.body.data?.items?.[0]
  ok(
    'undo: version row has text_en + text_ar',
    !!newestVer && !!newestVer.text_en && !!newestVer.text_ar,
    newestVer,
  )

  // ── 5. Reset path: advance every remaining step, then reset ─────────────
  // (Optional — only runs if the workflow is small enough that the test can
  // realistically reach 100% completion.)
  detail = await fetchDetail()
  let stepsLeft = (detail.workflow_steps ?? []).filter((s) => s.status !== 'completed')
  let advanceCount = 0
  // Cap iteration so the probe never hangs on an unexpected loop.
  while (stepsLeft.length > 0 && advanceCount < 32) {
    const target = stepsLeft[0]
    const res = await http(`/api/circulars/${CIRCULAR_ID}/workflow/advance`, {
      method: 'POST',
      body: { step_id: target.id, notes: 'probe — bulk advance' },
    })
    if (res.status !== 200) {
      console.log(`  (advance bulk loop stopped early at ${target.id}, status=${res.status})`)
      break
    }
    advanceCount++
    detail = await fetchDetail()
    stepsLeft = (detail.workflow_steps ?? []).filter((s) => s.status !== 'completed')
  }
  const allDone =
    (detail.workflow_steps ?? []).length > 0 &&
    (detail.workflow_steps ?? []).every((s) => s.status === 'completed')
  if (!allDone) {
    console.log(`SKIP  reset: could not bring workflow to 100% (${advanceCount} advances)`)
  } else {
    const resetOk = await http(`/api/circulars/${CIRCULAR_ID}/workflow/reset`, {
      method: 'POST',
      headers: { 'If-Match': `W/"${detail.updated_at}"` },
      body: {},
    })
    ok('reset: fresh If-Match → 200', resetOk.status === 200, resetOk.body)
    detail = await fetchDetail()
    ok(
      'reset: all steps back to pending',
      (detail.workflow_steps ?? []).every((s) => s.status === 'pending'),
      detail.workflow_steps,
    )
  }

  console.log()
  if (failures > 0) {
    console.log(`${failures} assertion(s) failed.`)
    process.exitCode = 1
  } else {
    console.log('All probe assertions passed.')
  }
}

main().catch((err) => {
  console.error('Probe crashed:', err)
  process.exitCode = 2
})
