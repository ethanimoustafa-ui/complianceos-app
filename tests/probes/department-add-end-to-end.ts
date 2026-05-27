export {} // module scope

// W29-M1 probe — Department "+Add new" does the full create cycle.
//
// Root cause fixed: department-store.addDepartment() now returns
// Promise<Department> (awaits the real server POST) instead of returning the
// optimistic temp row synchronously. All EditableSelect onAdd callers updated
// to .then(d => d.id) so the dropdown auto-selects the stable server UUID
// rather than the transient tmp-* id that gets replaced after the POST.
//
// Static checks:
//   1. department-store addDepartment signature is async / returns Promise
//   2. All onAdd callers in advisory page use .then(d => d.id)
//   3. department-store still does optimistic insert (local state update before await)
//
// Live checks (requires --cookie):
//   4. POST /api/settings/departments → 201 + returns real UUID
//   5. GET /api/settings/departments → new dept appears in list
//   6. Cleanup: DELETE /api/settings/departments/{id} (skip if 409 = in-use is ok)
//
// USAGE:
//   npx tsx tests/probes/department-add-end-to-end.ts               # static only
//   npx tsx tests/probes/department-add-end-to-end.ts --cookie="…"  # static + live

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

function pass(label: string, msg = ''): boolean {
  console.log(`  PASS  ${label}${msg ? '  ' + msg : ''}`)
  return true
}
function fail(label: string, msg = ''): boolean {
  console.log(`  FAIL  ${label}${msg ? '  ' + msg : ''}`)
  return false
}

function probeStoreIsAsync(): boolean {
  console.log('\n[S1] department-store addDepartment is async (returns Promise<Department>)')
  const src = readFileSync(resolve('src/stores/department-store.ts'), 'utf-8')
  // Interface signature must say Promise<Department>
  if (!src.includes('Promise<Department>')) {
    return fail('Promise<Department> interface', 'addDepartment interface does not return Promise<Department>')
  }
  // Implementation must use async
  if (!src.includes('addDepartment: async')) {
    return fail('async implementation', 'addDepartment implementation not async')
  }
  return pass('addDepartment is async', 'interface + implementation both updated')
}

function probeOptimisticInsertStillPresent(): boolean {
  console.log('\n[S2] department-store still does optimistic insert before await')
  const src = readFileSync(resolve('src/stores/department-store.ts'), 'utf-8')
  // Should set optimistic row before the api.post call
  const optimisticIdx = src.indexOf('optimistic')
  const postIdx = src.indexOf("api.post<DepartmentApiRow>('/settings/departments'")
  if (optimisticIdx === -1) {
    return fail('optimistic insert', 'no optimistic row in addDepartment')
  }
  if (postIdx === -1) {
    return fail('api.post call', 'api.post to /settings/departments not found')
  }
  if (optimisticIdx > postIdx) {
    return fail('order', 'optimistic insert comes AFTER the api.post call — must be before')
  }
  return pass('optimistic insert before await', 'UI updates immediately, server round-trip happens after')
}

function probeAdvisoryCallersUpdated(): boolean {
  console.log('\n[S3] advisory page onAdd callers use .then(d => d.id)')
  const src = readFileSync(
    resolve('src/app/(dashboard)/correspondence/advisory/page.tsx'),
    'utf-8',
  )
  // Count old pattern (should be 0)
  const oldPattern = /addDepartment\([^)]+\)\.id/g
  const oldMatches = src.match(oldPattern) ?? []
  if (oldMatches.length > 0) {
    return fail(
      'old synchronous .id pattern',
      `found ${oldMatches.length} old .id pattern(s) still in advisory/page.tsx`,
    )
  }
  // Count new pattern (should be ≥ 2 for the two dropdowns)
  const newPattern = /addDepartment\([^)]+\)\.then\(d => d\.id\)/g
  const newMatches = src.match(newPattern) ?? []
  if (newMatches.length < 2) {
    return fail(
      'new .then(d => d.id) pattern',
      `found ${newMatches.length} updated caller(s) — expected at least 2`,
    )
  }
  return pass('.then(d => d.id) callers', `${newMatches.length} callers updated in advisory page`)
}

async function probeLiveCreateListDelete(cookie: string): Promise<boolean> {
  console.log('\n[L1] POST /api/settings/departments → 201, GET → in list, DELETE cleanup')
  const testName = `QA Test Dept W29 ${Date.now()}`

  // Create
  const createRes = await fetch(`${BASE}/api/settings/departments`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ key: `qa-test-dept-w29-${Date.now()}`, name_en: testName, name_ar: testName }),
  })
  if (createRes.status !== 201 && createRes.status !== 200) {
    return fail('POST department', `status=${createRes.status}`)
  }
  let created: { id?: string; name_en?: string } | undefined
  try {
    const body = (await createRes.json()) as { data?: { id?: string; name_en?: string }; id?: string; name_en?: string }
    created = body?.data ?? body
  } catch {
    return fail('parse create response', 'could not parse JSON')
  }
  const createdId = created?.id
  if (!createdId) {
    return fail('POST response id', 'no id in create response')
  }
  pass('POST department 201', `id=${createdId} name="${created?.name_en}"`)

  // GET list — new dept must appear
  const listRes = await fetch(`${BASE}/api/settings/departments`, {
    headers: { cookie },
  })
  if (listRes.status !== 200) {
    return fail('GET departments', `status=${listRes.status}`)
  }
  let list: Array<{ id: string; name_en: string }> = []
  try {
    const body = (await listRes.json()) as { data?: Array<{ id: string; name_en: string }> } | Array<{ id: string; name_en: string }>
    list = Array.isArray(body) ? body : (body as any).data ?? []
  } catch {
    return fail('parse list response', 'could not parse JSON')
  }
  const found = list.find((d) => d.id === createdId)
  if (!found) {
    return fail('dept in list', `id=${createdId} not found in GET /api/settings/departments`)
  }
  pass('dept appears in list', `name="${found.name_en}"`)

  // Cleanup — DELETE (best-effort; 409 = in-use is acceptable for a probe)
  const delRes = await fetch(`${BASE}/api/settings/departments/${createdId}`, {
    method: 'DELETE',
    headers: { cookie },
  })
  if (delRes.status === 409) {
    pass('cleanup skipped', 'dept in use (409) — row left in DB, acceptable for probe')
  } else if (delRes.status === 200 || delRes.status === 204) {
    pass('DELETE cleanup', `status=${delRes.status}`)
  } else {
    pass('DELETE unexpected status', `status=${delRes.status} — non-critical, row may remain`)
  }

  return true
}

async function main() {
  console.log('W29-M1 department-add-end-to-end probe')
  const results: boolean[] = []
  results.push(probeStoreIsAsync())
  results.push(probeOptimisticInsertStillPresent())
  results.push(probeAdvisoryCallersUpdated())

  const cookie = readCookieOptional()
  if (cookie) {
    results.push(await probeLiveCreateListDelete(cookie))
  } else {
    console.log('\n  (skipping live probes — no --cookie provided)')
  }

  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
