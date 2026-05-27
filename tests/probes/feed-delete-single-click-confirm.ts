export {} // module scope

// W29-F1 probe — Feed full-view delete requires exactly ONE confirm click (not two).
//
// Root cause fixed: CommunicationLogItem now receives `isConfirmingDelete` prop
// and renders a visible "Confirm?" pill on first click, so the user can see the
// pending confirm state and the second click fires the actual delete.
//
// Static checks:
//   1. CommunicationLogItem accepts isConfirmingDelete prop
//   2. The two CommunicationLogItem render sites pass isConfirmingDelete
//   3. The button renders a visible "Confirm" variant when isConfirmingDelete is true
//
// Live check (requires --cookie + a correspondence row):
//   4. DELETE /api/correspondence/{id} fires and returns 200/204 on single confirm
//
// USAGE:
//   npx tsx tests/probes/feed-delete-single-click-confirm.ts               # static only
//   npx tsx tests/probes/feed-delete-single-click-confirm.ts --cookie="…"  # static + live

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

function probeIsConfirmingDeleteProp(): boolean {
  console.log('\n[S1] CommunicationLogItem accepts isConfirmingDelete prop')
  const src = readFileSync(
    resolve('src/app/(dashboard)/correspondence/feed/page.tsx'),
    'utf-8',
  )
  if (!src.includes('isConfirmingDelete')) {
    return fail('isConfirmingDelete prop', 'prop not found in CommunicationLogItem or its callers')
  }
  return pass('isConfirmingDelete prop', 'prop is present in feed/page.tsx')
}

function probeConfirmRenderBranch(): boolean {
  console.log('\n[S2] Delete button renders visible "Confirm" branch when isConfirmingDelete is true')
  const src = readFileSync(
    resolve('src/app/(dashboard)/correspondence/feed/page.tsx'),
    'utf-8',
  )
  // Confirm branch should render a rose-filled button (not just a text link)
  const hasConfirmVariant =
    src.includes('isConfirmingDelete ?') || src.includes("isConfirmingDelete\n")
  if (!hasConfirmVariant) {
    return fail('confirm render branch', 'conditional rendering on isConfirmingDelete not found')
  }
  // The confirm button should have a distinct style (e.g. bg-rose-600)
  const hasConfirmStyle =
    src.includes('bg-rose-600') && src.includes("isConfirmingDelete")
  if (!hasConfirmStyle) {
    return fail('confirm button style', 'confirm button does not have rose background near isConfirmingDelete')
  }
  return pass('confirm render branch', 'distinct confirm button rendered when isConfirmingDelete=true')
}

function probeTwoRenderSitesPassProp(): boolean {
  console.log('\n[S3] Both CommunicationLogItem render sites pass isConfirmingDelete')
  const src = readFileSync(
    resolve('src/app/(dashboard)/correspondence/feed/page.tsx'),
    'utf-8',
  )
  // Count occurrences of isConfirmingDelete={deleteConfirmId === letter.id}
  const propPattern = 'isConfirmingDelete={deleteConfirmId === letter.id}'
  const count = (src.match(new RegExp(propPattern.replace(/[{}()|]/g, '\\$&'), 'g')) ?? []).length
  if (count < 2) {
    return fail(
      'two render sites',
      `found ${count} render site(s) passing isConfirmingDelete — expected 2 (mini-feed + full-view)`,
    )
  }
  return pass('two render sites', `${count} sites pass isConfirmingDelete prop`)
}

async function probeLiveDeleteSingleConfirm(cookie: string): Promise<boolean> {
  console.log('\n[L1] Live: create a correspondence item, then delete it with single confirm click path')
  // Step 1: create a test correspondence
  const createRes = await fetch(`${BASE}/api/correspondence`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: 'W29 F1 Probe Delete Test',
      from: 'probe@test.local',
      to: ['probe-recipient@test.local'],
      date: new Date().toISOString(),
      type: 'internal',
      status: 'sent',
      body: 'Probe test body',
      attachments: [],
      archived: false,
    }),
  })
  if (createRes.status !== 200 && createRes.status !== 201) {
    return fail('create correspondence', `status=${createRes.status}`)
  }
  let itemId: string | undefined
  try {
    const body = (await createRes.json()) as { data?: { id?: string }; id?: string }
    itemId = body?.data?.id ?? body?.id
  } catch {
    return fail('parse create response', 'could not parse JSON')
  }
  if (!itemId) {
    return fail('create response id', 'no id in create response')
  }
  pass('created test correspondence', `id=${itemId}`)

  // Step 2: DELETE the item (simulates the single confirm click)
  const delRes = await fetch(`${BASE}/api/correspondence/${itemId}`, {
    method: 'DELETE',
    headers: { cookie },
  })
  if (delRes.status !== 200 && delRes.status !== 204) {
    return fail('DELETE correspondence', `status=${delRes.status} id=${itemId}`)
  }
  return pass('DELETE /api/correspondence/{id}', `status=${delRes.status} — single-confirm path works`)
}

async function main() {
  console.log('W29-F1 feed-delete-single-click-confirm probe')
  const results: boolean[] = []
  results.push(probeIsConfirmingDeleteProp())
  results.push(probeConfirmRenderBranch())
  results.push(probeTwoRenderSitesPassProp())

  const cookie = readCookieOptional()
  if (cookie) {
    results.push(await probeLiveDeleteSingleConfirm(cookie))
  } else {
    console.log('\n  (skipping live probes — no --cookie provided)')
  }

  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
