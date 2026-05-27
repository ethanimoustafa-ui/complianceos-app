export {} // module scope

// W28-L7/L8: letter template survives-use probe.
//
// Asserts:
//   1. A newly created template appears in the template list.
//   2. Creating a letter from the template does NOT remove the template from the list.
//   3. After use, the template's usage_count is 1 (incremented server-side).
//
// USAGE:
//   npx tsx tests/probes/letters-template-survives-use.ts --cookie="sb-…=…"

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

interface Envelope<T = unknown> {
  data?: T
  error?: { code?: string; message?: string }
}
interface TemplateRow { id: string; name: string; status: string; usage_count: number }
interface LetterRow { id: string; reference: string; status: string }

async function http<T = unknown>(
  path: string,
  opts: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: {
      cookie: COOKIE,
      'content-type': 'application/json',
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

function check(label: string, expected: number, actual: number, detail = ''): boolean {
  const ok = actual === expected
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  HTTP ${actual} (expected ${expected})${detail ? '  ' + detail : ''}`)
  return ok
}
function checkEq(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  →  "${String(actual)}" (expected "${String(expected)}")`)
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW28-L7/L8 template-survives-use probe at ${BASE}\n`)
  const results: boolean[] = []

  const templateName = `W28-probe-template-${Date.now()}`

  // Create a template
  console.log('[1] Create template')
  const createTmplRes = await http<TemplateRow>('/api/letter-templates', {
    method: 'POST',
    body: {
      name: templateName,
      type: 'inquiry',
      status: 'active',
      description: 'W28 probe template',
      placeholder_defs: [],
    },
  })
  results.push(check('POST /api/letter-templates → 201', 201, createTmplRes.status,
    createTmplRes.status !== 201 ? `body=${JSON.stringify(createTmplRes.body)}` : ''))
  const templateId = (createTmplRes.body.data as TemplateRow | undefined)?.id
  if (!templateId) {
    console.error('  FATAL: no templateId — aborting')
    process.exitCode = 1
    return
  }

  // Verify template appears in list
  console.log('\n[2] Template appears in list before use')
  const list1Res = await http<TemplateRow[]>('/api/letter-templates')
  const templates1 = Array.isArray(list1Res.body.data) ? list1Res.body.data : []
  const beforeUse = templates1.find((t) => t.id === templateId)
  results.push(checkEq('template in list before use', true, !!beforeUse))
  results.push(checkEq('template status = active', 'active', beforeUse?.status))
  results.push(checkEq('usage_count = 0 before use', 0, beforeUse?.usage_count ?? 0))

  // Create a letter from the template
  console.log('\n[3] Create letter from template')
  const createLetterRes = await http<LetterRow>('/api/letters', {
    method: 'POST',
    body: {
      authority: 'sama',
      type: 'inquiry',
      subject: `W28-probe-letter-from-template-${Date.now()}`,
      body: 'Probe letter body',
      priority: 'standard',
      template_id: templateId,
      framework_ids: [],
      placeholder_defs: [],
      placeholder_values: {},
    },
  })
  results.push(check('POST /api/letters (from template) → 201', 201, createLetterRes.status))
  const letterId = (createLetterRes.body.data as LetterRow | undefined)?.id

  // Verify template STILL appears in list after use
  console.log('\n[4] Template survives use — still in list')
  const list2Res = await http<TemplateRow[]>('/api/letter-templates')
  const templates2 = Array.isArray(list2Res.body.data) ? list2Res.body.data : []
  const afterUse = templates2.find((t) => t.id === templateId)
  results.push(checkEq('template STILL in list after use', true, !!afterUse))
  results.push(checkEq('template status still active after use', 'active', afterUse?.status))

  // usage_count should be 1 after one letter creation
  // Note: the server increments via RPC; we may need to refetch the specific template
  const tmplGetRes = await http<TemplateRow>(`/api/letter-templates/${templateId}`)
  const updatedTemplate = tmplGetRes.body.data as TemplateRow | undefined
  results.push(checkEq('usage_count = 1 after one use', 1, updatedTemplate?.usage_count ?? 0))

  // Cleanup
  if (letterId) await http(`/api/letters/${letterId}`, { method: 'DELETE' })
  await http(`/api/letter-templates/${templateId}`, { method: 'DELETE' })

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total} assertions passed`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  process.exitCode = 2
})
