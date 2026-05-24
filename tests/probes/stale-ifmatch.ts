export {} // make this file a module (so top-level `const BASE` is scoped)

// W17.2: verify that every Rules-page child mutating route returns 412 when
// the client sends a STALE `If-Match` token. This is a deterministic
// single-request probe — no concurrency needed — that exercises the actual
// HTTP route handlers. It closes the verification gap exposed by Wave-17.1:
// the helper-level vitest suite passed 94/94 even though all four child
// routes were silently scoping the conditional UPDATE/DELETE against the
// freshly-read DB value (`before.updated_at`) instead of the client's
// `If-Match` token — so a stale token quietly succeeded with 200.
//
// Routes covered (one request each, deliberate stale token):
//   - PATCH /api/circulars/{cid}/implementations/{implId}
//   - PATCH /api/circulars/{cid}/implementations/{implId}/checklist/{itemId}
//   - PATCH /api/circulars/{cid}/workflow/steps/{stepId}
//   - DELETE /api/circulars/{cid}/attachments/{attId}?kind=pdf  (creates + cleans up its own row)
//
// USAGE:
//   1. Make sure the dev server is running (http://localhost:3000).
//   2. Copy your `sb-<project>-auth-token` cookie from the browser.
//   3. Pick a circular you can mutate. It must already have at least one
//      article (with at least one checklist item) and one workflow step.
//      Pass its UUID via --circular="…" (or env CIRCULAR_ID). For the
//      attachment scenario the probe creates a pdf attachment itself.
//   4. Run:
//        npx tsx tests/probes/stale-ifmatch.ts \
//          --cookie="sb-…-auth-token=…" \
//          --circular="<circular-uuid>"
//
// Expected: every route returns 412 precondition_failed. Any 200 is a
// regression of the W17.2 fix (stale token silently accepted).

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

// Deliberately stale: a token from the distant past that cannot possibly
// match any live row's `updated_at`.
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
  if (!v) {
    console.error(`Missing arg --${name}="..." (or env ${envName}).`)
    process.exit(2)
  }
  return v
}

const COOKIE: string = requireArg('cookie', 'COOKIE')
const CIRCULAR_ID: string = requireArg('circular', 'CIRCULAR_ID')

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

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
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = {} as Envelope<T>
  }
  return { status: res.status, body }
}

function assertStatus(label: string, expected: number, actual: number): boolean {
  const ok = actual === expected
  console.log(`  → status=${actual} expected=${expected} ${ok ? 'PASS' : 'FAIL'}`)
  if (!ok) console.log(`     route=${label}`)
  return ok
}

async function pickArticleAndItem(): Promise<{
  articleId: string
  itemId: string
} | null> {
  type DetailResp = {
    implementations: Array<{
      id: string
      updated_at: string
      checklist?: Array<{ id: string; updated_at: string }>
    }>
  }
  const detail = await http<DetailResp>(`/api/circulars/${CIRCULAR_ID}`, { method: 'GET' })
  if (detail.status !== 200 || !detail.body.data) {
    console.error(`circular GET failed: status=${detail.status}`)
    return null
  }
  const impls = detail.body.data.implementations ?? []
  for (const a of impls) {
    const item = (a.checklist ?? []).find((i) => i.updated_at)
    if (a.updated_at && item) {
      return { articleId: a.id, itemId: item.id }
    }
  }
  return null
}

async function pickStep(): Promise<{ stepId: string } | null> {
  type Row = { id: string; updated_at: string }
  const list = await http<Row[]>(`/api/circulars/${CIRCULAR_ID}/workflow/steps`, {
    method: 'GET',
  })
  if (list.status !== 200 || !Array.isArray(list.body.data)) return null
  const s = list.body.data.find((r) => r.updated_at)
  if (!s) return null
  return { stepId: s.id }
}

async function createPdfAttachment(): Promise<{ id: string } | null> {
  type Row = { id: string; updated_at: string }
  const res = await http<Row>(`/api/circulars/${CIRCULAR_ID}/attachments`, {
    method: 'POST',
    body: {
      kind: 'pdf',
      name: `w172-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}.pdf`,
      storage_path: 'data:application/pdf;base64,JVBERi0xLjQK',
      type: 'application/pdf',
      size: 14,
    },
  })
  if (res.status !== 201 || !res.body.data) {
    console.error(`pdf attachment create failed: status=${res.status}`)
    return null
  }
  return res.body.data
}

async function deletePdfAttachment(id: string): Promise<void> {
  await http(`/api/circulars/${CIRCULAR_ID}/attachments/${id}?kind=pdf`, {
    method: 'DELETE',
  })
}

async function probeArticleStale(): Promise<boolean> {
  console.log('\n[1/4] article PATCH with stale If-Match')
  const sel = await pickArticleAndItem()
  if (!sel) {
    console.log('  → SKIP: circular has no article with updated_at')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/implementations/${sel.articleId}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { notes: `w172-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeChecklistStale(): Promise<boolean> {
  console.log('\n[2/4] checklist item PATCH with stale If-Match')
  const sel = await pickArticleAndItem()
  if (!sel) {
    console.log('  → SKIP: circular has no article+checklist with updated_at')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/implementations/${sel.articleId}/checklist/${sel.itemId}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { completed: false },
  })
  return assertStatus(url, 412, res.status)
}

async function probeWorkflowStepStale(): Promise<boolean> {
  console.log('\n[3/4] workflow step PATCH with stale If-Match')
  const sel = await pickStep()
  if (!sel) {
    console.log('  → SKIP: circular has no workflow step with updated_at')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/workflow/steps/${sel.stepId}`
  const res = await http(url, {
    method: 'PATCH',
    headers: { 'If-Match': STALE_IF_MATCH },
    body: { notes: `w172-stale-${Date.now()}` },
  })
  return assertStatus(url, 412, res.status)
}

async function probeAttachmentDeleteStale(): Promise<boolean> {
  console.log('\n[4/4] attachment DELETE with stale If-Match')
  const att = await createPdfAttachment()
  if (!att) {
    console.log('  → SKIP: could not create probe attachment')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/attachments/${att.id}?kind=pdf`
  const res = await http(url, {
    method: 'DELETE',
    headers: { 'If-Match': STALE_IF_MATCH },
  })
  const ok = assertStatus(url, 412, res.status)
  // Best-effort cleanup (with no If-Match so it always succeeds).
  await deletePdfAttachment(att.id).catch(() => undefined)
  return ok
}

async function main(): Promise<void> {
  console.log(`W17.2 stale-If-Match probes at ${BASE}`)
  console.log(`Circular: ${CIRCULAR_ID}`)
  console.log(`Stale token: ${STALE_IF_MATCH}\n`)
  const results = await Promise.all([
    probeArticleStale(),
    probeChecklistStale(),
    probeWorkflowStepStale(),
    probeAttachmentDeleteStale(),
  ])
  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} routes returned 412 on stale If-Match`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
