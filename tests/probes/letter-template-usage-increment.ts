export {} // module scope

// W29-L3: Template usage_count increment END-TO-END probe.
//
// HONESTY NOTE: previous verifications were shallow. This probe actually
// creates a letter from a template and asserts usage_count incremented.
//
// Asserts:
//   1. GET /api/letter-templates → captures count_before on first template.
//   2. POST /api/letters with template_id → 201.
//   3. GET /api/letter-templates → count_after === count_before + 1.
//
// USAGE:
//   npx tsx tests/probes/letter-template-usage-increment.ts --cookie="sb-…=…"

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> { data?: T }
interface TemplateRow { id: string; name: string; usage_count: number }
interface LetterRow { id: string }

async function http<T>(path: string, opts: { method: string; body?: unknown } = { method: 'GET' }) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = await res.json() as Envelope<T> } catch { body = {} }
  return { status: res.status, body }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = expected === actual
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${expected}, got=${actual})`)
  return ok
}

async function main() {
  console.log(`\nW29-L3 template usage_count increment probe at ${BASE}\n`)
  const results: boolean[] = []

  // ── Step 1: GET templates, pick first one ─────────────────────────────────
  const tplRes = await http<TemplateRow[] | { items: TemplateRow[] }>('/api/letter-templates', { method: 'GET' })
  results.push(check('GET /api/letter-templates → 200', 200, tplRes.status))

  const rawData = tplRes.body.data
  const templates: TemplateRow[] = Array.isArray(rawData)
    ? rawData as TemplateRow[]
    : Array.isArray((rawData as { items?: TemplateRow[] })?.items)
      ? (rawData as { items: TemplateRow[] }).items
      : []

  if (templates.length === 0) {
    console.log('  SKIP  no templates found — seed templates before running this probe')
    process.exitCode = 1
    return
  }

  const template = templates[0]
  const countBefore = template.usage_count ?? 0
  console.log(`  INFO  using template "${template.name}" (id=${template.id}), count_before=${countBefore}`)

  // ── Step 2: Create letter from template ───────────────────────────────────
  const createRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: template.id ? 'inquiry' : 'inquiry',
      subject: `W29-L3-probe-${Date.now()}`,
      priority: 'standard',
      template_id: template.id,
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters with template_id → 201', 201, createRes.status))
  const letterId = (createRes.body.data as LetterRow | undefined)?.id

  // ── Step 3: GET templates again, assert count incremented ─────────────────
  // Small delay to let the RPC propagate
  await new Promise((r) => setTimeout(r, 300))

  const tplRes2 = await http<TemplateRow[] | { items: TemplateRow[] }>('/api/letter-templates', { method: 'GET' })
  const rawData2 = tplRes2.body.data
  const templates2: TemplateRow[] = Array.isArray(rawData2)
    ? rawData2 as TemplateRow[]
    : Array.isArray((rawData2 as { items?: TemplateRow[] })?.items)
      ? (rawData2 as { items: TemplateRow[] }).items
      : []

  const updated = templates2.find((t) => t.id === template.id)
  const countAfter = updated?.usage_count ?? 0
  console.log(`  INFO  count_after=${countAfter}`)

  results.push(check('usage_count incremented by 1', countBefore + 1, countAfter))

  // Cleanup
  if (letterId) {
    await http(`/api/letters/${letterId}`, { method: 'DELETE' })
  }

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
