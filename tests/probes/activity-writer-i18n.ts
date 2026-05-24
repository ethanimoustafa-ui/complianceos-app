export {} // make this file a module

// Wave-19.5 — activity-writer i18n leak probe.
//
// Scope: confirm the generic "fields changed" branch of the Policy PATCH,
// Circular PATCH, and Article PATCH writes activity / timeline rows whose
// `text_en` carries the LOCALIZED field label ("Description") AND whose
// `text_ar` carries the Arabic label ("الوصف") — NOT the raw DB column
// name ("description").
//
// Background: the Wave-19.4 / Item-3 dual-store migration fixed the version
// writers but missed the Policy activity-log writer in the same PATCH
// handler. Hani reproed on policy `694fa590-…` — `text_en` said
// "Policy updated — description" (lowercase column) and `text_ar` carried
// the English word "description" embedded mid-Arabic.
//
// USAGE:
//   1. Dev server running on http://localhost:3000.
//   2. Pass a logged-in session cookie via env or flag:
//        npx tsx tests/probes/activity-writer-i18n.ts --cookie="sb-...-auth-token=..."
//
// Exit code is non-zero on any deviation so the probe can run in CI.

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  }
  console.error(
    'No cookie supplied. Set COOKIE env var or pass --cookie="..." on the cmd line.',
  )
  process.exit(2)
}

const COOKIE = readCookie()

interface ActivityRow {
  id: string
  text_en?: string
  text_ar?: string
}

interface TimelineRow {
  id: string
  text_en?: string
  text_ar?: string
}

let failed = 0

function assertBilingual(
  label: string,
  rowId: string,
  en: string,
  ar: string,
  expectedEn: string,
  expectedAr: string,
  forbiddenInAr: string,
) {
  if (!en.includes(expectedEn)) {
    console.error(
      `[probe] ${label} row ${rowId} text_en missing localized label "${expectedEn}" — got: ${JSON.stringify(en)}`,
    )
    failed++
  }
  // Lowercase raw DB column name leak — only flag if the lowercase form
  // is present AND the capitalized localized form is NOT (avoid false
  // positives on legitimate sentences that happen to mention the column).
  const rawForm = expectedEn.toLowerCase()
  if (
    rawForm !== expectedEn &&
    en.includes(rawForm) &&
    !en.includes(expectedEn)
  ) {
    console.error(
      `[probe] ${label} row ${rowId} text_en carries raw DB column "${rawForm}" instead of "${expectedEn}"`,
    )
    failed++
  }
  if (!ar.includes(expectedAr)) {
    console.error(
      `[probe] ${label} row ${rowId} text_ar missing Arabic label "${expectedAr}" — got: ${JSON.stringify(ar)}`,
    )
    failed++
  }
  if (ar.toLowerCase().includes(forbiddenInAr.toLowerCase())) {
    console.error(
      `[probe] ${label} row ${rowId} text_ar leaks English column name "${forbiddenInAr}" mid-Arabic — got: ${JSON.stringify(ar)}`,
    )
    failed++
  }
}

async function probePolicy() {
  // 1. Create a fresh policy so we own the row.
  const createRes = await fetch(`${BASE}/api/policies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({
      name: `W19.5 activity-writer probe ${Date.now()}`,
      description: 'Initial description for the probe.',
      category: 'Compliance',
      approval_tier: 'Management',
    }),
  })
  if (createRes.status !== 201) {
    console.error(`[probe/policy] expected 201 from POST /policies, got ${createRes.status}`)
    console.error(await createRes.text())
    process.exit(1)
  }
  const created = (await createRes.json()) as { id: string }
  const policyId = created.id
  console.log(`[probe/policy] created policy ${policyId}`)

  // 2. PATCH description — exercises the generic "fields changed" branch.
  const patchRes = await fetch(`${BASE}/api/policies/${policyId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ description: 'W19.5 dual-store activity-writer probe value.' }),
  })
  if (patchRes.status >= 400) {
    console.error(`[probe/policy] expected 2xx from PATCH, got ${patchRes.status}`)
    console.error(await patchRes.text())
    process.exit(1)
  }

  // 3. Read the activity feed. Newest-first; the PATCH row should be on top.
  const actRes = await fetch(
    `${BASE}/api/policies/${policyId}/activity?pageSize=5`,
    { headers: { cookie: COOKIE } },
  )
  if (actRes.status !== 200) {
    console.error(`[probe/policy] activity GET ${actRes.status}`)
    process.exit(1)
  }
  const act = (await actRes.json()) as { items: ActivityRow[] }
  const items = act.items ?? []
  const editRow = items.find((r) => (r.text_en ?? '').includes('Policy updated'))
  if (!editRow) {
    console.error('[probe/policy] no "Policy updated" activity row found', items)
    process.exit(1)
  }
  assertBilingual(
    'policy activity',
    editRow.id,
    editRow.text_en ?? '',
    editRow.text_ar ?? '',
    'Description',
    'الوصف',
    'description',
  )

  // 4. Also confirm the same row body appears on the matching policy_versions row
  //    — both writers now share `fieldsUpdatedBody`.
  const versRes = await fetch(
    `${BASE}/api/policies/${policyId}/versions?pageSize=5`,
    { headers: { cookie: COOKIE } },
  )
  if (versRes.status === 200) {
    const vers = (await versRes.json()) as { items: ActivityRow[] }
    const verRow = (vers.items ?? []).find((r) => (r.text_en ?? '').includes('Policy updated'))
    if (verRow) {
      assertBilingual(
        'policy version',
        verRow.id,
        verRow.text_en ?? '',
        verRow.text_ar ?? '',
        'Description',
        'الوصف',
        'description',
      )
    }
  }
}

async function probeCircular() {
  const createRes = await fetch(`${BASE}/api/circulars`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({
      authority: 'SAMA',
      title: `W19.5 activity-writer probe ${Date.now()}`,
      priority: 'low',
      status: 'pending',
      applicability: 'pending',
      issuance_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    }),
  })
  if (createRes.status !== 201) {
    console.error(`[probe/circular] expected 201, got ${createRes.status}`)
    console.error(await createRes.text())
    process.exit(1)
  }
  const created = (await createRes.json()) as { id: string }
  const circularId = created.id
  console.log(`[probe/circular] created circular ${circularId}`)

  const patchRes = await fetch(`${BASE}/api/circulars/${circularId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ description: 'W19.5 dual-store activity-writer probe.' }),
  })
  if (patchRes.status >= 400) {
    console.error(`[probe/circular] PATCH ${patchRes.status}`)
    console.error(await patchRes.text())
    process.exit(1)
  }

  const tlRes = await fetch(
    `${BASE}/api/circulars/${circularId}/timeline?limit=5`,
    { headers: { cookie: COOKIE } },
  )
  if (tlRes.status !== 200) {
    console.error(`[probe/circular] timeline GET ${tlRes.status}`)
    process.exit(1)
  }
  const tl = (await tlRes.json()) as { items: TimelineRow[] }
  const editRow = (tl.items ?? []).find((r) => (r.text_en ?? '').includes('Circular updated'))
  if (!editRow) {
    console.error('[probe/circular] no "Circular updated" timeline row found')
    process.exit(1)
  }
  assertBilingual(
    'circular timeline',
    editRow.id,
    editRow.text_en ?? '',
    editRow.text_ar ?? '',
    'Description',
    'الوصف',
    'description',
  )
}

async function probeArticle() {
  // Need a circular to host the article.
  const cRes = await fetch(`${BASE}/api/circulars`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({
      authority: 'SAMA',
      title: `W19.5 article-host ${Date.now()}`,
      priority: 'low',
      status: 'pending',
      applicability: 'pending',
      issuance_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    }),
  })
  if (cRes.status !== 201) {
    console.error(`[probe/article] host circular create ${cRes.status}`)
    console.error(await cRes.text())
    process.exit(1)
  }
  const { id: circularId } = (await cRes.json()) as { id: string }

  const aRes = await fetch(`${BASE}/api/circulars/${circularId}/implementations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({
      article_number: 'A1',
      title: `W19.5 article ${Date.now()}`,
      description: 'initial article body',
    }),
  })
  if (aRes.status !== 201) {
    console.error(`[probe/article] article create ${aRes.status}`)
    console.error(await aRes.text())
    process.exit(1)
  }
  const { id: implementationId } = (await aRes.json()) as { id: string }
  console.log(`[probe/article] created article ${implementationId}`)

  const patchRes = await fetch(
    `${BASE}/api/circulars/${circularId}/implementations/${implementationId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: COOKIE },
      body: JSON.stringify({ description: 'W19.5 dual-store article probe.' }),
    },
  )
  if (patchRes.status >= 400) {
    console.error(`[probe/article] PATCH ${patchRes.status}`)
    console.error(await patchRes.text())
    process.exit(1)
  }

  // Article version row (the article PATCH writes a parent circular-timeline
  // event + an `article_versions` history row). The version row is the one
  // that carries the "fields changed" body via renderBilingual.
  const vRes = await fetch(
    `${BASE}/api/circulars/${circularId}/implementations/${implementationId}/timeline?limit=5`,
    { headers: { cookie: COOKIE } },
  )
  // article_timeline is the per-article feed; the parent timeline carries the
  // "Article X updated" event but the per-field text is in article_versions
  // (Wave-19.4 / Item-3). We inspect article_versions via the parent detail.
  if (vRes.status === 200) {
    const tl = (await vRes.json()) as { items: TimelineRow[] }
    // No "fields changed" assertion here — the article-timeline row uses the
    // `articleUpdated` key (carries the article label, not the field list).
    // The field list lives on `article_versions.text_en/ar`.
    void tl
  }

  // Read the parent circular detail to get embedded article_versions.
  const detRes = await fetch(`${BASE}/api/circulars/${circularId}`, {
    headers: { cookie: COOKIE },
  })
  if (detRes.status !== 200) {
    console.error(`[probe/article] circular detail GET ${detRes.status}`)
    process.exit(1)
  }
  const det = (await detRes.json()) as {
    implementations?: Array<{ id: string; versions?: ActivityRow[] }>
  }
  const article = (det.implementations ?? []).find((i) => i.id === implementationId)
  const verRow = (article?.versions ?? []).find((r) =>
    (r.text_en ?? '').includes('updated'),
  )
  if (!verRow) {
    console.error('[probe/article] no article version row with "updated" found')
    process.exit(1)
  }
  assertBilingual(
    'article version',
    verRow.id,
    verRow.text_en ?? '',
    verRow.text_ar ?? '',
    'Description',
    'الوصف',
    'description',
  )
}

async function main() {
  await probePolicy()
  await probeCircular()
  await probeArticle()
  if (failed > 0) {
    console.error(`[probe] FAILED — ${failed} assertion(s) violated`)
    process.exit(1)
  }
  console.log('[probe] OK — all activity / timeline / version rows carry localized labels')
}

main().catch((e) => {
  console.error('[probe] threw', e)
  process.exit(1)
})
