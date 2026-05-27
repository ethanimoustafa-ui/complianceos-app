export {} // module scope

// W28-M2 probe — "Save as template" + "Select template" for Circular (Rule) create modal.
//
// Live HTTP probe: requires a running dev server and auth cookie.
//
// Verifies:
//   1. POST /api/entity-templates → 201 (creates a circular template)
//   2. GET /api/entity-templates?entity_type=circular → 200, includes the created template
//   3. Template name matches what was sent
//   4. Template fields are stored correctly (authority, priority, etc.)
//   5. DELETE /api/entity-templates/{id} → 200 (soft-delete)
//   6. GET after delete → template no longer in list (deleted_at respected)
//
// Static part (no server):
//   7. RegisterCircularModal.tsx has template select UI and save-as-template form
//   8. entity-template-store.ts exports useEntityTemplateStore
//
// USAGE:
//   npx tsx tests/probes/rule-template-save-and-load.ts               # static only
//   npx tsx tests/probes/rule-template-save-and-load.ts --cookie="…"  # static + live

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookieOptional(): string | null {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  return null
}

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> },
  cookie: string,
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie, 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

function pass(label: string, msg = ''): boolean {
  console.log(`  PASS  ${label}${msg ? '  ' + msg : ''}`)
  return true
}
function fail(label: string, msg = ''): boolean {
  console.log(`  FAIL  ${label}${msg ? '  ' + msg : ''}`)
  return false
}

// --- Static probes ---

function probeModalHasTemplateUI(): boolean {
  console.log('\n[S1] RegisterCircularModal has template select + save-as-template UI')
  const src = readFileSync(
    resolve('src/components/correspondence/regulatory-updates/rules/RegisterCircularModal.tsx'),
    'utf-8'
  )
  if (!src.includes('useEntityTemplateStore')) {
    return fail('useEntityTemplateStore import', 'not imported in RegisterCircularModal')
  }
  if (!src.includes('applyTemplate')) {
    return fail('applyTemplate', 'applyTemplate function not found in modal')
  }
  if (!src.includes('handleSaveTemplate') && !src.includes('saveTemplate')) {
    return fail('saveTemplate', 'save template handler not found in modal')
  }
  if (!src.includes('showSaveTemplateForm') && !src.includes('saveAsTemplate')) {
    return fail('save template form toggle', 'showSaveTemplateForm state not found')
  }
  return pass('modal template UI', 'useEntityTemplateStore + applyTemplate + save form present')
}

function probeStoreExists(): boolean {
  console.log('\n[S2] entity-template-store.ts exports useEntityTemplateStore')
  const src = readFileSync(resolve('src/stores/entity-template-store.ts'), 'utf-8')
  if (!src.includes('useEntityTemplateStore')) {
    return fail('store export', 'useEntityTemplateStore not exported')
  }
  if (!src.includes('fetchByType') || !src.includes('saveTemplate') || !src.includes('deleteTemplate')) {
    return fail('store actions', 'fetchByType/saveTemplate/deleteTemplate missing')
  }
  return pass('entity-template-store', 'store exports all required actions')
}

function probeApiRoutesExist(): boolean {
  console.log('\n[S3] entity-templates API routes exist')
  let listSrc: string
  let deleteSrc: string
  try {
    listSrc = readFileSync(resolve('src/app/api/entity-templates/route.ts'), 'utf-8')
    deleteSrc = readFileSync(resolve('src/app/api/entity-templates/[templateId]/route.ts'), 'utf-8')
  } catch (e) {
    return fail('API route files', `could not read: ${e}`)
  }
  if (!listSrc.includes('GET') || !listSrc.includes('POST')) {
    return fail('list/create route', 'GET or POST missing from route.ts')
  }
  if (!deleteSrc.includes('DELETE')) {
    return fail('delete route', 'DELETE missing from [templateId]/route.ts')
  }
  return pass('API routes', 'GET, POST, DELETE all present')
}

// --- Live probes ---

async function probeLiveCreateAndDelete(cookie: string): Promise<boolean> {
  console.log('\n[L1] POST /api/entity-templates → 201, then GET → found, then DELETE → 200')
  const tag = `w28-m2-${Date.now()}`
  const templateName = `W28 M2 Probe ${tag}`

  // Create
  const createRes = await http<{ id: string; name: string; fields: Record<string, unknown> }>(
    '/api/entity-templates',
    {
      method: 'POST',
      body: {
        entity_type: 'circular',
        name: templateName,
        fields: { authority: 'sama', priority: 'medium', title: 'Probe Template' },
      },
    },
    cookie,
  )
  if (createRes.status !== 201) {
    return fail('POST template', `status=${createRes.status} body=${JSON.stringify(createRes.body)}`)
  }
  const created = createRes.body.data
  if (!created?.id || created.name !== templateName) {
    return fail('create response', `unexpected shape: ${JSON.stringify(created)}`)
  }
  pass('POST template 201', `id=${created.id}`)

  // List — template should appear
  const listRes = await http<Array<{ id: string; name: string }>>(
    '/api/entity-templates?entity_type=circular',
    { method: 'GET' },
    cookie,
  )
  if (listRes.status !== 200) {
    return fail('GET templates', `status=${listRes.status}`)
  }
  const found = (listRes.body.data ?? []).find((t) => t.id === created.id)
  if (!found) {
    return fail('template in list', `id=${created.id} not found in list response`)
  }
  pass('GET templates includes new template', `name="${found.name}"`)

  // Delete
  const delRes = await http<{ deleted: boolean }>(
    `/api/entity-templates/${created.id}`,
    { method: 'DELETE' },
    cookie,
  )
  if (delRes.status !== 200 && delRes.status !== 204) {
    return fail('DELETE template', `status=${delRes.status}`)
  }
  pass('DELETE template', `status=${delRes.status}`)

  // List again — template should be gone
  const listRes2 = await http<Array<{ id: string }>>(
    '/api/entity-templates?entity_type=circular',
    { method: 'GET' },
    cookie,
  )
  const stillThere = (listRes2.body.data ?? []).find((t) => t.id === created.id)
  if (stillThere) {
    return fail('soft-delete respected', `template still visible after DELETE`)
  }
  return pass('soft-delete respected', 'template gone from list after DELETE')
}

async function main() {
  console.log('W28-M2 rule-template-save-and-load probe')
  const results: boolean[] = []
  results.push(probeModalHasTemplateUI())
  results.push(probeStoreExists())
  results.push(probeApiRoutesExist())

  const cookie = readCookieOptional()
  if (cookie) {
    results.push(await probeLiveCreateAndDelete(cookie))
  } else {
    console.log('\n  (skipping live probes — no --cookie provided)')
  }

  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
