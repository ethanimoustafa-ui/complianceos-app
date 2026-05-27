export {} // module scope

// W29-O2 probe — No "Department is required" error on fresh modal open.
//
// The regression: W28 claimed this was fixed, but the touched/errors state was
// not reset between open/close cycles. If a user previously submitted with an
// empty department, then closed and re-opened the modal, errors.department was
// still set and touched.department was still true — causing the error to show
// on mount without any interaction.
//
// The fix: a useEffect that resets errors + touched when isOpen becomes false.
//
// USAGE:
//   npx tsx tests/probes/observation-create-no-spurious-dept-error.ts

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

const MODAL = resolve('src/components/observations/add-observation-modal.tsx')

function probeTouchedGateOnDepartmentError(): boolean {
  console.log('\n[1] Department error is gated on touched.department')
  const src = readFileSync(MODAL, 'utf-8')

  // The error prop passed to DepartmentField must be conditional on touched.department
  if (!src.includes('touched.department')) {
    return fail('touched gate', 'touched.department not referenced in modal — error may show unconditionally')
  }
  // The error prop should not render the raw errors.department without a touched guard
  if (src.includes('error={errors.department}') && !src.includes('touched.department ? errors.department')) {
    return fail('touched gate on prop', 'errors.department passed directly without touched guard')
  }
  return pass('touched gate', 'errors.department is gated behind touched.department')
}

function probeResetOnClose(): boolean {
  console.log('\n[2] errors + touched reset when modal closes (isOpen → false)')
  const src = readFileSync(MODAL, 'utf-8')

  // Must have a useEffect that watches isOpen and resets errors/touched
  if (!src.includes('setErrors({})') || !src.includes('setTouched({})')) {
    return fail('reset on close', 'setErrors({}) or setTouched({}) not found — state leaks between opens')
  }
  // The reset must be inside a condition that checks !isOpen
  if (!src.includes('!isOpen')) {
    return fail('isOpen condition', '!isOpen guard not found — reset may not be conditional on close')
  }
  return pass('reset on close', 'errors and touched reset when modal closes')
}

function main() {
  console.log('W29-O2 observation-create-no-spurious-dept-error probe')
  const results = [probeTouchedGateOnDepartmentError(), probeResetOnClose()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
