export {} // module scope

// W29-O3 probe — POST /api/observations with a complete body does not 500.
//
// Root cause: toCreatePayload used `?? undefined` for remediation_submission_due,
// so an empty string '' (the form default when no date is chosen) passed
// validation as a non-nullish value, failing the server-side DateString min(1)
// guard → the Zod parse throws ValidationFailed (400) or causes a raw DB error
// (500 when the insert itself fails with a non-23505 code).
//
// The fix: use `|| undefined` so empty string is coerced to undefined, omitting
// the field entirely and satisfying DateString.optional().
//
// This probe reads the store source to confirm the fix is in place.
//
// USAGE:
//   npx tsx tests/probes/observation-create-200-not-500.ts

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
const SCHEMA = resolve('src/lib/api/schemas/observations.ts')

function probeEmptyStringCoercion(): boolean {
  console.log('\n[1] toCreatePayload uses || not ?? for remediation_submission_due')
  const src = readFileSync(STORE, 'utf-8')

  // Must use || undefined so empty string '' becomes undefined
  if (!src.includes('remediation_submission_due: data.remediationSubmissionDueDate || undefined')) {
    return fail('|| coercion', 'remediation_submission_due still uses ?? — empty string would be sent and fail min(1)')
  }
  return pass('|| coercion', 'empty remediationSubmissionDueDate correctly omitted via || undefined')
}

function probeSchemaNoReference(): boolean {
  console.log('\n[2] CreateObservationSchema does not accept a client-supplied reference')
  const src = readFileSync(SCHEMA, 'utf-8')

  // The schema is .strict() and must NOT have a reference field
  const schemaStart = src.indexOf('export const CreateObservationSchema')
  if (schemaStart === -1) return fail('schema found', 'CreateObservationSchema not found')
  // Look for reference field within the schema object
  const schemaBody = src.slice(schemaStart, src.indexOf('.strict()', schemaStart) + 10)
  if (/\breference\b/.test(schemaBody)) {
    return fail('no reference field', 'CreateObservationSchema contains a reference field — should be server-generated')
  }
  return pass('no reference field', 'reference is absent from CreateObservationSchema (server-generated)')
}

function probeStrictSchema(): boolean {
  console.log('\n[3] CreateObservationSchema is .strict() (rejects unknown keys)')
  const src = readFileSync(SCHEMA, 'utf-8')

  const schemaStart = src.indexOf('export const CreateObservationSchema')
  if (schemaStart === -1) return fail('schema found', 'CreateObservationSchema not found')
  const schemaBody = src.slice(schemaStart, schemaStart + 600)
  if (!schemaBody.includes('.strict()')) {
    return fail('.strict()', 'CreateObservationSchema is not .strict() — unknown keys would pass through')
  }
  return pass('.strict()', 'schema rejects unknown keys at parse boundary')
}

function main() {
  console.log('W29-O3 observation-create-200-not-500 probe')
  const results = [probeEmptyStringCoercion(), probeSchemaNoReference(), probeStrictSchema()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
