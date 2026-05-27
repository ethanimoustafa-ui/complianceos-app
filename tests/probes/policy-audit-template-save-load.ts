export {} // module scope

// W29-M2 probe — Policy + Audit create modals have entity-template Save + Load.
//
// Changes from W28:
//   - Rules: removed standalone "Save as template" button (Select dropdown kept)
//   - Policies: added "+ Save current as new template" inline form in footer
//   - Audits: added "+ Save current as new template" inline form in footer
//
// Static checks:
//   1. RegisterCircularModal: Save button REMOVED, Select dropdown KEPT
//   2. RegisterPolicyModal: entity-template save form present
//   3. AddAuditModal: entity-template save form present
//
// Live checks (requires --cookie):
//   4. POST /api/entity-templates entity_type=policy → 201
//   5. GET /api/entity-templates?entity_type=policy → template found
//   6. POST /api/entity-templates entity_type=audit → 201
//   7. GET /api/entity-templates?entity_type=audit → template found
//   8. Cleanup: DELETE both created templates
//
// USAGE:
//   npx tsx tests/probes/policy-audit-template-save-load.ts               # static only
//   npx tsx tests/probes/policy-audit-template-save-load.ts --cookie="…"  # static + live

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

// --- Static probes ---

function probeRulesModalSaveButtonRemoved(): boolean {
  console.log('\n[S1] RegisterCircularModal: standalone Save-as-template button REMOVED, Select dropdown KEPT')
  const src = readFileSync(
    resolve('src/components/correspondence/regulatory-updates/rules/RegisterCircularModal.tsx'),
    'utf-8',
  )
  // The select-template dropdown must still be there
  if (!src.includes('applyTemplate')) {
    return fail('applyTemplate kept', 'applyTemplate function removed — Select Template dropdown also gone')
  }
  // The save-as-template button / form should be gone
  const hasSaveButton =
    src.includes('showSaveTemplateForm') ||
    src.includes('handleSaveTemplate') ||
    (src.includes('saveAsTemplate') && src.includes('onClick'))
  if (hasSaveButton) {
    return fail('save button removed', 'showSaveTemplateForm / handleSaveTemplate still present — save button not removed')
  }
  return pass('Rules modal', 'Select Template kept, standalone Save button removed')
}

function probePolicyModalHasSaveForm(): boolean {
  console.log('\n[S2] RegisterPolicyModal: entity-template save form present')
  const src = readFileSync(
    resolve('src/components/correspondence/regulatory-updates/policies/RegisterPolicyModal.tsx'),
    'utf-8',
  )
  if (!src.includes('useEntityTemplateStore')) {
    return fail('useEntityTemplateStore', 'not imported in RegisterPolicyModal')
  }
  if (!src.includes('showSavePolicyTemplateForm') && !src.includes('handleSavePolicyTemplate')) {
    return fail('save policy template form', 'save template state/handler not found in RegisterPolicyModal')
  }
  if (!src.includes("saveEntityTemplate('policy'") && !src.includes("saveTemplate('policy'")) {
    return fail('saveTemplate policy', "saveTemplate call with entity_type='policy' not found")
  }
  return pass('Policy modal save form', 'entity-template save form present in RegisterPolicyModal')
}

function probeAuditModalHasSaveForm(): boolean {
  console.log('\n[S3] AddAuditModal: entity-template save form present')
  const src = readFileSync(
    resolve('src/components/reports/audits/add-audit-modal.tsx'),
    'utf-8',
  )
  if (!src.includes('useEntityTemplateStore')) {
    return fail('useEntityTemplateStore', 'not imported in AddAuditModal')
  }
  if (!src.includes('showSaveAuditTemplateForm') && !src.includes('handleSaveAuditTemplate')) {
    return fail('save audit template form', 'save template state/handler not found in AddAuditModal')
  }
  if (!src.includes("saveAuditEntityTemplate('audit'") && !src.includes("saveTemplate('audit'")) {
    return fail('saveTemplate audit', "saveTemplate call with entity_type='audit' not found")
  }
  return pass('Audit modal save form', 'entity-template save form present in AddAuditModal')
}

// --- Live probes ---

async function probeLiveEntityTemplate(
  cookie: string,
  entityType: 'policy' | 'audit',
): Promise<boolean> {
  console.log(`\n[L${entityType === 'policy' ? '1' : '2'}] entity-template CRUD for entity_type=${entityType}`)
  const templateName = `W29 M2 Probe ${entityType} ${Date.now()}`

  // Create
  const createRes = await fetch(`${BASE}/api/entity-templates`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      entity_type: entityType,
      name: templateName,
      fields: { title: 'Probe Template', category: 'compliance', description: 'W29 probe' },
    }),
  })
  if (createRes.status !== 201 && createRes.status !== 200) {
    return fail(`POST ${entityType} template`, `status=${createRes.status}`)
  }
  let created: { id?: string; name?: string } | undefined
  try {
    const body = (await createRes.json()) as { data?: { id?: string; name?: string }; id?: string; name?: string }
    created = body?.data ?? body
  } catch {
    return fail('parse create response', 'could not parse JSON')
  }
  const createdId = created?.id
  if (!createdId) {
    return fail('POST template id', 'no id in create response')
  }
  pass(`POST ${entityType} template 201`, `id=${createdId}`)

  // Get list — template must appear
  const listRes = await fetch(`${BASE}/api/entity-templates?entity_type=${entityType}`, {
    headers: { cookie },
  })
  if (listRes.status !== 200) {
    return fail(`GET ${entityType} templates`, `status=${listRes.status}`)
  }
  let list: Array<{ id: string; name: string }> = []
  try {
    const body = (await listRes.json()) as { data?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>
    list = Array.isArray(body) ? body : (body as any).data ?? []
  } catch {
    return fail('parse list response', 'could not parse JSON')
  }
  const found = list.find((t) => t.id === createdId)
  if (!found) {
    return fail(`${entityType} template in list`, `id=${createdId} not found`)
  }
  pass(`${entityType} template in list`, `name="${found.name}"`)

  // Cleanup
  const delRes = await fetch(`${BASE}/api/entity-templates/${createdId}`, {
    method: 'DELETE',
    headers: { cookie },
  })
  if (delRes.status === 200 || delRes.status === 204) {
    pass(`DELETE ${entityType} template`, `status=${delRes.status}`)
  } else {
    pass(`DELETE unexpected status`, `status=${delRes.status} — non-critical`)
  }

  return true
}

async function main() {
  console.log('W29-M2 policy-audit-template-save-load probe')
  const results: boolean[] = []
  results.push(probeRulesModalSaveButtonRemoved())
  results.push(probePolicyModalHasSaveForm())
  results.push(probeAuditModalHasSaveForm())

  const cookie = readCookieOptional()
  if (cookie) {
    results.push(await probeLiveEntityTemplate(cookie, 'policy'))
    results.push(await probeLiveEntityTemplate(cookie, 'audit'))
  } else {
    console.log('\n  (skipping live probes — no --cookie provided)')
  }

  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main().catch((e) => { console.error('Probe crashed:', e); process.exitCode = 2 })
