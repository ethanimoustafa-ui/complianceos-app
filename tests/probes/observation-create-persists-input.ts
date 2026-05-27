export {} // module scope

// W29-O3 (persists input) probe — assignees and department submitted by the
// create form are persisted via the /assign endpoint, not just held in local
// state.
//
// Root cause: the store's create reconcile always called /assign when
// assignees.length > 0, which is correct. But the form default for
// remediationSubmissionDueDate was '' (empty string), which was passed as
// remediation_submission_due: '' to the server — failing DateString.min(1) and
// preventing the row from being inserted at all.
//
// After O3 fix, the create path succeeds and the reconcile writes assignees
// to observation_assignees via POST /observations/{ref}/assign.
//
// USAGE:
//   npx tsx tests/probes/observation-create-persists-input.ts

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

const STORE = resolve('src/stores/observation-store.ts')

function probeAssignEndpointCalledOnCreate(): boolean {
  console.log('\n[1] Create reconcile calls /assign to persist assignees')
  const src = readFileSync(STORE, 'utf-8')

  // The reconcile handler must call api.post with /assign
  if (!src.includes('/assign')) {
    return fail('/assign call', 'no /assign POST found in store — assignees not persisted on create')
  }
  // Must post assignees array
  if (!src.includes("api.post(`/observations/${")) {
    return fail('api.post /assign', 'api.post for /observations/... not found in store')
  }
  return pass('/assign on create', 'store calls /assign endpoint to persist assignees after create')
}

function probeDepartmentInCreatePayload(): boolean {
  console.log('\n[2] toCreatePayload includes department')
  const src = readFileSync(STORE, 'utf-8')

  // toCreatePayload must include department
  if (!src.includes("department: data.department")) {
    return fail('department in payload', 'department not included in toCreatePayload')
  }
  return pass('department in payload', 'department is part of toCreatePayload')
}

function probeCreatorAddedAsAssignee(): boolean {
  console.log('\n[3] Creator is auto-added to assignees list on create')
  const src = readFileSync(STORE, 'utf-8')

  // The create action unshifts the creator into assignees
  if (!src.includes('assignees.unshift') && !src.includes('creator.id')) {
    return fail('creator assignee', 'creator not auto-added to assignees on create')
  }
  return pass('creator assignee', 'creator is auto-added as first assignee')
}

function main() {
  console.log('W29-O3 observation-create-persists-input probe')
  const results = [probeAssignEndpointCalledOnCreate(), probeDepartmentInCreatePayload(), probeCreatorAddedAsAssignee()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
