export {} // module scope

// W27.1 — O6-6d regression guard.
//
// Asserts NO row in observation_timeline contains literal '{{' substrings,
// which would indicate un-interpolated Mustache tokens written before the
// W27-β assign/route.ts fix. Migration 073 backfilled the only pre-existing
// bad row; this probe catches any future regression.
//
// Scans all observations' timelines via the HTTP API.
//
// USAGE:
//   npx tsx tests/probes/observations-no-template-tokens.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  const argv = process.argv.slice(2)
  for (const a of argv) if (a.startsWith('--cookie=')) return a.slice('--cookie='.length)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}

const COOKIE = readCookie()

interface TimelineRow {
  id: string
  text_en?: string
  text_ar?: string
  action_type?: string
}

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T>(path: string): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
  })
  let body: Envelope<T>
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = {} as Envelope<T>
  }
  return { status: res.status, body }
}

async function main(): Promise<void> {
  console.log(`\nW27.1 O6-6d probe: scanning observation timelines for raw '{{' tokens at ${BASE}\n`)

  // Fetch all observations
  const obsRes = await http<{ items: { id: string; reference: string }[] }>(
    '/api/observations?page=1&pageSize=100',
  )
  if (obsRes.status !== 200) {
    console.error(`  FATAL: GET /api/observations failed with ${obsRes.status}`)
    process.exitCode = 1
    return
  }

  const observations = (obsRes.body.data as { items?: { id: string; reference: string }[] } | undefined)?.items ?? []
  if (observations.length === 0) {
    console.log('  INFO: No observations found — skipping scan (0 rows to check)')
    return
  }

  console.log(`  Scanning ${observations.length} observation(s) ...`)

  let totalRows = 0
  let badRows = 0
  const failures: string[] = []

  for (const obs of observations) {
    const tlRes = await http<{ items: TimelineRow[] }>(
      `/api/observations/${obs.id}/timeline?page=1&pageSize=100`,
    )
    if (tlRes.status !== 200) {
      console.log(`  WARN  GET timeline for ${obs.reference ?? obs.id} → ${tlRes.status} (skipped)`)
      continue
    }
    const items: TimelineRow[] =
      (tlRes.body.data as { items?: TimelineRow[] } | undefined)?.items ?? []
    totalRows += items.length

    for (const row of items) {
      const hasBadEn = typeof row.text_en === 'string' && row.text_en.includes('{{')
      const hasBadAr = typeof row.text_ar === 'string' && row.text_ar.includes('{{')
      if (hasBadEn || hasBadAr) {
        badRows++
        const detail = [
          hasBadEn ? `text_en="${row.text_en}"` : '',
          hasBadAr ? `text_ar="${row.text_ar}"` : '',
        ]
          .filter(Boolean)
          .join(', ')
        const msg = `  FAIL  obs=${obs.reference ?? obs.id} row=${row.id} (${row.action_type}): ${detail}`
        console.log(msg)
        failures.push(msg)
      }
    }
  }

  console.log(`\n  Scanned ${totalRows} timeline rows across ${observations.length} observation(s)`)

  if (badRows === 0) {
    console.log('  PASS  No raw Mustache tokens found in observation_timeline.')
  } else {
    console.log(`  FAIL  ${badRows} row(s) still contain raw '{{' tokens:`)
    failures.forEach((f) => console.log(f))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
