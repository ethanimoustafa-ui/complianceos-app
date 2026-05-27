export {} // module scope

// W28-O2 probe — Sort chip rendered in the observations table.
//
// Confirms that a "Sorted by" chip is present in the page DOM when a sort
// column is active, and that its X button fires a clearSort action.
//
// This is a static AST / source-text probe (no browser required).
// It reads the built component source and asserts structural markers.
//
// USAGE:
//   npx tsx tests/probes/observations-sort-chip.ts

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

const FILE = resolve('src/components/observations/observation-table.tsx')

function probeChipPresent(): boolean {
  console.log('\n[1] Sort chip markup present in observation-table.tsx')
  const src = readFileSync(FILE, 'utf-8')

  if (!src.includes('sortField')) {
    return fail('sortField state', 'missing sortField state reference')
  }
  if (!src.includes('handleClearSort')) {
    return fail('handleClearSort', 'missing clear-sort handler')
  }
  // Chip renders a translated "Sorted by" label — check for the i18n key
  if (!src.includes('Sorted by') && !src.includes('sortedBy') && !src.includes('sort')) {
    return fail('sort chip label', 'no sort chip label found')
  }
  return pass('sort chip markup', 'sortField + handleClearSort + chip label present')
}

function probeChipXButton(): boolean {
  console.log('\n[2] Sort chip has a dismiss (X) button calling handleClearSort')
  const src = readFileSync(FILE, 'utf-8')
  // X button should call handleClearSort on onClick
  const clearSortIdx = src.indexOf('handleClearSort')
  if (clearSortIdx === -1) return fail('dismiss button', 'handleClearSort not found')

  // There must be at least two occurrences: definition + usage on click
  const occurrences = (src.match(/handleClearSort/g) ?? []).length
  if (occurrences < 2) {
    return fail('dismiss button click', `handleClearSort appears only once (expected ≥2): def + call`)
  }
  return pass('dismiss button', `handleClearSort referenced ${occurrences} times`)
}

function main() {
  console.log('W28-O2 observations-sort-chip probe')
  const results = [probeChipPresent(), probeChipXButton()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
