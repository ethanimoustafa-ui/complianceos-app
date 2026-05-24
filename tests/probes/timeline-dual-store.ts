export {} // make this file a module

// Wave-19.1 / Q8 — dual-store timeline probe.
//
// Scope: confirm that mutating a circular produces a `circular_timeline` row
// whose `text_en` AND `text_ar` columns are BOTH populated with rendered
// strings (NOT a `{k,…}` JSON payload). Also confirms a quick GET surfaces
// the row with both columns present.
//
// USAGE:
//   1. Make sure the dev server is running on http://localhost:3000.
//   2. Pass a logged-in session cookie via env or flag (same convention as
//      the other probes):
//        npx tsx tests/probes/timeline-dual-store.ts --cookie="sb-…-auth-token=…"
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

interface TimelineRow {
  id: string
  text_en?: string
  text_ar?: string
  // legacy column shapes — we assert they are NOT present
  title?: string
  title_ar?: string
}

async function main() {
  // 1. Create a fresh circular so we own the row and the timeline starts clean.
  const createRes = await fetch(`${BASE}/api/circulars`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({
      authority: 'SAMA',
      title: `W19.1 probe ${Date.now()}`,
      priority: 'low',
      status: 'pending',
      applicability: 'pending',
      issuance_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    }),
  })
  if (createRes.status !== 201) {
    console.error(`[probe] expected 201 from POST /circulars, got ${createRes.status}`)
    console.error(await createRes.text())
    process.exit(1)
  }
  const created = (await createRes.json()) as { id: string }
  const circularId = created.id
  console.log(`[probe] created circular ${circularId}`)

  // 2. Mutate the circular — a description PATCH triggers the generic
  //    "Circular updated — Description" timeline row.
  const patchRes = await fetch(`${BASE}/api/circulars/${circularId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: COOKIE },
    body: JSON.stringify({ description: 'W19.1 dual-store probe' }),
  })
  if (patchRes.status >= 400) {
    console.error(`[probe] expected 2xx from PATCH, got ${patchRes.status}`)
    console.error(await patchRes.text())
    process.exit(1)
  }
  console.log('[probe] mutated circular')

  // 3. Read the timeline. The first row (newest-first) is the PATCH event.
  const tlRes = await fetch(
    `${BASE}/api/circulars/${circularId}/timeline?limit=5`,
    { headers: { cookie: COOKIE } },
  )
  if (tlRes.status !== 200) {
    console.error(`[probe] timeline GET ${tlRes.status}`)
    process.exit(1)
  }
  const tl = (await tlRes.json()) as { items: TimelineRow[] }
  const items = tl.items ?? []
  if (items.length === 0) {
    console.error('[probe] timeline empty — expected at least the update event')
    process.exit(1)
  }

  let failed = 0
  for (const row of items) {
    const en = row.text_en ?? ''
    const ar = row.text_ar ?? ''
    if (!en || !ar) {
      console.error(`[probe] row ${row.id} missing text_en or text_ar`, { en, ar })
      failed++
      continue
    }
    if (en.startsWith('{') || ar.startsWith('{')) {
      console.error(
        `[probe] row ${row.id} carries a {k,...} JSON payload — dual-store contract broken`,
        { en, ar },
      )
      failed++
      continue
    }
    if ('title' in row || 'title_ar' in row) {
      console.error(`[probe] row ${row.id} still exposes legacy title columns`)
      failed++
      continue
    }
  }

  if (failed > 0) {
    console.error(`[probe] FAILED — ${failed} row(s) violated the dual-store contract`)
    process.exit(1)
  }

  console.log(`[probe] OK — ${items.length} timeline row(s) all dual-store populated`)
}

main().catch((e) => {
  console.error('[probe] threw', e)
  process.exit(1)
})
