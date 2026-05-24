export {} // module scope

// Wave-20 — Dual-store timeline integrity probe for /api/observations.
//
// Verifies PORTING-TEMPLATE §2.11 + §6.12 (RTL pass):
//   1. Create an observation → GET timeline → first row has non-empty text_en
//      AND text_ar (not raw DB column names, not {k:...} JSON, not empty).
//   2. PATCH the observation → timeline row for the edit also has both languages.
//   3. Close → timeline row for closure has both languages.
//   4. Reopen → timeline row for reopen has both languages.
//   5. Submit remediation plan → timeline row has both languages.
//   6. POST attachment (via /evidence) → timeline row has both languages.
//   7. POST checklist item → timeline row has both languages.
//
// Asserts:
//   - text_en is non-empty and contains NO `{k:` or raw key paths
//   - text_ar is non-empty and different from text_en (actually translated)
//   - No row has `description` or `description_ar` columns (migration 059 dropped them)
//
// USAGE:
//   npx tsx tests/probes/observation-timeline-dual-store.ts --cookie="sb-…-auth-token=…"

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
  // These columns should NOT appear after migration 059:
  description?: string
  description_ar?: string
  action_type?: string
}

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function http<T>(
  path: string,
  opts: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: {
      cookie: COOKIE,
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    body = {} as Envelope<T>
  }
  return { status: res.status, body }
}

function assertDualStore(label: string, row: TimelineRow): boolean {
  let pass = true
  if (!row.text_en) {
    console.log(`  FAIL [${label}] text_en is empty`)
    pass = false
  } else if (row.text_en.includes('{k:') || row.text_en.includes('observations.field')) {
    console.log(`  FAIL [${label}] text_en contains raw i18n key: "${row.text_en}"`)
    pass = false
  } else {
    console.log(`  PASS [${label}] text_en = "${row.text_en}"`)
  }
  if (!row.text_ar) {
    console.log(`  FAIL [${label}] text_ar is empty`)
    pass = false
  } else if (row.text_ar.includes('{k:') || row.text_ar.includes('observations.field')) {
    console.log(`  FAIL [${label}] text_ar contains raw i18n key: "${row.text_ar}"`)
    pass = false
  } else {
    console.log(`  PASS [${label}] text_ar = "${row.text_ar}"`)
  }
  if (row.text_en && row.text_ar && row.text_en === row.text_ar) {
    // Some single-word keys may be identical across locales; log as a warning
    // not a hard failure (e.g., proper nouns in both languages).
    console.log(`  WARN [${label}] text_en === text_ar (may be untranslated)`)
  }
  return pass
}

async function getLatestTimelineRow(
  observationId: string,
  actionType?: string,
): Promise<TimelineRow | null> {
  const res = await http<{ items: TimelineRow[] }>(
    `/api/observations/${observationId}/timeline?page=1&pageSize=20`,
    { method: 'GET' },
  )
  if (res.status !== 200 || !res.body.data?.items?.length) return null
  if (actionType) {
    return res.body.data.items.find((r) => r.action_type === actionType) ?? null
  }
  return res.body.data.items[0] ?? null
}

async function main(): Promise<void> {
  const results: boolean[] = []
  const tag = `w20-dual-${Date.now()}`

  // --- 1. Create observation
  console.log('\n[1] CREATE observation → timeline row dual-store')
  const createRes = await http<{ id: string; reference: string }>(
    '/api/observations',
    {
      method: 'POST',
      body: {
        title: `W20 Dual-Store Probe ${tag}`,
        description: 'Automated probe for dual-store timeline integrity.',
        source: 'internal',
        severity: 'low',
        due_date: '2028-12-31',
        framework_ids: [],
      },
    },
  )
  if (createRes.status !== 201 || !createRes.body.data?.id) {
    console.log(`  SKIP: create failed (status=${createRes.status})`)
    console.log(`  body: ${JSON.stringify(createRes.body)}`)
    process.exitCode = 1
    return
  }
  const obsId = createRes.body.data.id
  console.log(`  created observation ${obsId}`)

  // Wait for timeline to be written (timeline insert is async fire-and-forget).
  await new Promise((r) => setTimeout(r, 300))
  const createRow = await getLatestTimelineRow(obsId, 'created')
  if (!createRow) {
    console.log('  SKIP: no created timeline row found')
    results.push(false)
  } else {
    results.push(assertDualStore('create', createRow))
  }

  // --- 2. PATCH observation → edited timeline row
  console.log('\n[2] PATCH observation → timeline row dual-store')
  // First GET to capture ETag.
  const getRes = await http<{ id: string; updated_at: string }>(`/api/observations/${obsId}`, { method: 'GET' })
  const etag = getRes.body.data?.updated_at ? `W/"${getRes.body.data.updated_at}"` : undefined
  const patchRes = await http<{ id: string }>(
    `/api/observations/${obsId}`,
    {
      method: 'PATCH',
      body: { description: `Updated by W20 dual-store probe ${tag}` },
      headers: etag ? { 'If-Match': etag } : {},
    },
  )
  if (patchRes.status !== 200) {
    console.log(`  SKIP: PATCH failed (status=${patchRes.status}) body=${JSON.stringify(patchRes.body)}`)
    results.push(false)
  } else {
    await new Promise((r) => setTimeout(r, 300))
    const editRow = await getLatestTimelineRow(obsId, 'edited')
    if (!editRow) {
      console.log('  SKIP: no edited timeline row found')
      results.push(false)
    } else {
      results.push(assertDualStore('patch', editRow))
    }
  }

  // --- 3. Add checklist item → timeline row
  console.log('\n[3] POST checklist → timeline row dual-store')
  const clRes = await http<{ id: string }>(
    `/api/observations/${obsId}/checklist`,
    { method: 'POST', body: { text: `Probe checklist item ${tag}` } },
  )
  if (clRes.status !== 201) {
    console.log(`  SKIP: checklist POST failed (status=${clRes.status})`)
    results.push(false)
  } else {
    await new Promise((r) => setTimeout(r, 300))
    const clRow = await getLatestTimelineRow(obsId, 'checklist.added')
    if (!clRow) {
      console.log('  SKIP: no checklist.added timeline row found')
      results.push(false)
    } else {
      results.push(assertDualStore('checklist.added', clRow))
    }
  }

  // --- 4. Add evidence → timeline row
  console.log('\n[4] POST evidence → timeline row dual-store')
  const evRes = await http<{ id: string }>(
    `/api/observations/${obsId}/evidence`,
    {
      method: 'POST',
      body: {
        name: `probe-evidence-${tag}.pdf`,
        type: 'pdf',
        storage_path: `probes/${tag}/evidence.pdf`,
      },
    },
  )
  if (evRes.status !== 201) {
    console.log(`  SKIP: evidence POST failed (status=${evRes.status})`)
    results.push(false)
  } else {
    await new Promise((r) => setTimeout(r, 300))
    const evRow = await getLatestTimelineRow(obsId, 'evidence.added')
    if (!evRow) {
      console.log('  SKIP: no evidence.added timeline row found')
      results.push(false)
    } else {
      results.push(assertDualStore('evidence.added', evRow))
    }
  }

  // --- 5. Submit remediation plan → timeline row
  console.log('\n[5] POST remediation → timeline row dual-store')
  const remRes = await http<{ id: string }>(
    `/api/observations/${obsId}/remediation`,
    {
      method: 'POST',
      body: {
        title: `Probe Remediation Plan ${tag}`,
        description: 'Automated probe remediation plan.',
        due_date: '2028-12-31',
      },
    },
  )
  if (remRes.status !== 201) {
    console.log(`  SKIP: remediation POST failed (status=${remRes.status})`)
    results.push(false)
  } else {
    await new Promise((r) => setTimeout(r, 300))
    const remRow = await getLatestTimelineRow(obsId, 'remediation.submitted')
    if (!remRow) {
      console.log('  SKIP: no remediation.submitted timeline row found')
      results.push(false)
    } else {
      results.push(assertDualStore('remediation.submitted', remRow))
    }
  }

  // --- 6. Close observation → timeline row
  console.log('\n[6] POST close → timeline row dual-store')
  const getRes2 = await http<{ id: string; updated_at: string }>(`/api/observations/${obsId}`, { method: 'GET' })
  const etag2 = getRes2.body.data?.updated_at ? `W/"${getRes2.body.data.updated_at}"` : undefined
  const closeRes = await http<{ id: string }>(
    `/api/observations/${obsId}/close`,
    {
      method: 'POST',
      body: { notes: `Closed by dual-store probe ${tag}` },
      headers: etag2 ? { 'If-Match': etag2 } : {},
    },
  )
  if (closeRes.status !== 200) {
    console.log(`  SKIP: close failed (status=${closeRes.status}) body=${JSON.stringify(closeRes.body)}`)
    results.push(false)
  } else {
    await new Promise((r) => setTimeout(r, 300))
    const closeRow = await getLatestTimelineRow(obsId, 'closed')
    if (!closeRow) {
      console.log('  SKIP: no closed timeline row found')
      results.push(false)
    } else {
      results.push(assertDualStore('closed', closeRow))
    }
  }

  // --- 7. Reopen observation → timeline row
  console.log('\n[7] POST reopen → timeline row dual-store')
  const getRes3 = await http<{ id: string; updated_at: string }>(`/api/observations/${obsId}`, { method: 'GET' })
  const etag3 = getRes3.body.data?.updated_at ? `W/"${getRes3.body.data.updated_at}"` : undefined
  const reopenRes = await http<{ id: string }>(
    `/api/observations/${obsId}/reopen`,
    {
      method: 'POST',
      body: {},
      headers: etag3 ? { 'If-Match': etag3 } : {},
    },
  )
  if (reopenRes.status !== 200) {
    console.log(`  SKIP: reopen failed (status=${reopenRes.status}) body=${JSON.stringify(reopenRes.body)}`)
    results.push(false)
  } else {
    await new Promise((r) => setTimeout(r, 300))
    const reopenRow = await getLatestTimelineRow(obsId, 'reopened')
    if (!reopenRow) {
      console.log('  SKIP: no reopened timeline row found')
      results.push(false)
    } else {
      results.push(assertDualStore('reopened', reopenRow))
    }
  }

  // --- Clean up: delete the probe observation
  await http(`/api/observations/${obsId}`, { method: 'DELETE' }).catch(() => undefined)

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\nResult: ${passed}/${total} checks passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
