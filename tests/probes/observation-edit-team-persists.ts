export {} // module scope

// W29-O7 probe — Edit observation: team members persist after save.
//
// Root cause: handleEditSave called updateObservation which does a PATCH on
// scalar fields only. Assignees live in observation_assignees and need a
// separate POST /observations/{id}/assign. Without that call, team-member
// changes were local-only and vanished on the next page reload.
//
// Fix: handleEditSave now calls api.post('/observations/{id}/assign', ...)
// when updates.assignees is defined.
//
// Also O7: the observation creator is excluded from the assignee picker (they
// are already the Observation Leader; adding them twice is confusing).
//
// USAGE:
//   npx tsx tests/probes/observation-edit-team-persists.ts

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

const PAGE = resolve('src/app/(dashboard)/correspondence/observations/page.tsx')
const EDIT_MODAL = resolve('src/components/observations/edit-observation-modal.tsx')

function probeEditSaveCallsAssign(): boolean {
  console.log('\n[1] handleEditSave calls /assign endpoint when assignees change')
  const src = readFileSync(PAGE, 'utf-8')

  if (!src.includes('/assign')) {
    return fail('/assign call', 'handleEditSave does not call /assign — team member changes not persisted')
  }
  if (!src.includes('updates.assignees !== undefined')) {
    return fail('assignees guard', 'no assignees guard before /assign call')
  }
  return pass('/assign on edit', 'handleEditSave calls /assign to persist team-member changes')
}

function probeCreatorExcludedFromPicker(): boolean {
  console.log('\n[2] Edit modal excludes observation creator from assignee picker')
  const src = readFileSync(EDIT_MODAL, 'utf-8')

  if (!src.includes('creatorId')) {
    return fail('creatorId', 'creatorId not referenced in edit modal — creator may appear in assignee picker')
  }
  // Must filter by !== creatorId
  if (!src.includes('!== observation?.creatorId') && !src.includes('!== observation.creatorId')) {
    return fail('creator filter', 'creator not filtered from active members in edit modal')
  }
  return pass('creator excluded', 'observation creator excluded from assignee picker in edit modal')
}

function probeAssigneesInEditForm(): boolean {
  console.log('\n[3] Edit modal initialises selectedAssignees from observation.assignees')
  const src = readFileSync(EDIT_MODAL, 'utf-8')

  if (!src.includes('selectedAssignees') || !src.includes('setSelectedAssignees')) {
    return fail('selectedAssignees', 'selectedAssignees state not found in edit modal')
  }
  if (!src.includes('existingAssignees')) {
    return fail('existing assignees', 'existing assignees not hydrated from observation prop')
  }
  return pass('assignees hydrated', 'edit modal initialises assignees from observation.assignees')
}

function main() {
  console.log('W29-O7 observation-edit-team-persists probe')
  const results = [probeEditSaveCallsAssign(), probeCreatorExcludedFromPicker(), probeAssigneesInEditForm()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
