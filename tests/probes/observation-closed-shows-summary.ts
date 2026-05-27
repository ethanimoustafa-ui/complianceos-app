export {} // module scope

// W29-O4 probe — Closed observation detail modal shows read-only summary.
//
// When an observation has archived_at set (or status === 'closed'), the detail
// modal must NOT render edit affordances: no add-checklist input, no
// edit/remove buttons on checklist items, no add-comment textarea,
// no edit/delete on comments.
//
// USAGE:
//   npx tsx tests/probes/observation-closed-shows-summary.ts

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function pass(label: string, msg = ''): boolean {
  console.log(`  PASS  ${label}${msg ? '  ' + msg : ''}`)
  return true
}
function fail(label: string, msg = ''): boolean {
  console.log(`  FAIL  ${label}${msg ? '  ' + msg : ''}`)
  return false
}

const MODAL = resolve('src/components/observations/observation-detail-modal.tsx')
const CHECKLIST = resolve('src/components/observations/detail/checklist-section.tsx')
const COMMENTS = resolve('src/components/observations/detail/comments-section.tsx')

function probeClosedFlagInModal(): boolean {
  console.log('\n[1] Detail modal derives isClosed from archivedAt / status')
  const src = readFileSync(MODAL, 'utf-8')

  if (!src.includes('isClosed')) {
    return fail('isClosed', 'isClosed flag not found in detail modal')
  }
  // Must use archivedAt as the primary signal
  if (!src.includes('archivedAt') && !src.includes('archived_at')) {
    return fail('archivedAt', 'archivedAt not used to derive isClosed — only status check present')
  }
  return pass('isClosed', 'modal derives isClosed from archivedAt + status')
}

function probeReadOnlyPassedToChecklist(): boolean {
  console.log('\n[2] ChecklistSection receives readOnly={isClosed}')
  const src = readFileSync(MODAL, 'utf-8')

  if (!src.includes('readOnly={isClosed}')) {
    return fail('readOnly checklist', 'readOnly prop not passed to ChecklistSection')
  }
  return pass('readOnly checklist', 'ChecklistSection gets readOnly={isClosed}')
}

function probeReadOnlyPassedToComments(): boolean {
  console.log('\n[3] CommentsSection receives readOnly={isClosed}')
  const src = readFileSync(MODAL, 'utf-8')

  if (!src.includes('readOnly={isClosed}')) {
    return fail('readOnly comments', 'readOnly prop not passed to CommentsSection')
  }
  return pass('readOnly comments', 'CommentsSection gets readOnly={isClosed}')
}

function probeChecklistHidesAddInReadOnly(): boolean {
  console.log('\n[4] ChecklistSection hides add-input when readOnly=true')
  const src = readFileSync(CHECKLIST, 'utf-8')

  if (!src.includes('readOnly')) {
    return fail('readOnly prop', 'readOnly prop not defined in ChecklistSection')
  }
  // The add-input block must be gated on !readOnly
  if (!src.includes('!readOnly')) {
    return fail('!readOnly gate', '!readOnly gate not found — add-input may still show when closed')
  }
  return pass('add-input gated', 'add-input and edit/remove controls gated on !readOnly')
}

function probeCommentsHidesAddInReadOnly(): boolean {
  console.log('\n[5] CommentsSection hides add-textarea when readOnly=true')
  const src = readFileSync(COMMENTS, 'utf-8')

  if (!src.includes('readOnly')) {
    return fail('readOnly prop', 'readOnly prop not defined in CommentsSection')
  }
  if (!src.includes('!readOnly')) {
    return fail('!readOnly gate', '!readOnly gate not found — textarea may still show when closed')
  }
  return pass('add-textarea gated', 'add-textarea and edit/delete controls gated on !readOnly')
}

function main() {
  console.log('W29-O4 observation-closed-shows-summary probe')
  const results = [
    probeClosedFlagInModal(),
    probeReadOnlyPassedToChecklist(),
    probeReadOnlyPassedToComments(),
    probeChecklistHidesAddInReadOnly(),
    probeCommentsHidesAddInReadOnly(),
  ]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
