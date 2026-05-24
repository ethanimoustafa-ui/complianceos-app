export {} // make this file a module (so top-level `const BASE` is scoped)

// W17-1 (SEC-1 / PR-5): verify that every Rules-page child mutating route
// returns exactly one 200 + one 412 when two PATCHes / DELETEs fire
// concurrently carrying the SAME fresh `If-Match` token. This is the
// child-table parity probe for the parent-row SEC-1 probe that ships with
// Wave-17 — closes the lost-update gap on:
//   - PATCH /api/circulars/{cid}/implementations/{implId}/checklist/{itemId}
//   - PATCH /api/circulars/{cid}/implementations/{implId}                  (article)
//   - PATCH /api/circulars/{cid}/workflow/steps/{stepId}
//   - DELETE /api/circulars/{cid}/attachments/{attId}?kind=pdf             (two distinct rows)
//
// USAGE:
//   1. Make sure the dev server is running (http://localhost:3000).
//   2. Copy your `sb-<project>-auth-token` cookie from the browser.
//   3. Pick a circular you can mutate. It must already have at least one
//      article (with at least one checklist item) and one workflow step.
//      Pass its UUID via --circular="…" (or env CIRCULAR_ID). For the
//      attachment scenario the probe creates two pdf attachments itself
//      (cleanup runs at the end).
//   4. Run:
//        npx tsx tests/probes/concurrent-child-patch.ts \
//          --cookie="sb-…-auth-token=…" \
//          --circular="<circular-uuid>"
//
// What the probe asserts per route:
//   - Two PATCHes (or DELETEs) launched via Promise.all carrying the SAME
//     fresh `If-Match: W/"<updated_at>"` header.
//   - Status set is exactly { 200, 412 } — one writer wins, the other returns
//     `precondition_failed`. Anything else (two 200s, two 412s, a 500) is a
//     FAIL and a regression of the W17-1 lost-update fix.

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

function assertOneWinner(label: string, statuses: number[]): boolean {
  const sorted = [...statuses].sort((a, b) => a - b)
  const ok = sorted.length === 2 && sorted[0] === 200 && sorted[1] === 412
  console.log(`  → statuses=[${sorted.join(', ')}] ${ok ? 'PASS' : 'FAIL'}`)
  return ok
}

async function pickArticleAndItem(): Promise<{
  articleId: string
  articleUpdatedAt: string
  itemId: string
  itemUpdatedAt: string
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
      return {
        articleId: a.id,
        articleUpdatedAt: a.updated_at,
        itemId: item.id,
        itemUpdatedAt: item.updated_at,
      }
    }
  }
  return null
}

async function pickStep(): Promise<{ stepId: string; stepUpdatedAt: string } | null> {
  type Row = { id: string; updated_at: string }
  const list = await http<Row[]>(`/api/circulars/${CIRCULAR_ID}/workflow/steps`, {
    method: 'GET',
  })
  if (list.status !== 200 || !Array.isArray(list.body.data)) return null
  const s = list.body.data.find((r) => r.updated_at)
  if (!s) return null
  return { stepId: s.id, stepUpdatedAt: s.updated_at }
}

async function createPdfAttachment(): Promise<{ id: string; updated_at: string } | null> {
  type Row = { id: string; updated_at: string }
  const res = await http<Row>(`/api/circulars/${CIRCULAR_ID}/attachments`, {
    method: 'POST',
    body: {
      kind: 'pdf',
      name: `w171-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}.pdf`,
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

async function probeChecklist(): Promise<boolean> {
  console.log('\n[1/4] checklist PATCH race')
  const sel = await pickArticleAndItem()
  if (!sel) {
    console.log('  → SKIP: circular has no article+checklist with updated_at')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/implementations/${sel.articleId}/checklist/${sel.itemId}`
  const headers = { 'If-Match': `W/"${sel.itemUpdatedAt}"` }
  const [a, b] = await Promise.all([
    http(url, { method: 'PATCH', headers, body: { completed: true } }),
    http(url, { method: 'PATCH', headers, body: { completed: false } }),
  ])
  return assertOneWinner('checklist', [a.status, b.status])
}

async function probeArticle(): Promise<boolean> {
  console.log('\n[2/4] article PATCH race')
  const sel = await pickArticleAndItem()
  if (!sel) {
    console.log('  → SKIP: circular has no article with updated_at')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/implementations/${sel.articleId}`
  const headers = { 'If-Match': `W/"${sel.articleUpdatedAt}"` }
  const [a, b] = await Promise.all([
    http(url, { method: 'PATCH', headers, body: { notes: `w171-A-${Date.now()}` } }),
    http(url, { method: 'PATCH', headers, body: { notes: `w171-B-${Date.now()}` } }),
  ])
  return assertOneWinner('article', [a.status, b.status])
}

async function probeWorkflowStep(): Promise<boolean> {
  console.log('\n[3/4] workflow step PATCH race')
  const sel = await pickStep()
  if (!sel) {
    console.log('  → SKIP: circular has no workflow step with updated_at')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/workflow/steps/${sel.stepId}`
  const headers = { 'If-Match': `W/"${sel.stepUpdatedAt}"` }
  const [a, b] = await Promise.all([
    http(url, { method: 'PATCH', headers, body: { notes: `w171-A-${Date.now()}` } }),
    http(url, { method: 'PATCH', headers, body: { notes: `w171-B-${Date.now()}` } }),
  ])
  return assertOneWinner('workflow_step', [a.status, b.status])
}

async function probeAttachmentDelete(): Promise<boolean> {
  console.log('\n[4/4] attachment DELETE race (same row, same If-Match)')
  const att = await createPdfAttachment()
  if (!att) {
    console.log('  → SKIP: could not create probe attachment')
    return false
  }
  const url = `/api/circulars/${CIRCULAR_ID}/attachments/${att.id}?kind=pdf`
  const headers = { 'If-Match': `W/"${att.updated_at}"` }
  const [a, b] = await Promise.all([
    http(url, { method: 'DELETE', headers }),
    http(url, { method: 'DELETE', headers }),
  ])
  const ok = assertOneWinner('attachment_delete', [a.status, b.status])
  // Best-effort cleanup if the row still exists (unlikely after one wins).
  await deletePdfAttachment(att.id).catch(() => undefined)
  return ok
}

async function main(): Promise<void> {
  console.log(`W17-1 child-table optimistic-locking probes at ${BASE}`)
  console.log(`Circular: ${CIRCULAR_ID}\n`)
  const results = await Promise.all([
    probeChecklist(),
    probeArticle(),
    probeWorkflowStep(),
    probeAttachmentDelete(),
  ])
  const passed = results.filter((r) => r).length
  console.log(`\nResult: ${passed}/${results.length} routes returned [200, 412]`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
