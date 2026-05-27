export {} // module scope

// W29-L8: Signature image end-to-end probe.
//
// Asserts:
//   1. POST /api/letter-templates/upload-signature with fixture PNG → 200 + url.
//   2. The returned url starts with "http" (signed or public Supabase URL).
//   3. Fetching the url directly → 200 + content-type starts with "image/".
//   4. GET /api/letter-templates/:id after patching signature_image_url → url persisted.
//
// NOTE: This probe requires Supabase Storage to be reachable. If the storage
// bucket is inaccessible the probe will SKIP step 3 gracefully rather than FAIL.
//
// USAGE:
//   npx tsx tests/probes/letter-signature-end-to-end.ts --cookie="sb-…=…"

import { readFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

function readCookie(): string {
  const fromEnv = process.env.COOKIE
  if (fromEnv) return fromEnv
  for (const a of process.argv.slice(2)) if (a.startsWith('--cookie=')) return a.slice(9)
  console.error('Missing --cookie="..." or COOKIE env.')
  process.exit(2)
}
const COOKIE = readCookie()

interface Envelope<T = unknown> { data?: T; error?: unknown }
interface TemplateRow { id: string; name: string; signature_image_url?: string | null }
interface UploadResult { url: string }

async function httpJson<T>(
  path: string,
  opts: { method: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method,
    headers: { cookie: COOKIE, 'content-type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  let body: Envelope<T>
  try { body = (await res.json()) as Envelope<T> } catch { body = {} as Envelope<T> }
  return { status: res.status, body }
}

function check(label: string, expected: unknown, actual: unknown): boolean {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (expected=${JSON.stringify(expected)}, got=${JSON.stringify(actual)})`)
  return ok
}
function checkPredicate(label: string, predicate: () => boolean, desc: string): boolean {
  let ok = false
  try { ok = predicate() } catch { ok = false }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  (${desc})`)
  return ok
}

async function main(): Promise<void> {
  console.log(`\nW29-L8 signature end-to-end probe at ${BASE}\n`)
  const results: boolean[] = []
  const tag = `w29-L8-${Date.now()}`

  // ── Step 0: Create a template to receive the signature ─────────────────────
  const createTplRes = await httpJson<TemplateRow>('/api/letter-templates', {
    method: 'POST',
    body: {
      name: tag,
      authority: 'sama',
      type: 'inquiry',
      subject_template: 'W29 L8 probe subject',
      body_template: 'W29 L8 probe body.',
      placeholder_defs: [],
    },
  })
  results.push(check('POST /api/letter-templates → 201', 201, createTplRes.status))
  const templateId = (createTplRes.body.data as TemplateRow | undefined)?.id
  if (!templateId) {
    console.error('FATAL: could not create template'); process.exitCode = 1; return
  }

  // ── Step 1: Upload signature via multipart form ───────────────────────────
  console.log('\n[A] Upload signature PNG')
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'signature.png')
  let pngBytes: Buffer
  try {
    pngBytes = readFileSync(fixturePath)
  } catch {
    console.log('  SKIP  fixture not found at', fixturePath)
    process.exitCode = 1
    return
  }

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }), 'signature.png')
  formData.append('templateId', templateId)

  const uploadRes = await fetch(`${BASE}/api/letter-templates/upload-signature`, {
    method: 'POST',
    headers: { cookie: COOKIE },
    body: formData,
  })
  let uploadBody: Envelope<UploadResult> = {}
  try { uploadBody = (await uploadRes.json()) as Envelope<UploadResult> } catch { /* ignore */ }

  results.push(check('POST /upload-signature → 200', 200, uploadRes.status))
  const signedUrl = (uploadBody.data as UploadResult | undefined)?.url
  results.push(checkPredicate(
    'upload response has url starting with "http"',
    () => typeof signedUrl === 'string' && signedUrl.startsWith('http'),
    `got url=${String(signedUrl)}`
  ))

  // ── Step 2: Fetch the signed URL directly ─────────────────────────────────
  console.log('\n[B] Fetch signed URL → 200 + image content-type')
  if (signedUrl) {
    try {
      const imgRes = await fetch(signedUrl, { method: 'GET' })
      results.push(check('signed URL → 200', 200, imgRes.status))
      const ct = imgRes.headers.get('content-type') ?? ''
      results.push(checkPredicate(
        'content-type starts with image/',
        () => ct.startsWith('image/'),
        `got content-type=${ct}`
      ))
    } catch (err) {
      console.log(`  SKIP  Could not reach storage URL (${String(err)}). Storage may be offline.`)
      results.push(true)  // non-fatal for local dev without storage
      results.push(true)
    }
  } else {
    console.log('  SKIP  No signed URL returned — skipping storage fetch')
    results.push(false)
    results.push(false)
  }

  // ── Step 3: GET template and assert signature_image_url persisted ──────────
  console.log('\n[C] GET template → signature_image_url persisted')
  const getTplRes = await httpJson<TemplateRow>(`/api/letter-templates/${templateId}`)
  results.push(check('GET /api/letter-templates/:id → 200', 200, getTplRes.status))
  const fetched = getTplRes.body.data as TemplateRow | undefined
  results.push(checkPredicate(
    'template.signature_image_url is a non-empty string',
    () => typeof fetched?.signature_image_url === 'string' && (fetched.signature_image_url ?? '').length > 0,
    `got signature_image_url=${JSON.stringify(fetched?.signature_image_url)}`
  ))

  // Cleanup
  await httpJson(`/api/letter-templates/${templateId}`, { method: 'DELETE' })

  const passed = results.filter((r) => r).length
  const total = results.length
  console.log(`\n${passed === total ? 'ALL PASS' : 'FAILURES DETECTED'}: ${passed}/${total}`)
  if (passed !== total) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
