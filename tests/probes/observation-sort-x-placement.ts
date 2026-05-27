export {} // module scope

// W29-O1 probe — Sort X (clear-sort button) is inline with the column header,
// not a separate chip below the table.
//
// The fix mirrors the LetterSortHeader pattern: the X lives inside the SortIcon
// component, rendered next to the chevron inside the <th>, not as a separate
// block-level element outside the <table>.
//
// USAGE:
//   npx tsx tests/probes/observation-sort-x-placement.ts

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

function probeXInsideSortIcon(): boolean {
  console.log('\n[1] Clear-sort X is inside SortIcon (inline with chevron)')
  const src = readFileSync(FILE, 'utf-8')

  // SortIcon must contain the X button
  const sortIconStart = src.indexOf('const SortIcon')
  if (sortIconStart === -1) return fail('SortIcon', 'SortIcon not found')

  // Find the end of SortIcon (next const/function declaration or closing })
  const sortIconBody = src.slice(sortIconStart, sortIconStart + 1500)

  if (!sortIconBody.includes('handleClearSort')) {
    return fail('X in SortIcon', 'handleClearSort not found inside SortIcon body')
  }
  if (!sortIconBody.includes('lucide:x')) {
    return fail('X icon in SortIcon', 'lucide:x icon not found inside SortIcon body')
  }
  return pass('X in SortIcon', 'clear-sort button is inside the SortIcon component')
}

function probeNoSeparateChip(): boolean {
  console.log('\n[2] No separate "Sorted by" chip block outside the table')
  const src = readFileSync(FILE, 'utf-8')

  // The old pattern was a block-level <div> with "sortedBy" text before the table
  // We assert that pattern is gone: no standalone sortedBy chip div above the table
  const hasSeparateChip = src.includes('sortedBy') && src.includes('bg-emerald-50 border border-emerald-200 rounded-full')
  if (hasSeparateChip) {
    return fail('no separate chip', 'standalone "Sorted by" chip block still present — X should be inline')
  }
  return pass('no separate chip', 'standalone sort chip block removed')
}

function probeThContainsSortIconWithX(): boolean {
  console.log('\n[3] Column <th> renders SortIcon which may contain the X')
  const src = readFileSync(FILE, 'utf-8')

  // Each <th> should render <SortIcon field="..." />
  const thCount = (src.match(/<SortIcon field=/g) ?? []).length
  if (thCount < 3) {
    return fail('SortIcon in th', `expected ≥3 SortIcon usages in th, found ${thCount}`)
  }
  return pass('SortIcon in th', `${thCount} column headers use SortIcon`)
}

function main() {
  console.log('W29-O1 observation-sort-x-placement probe')
  const results = [probeXInsideSortIcon(), probeNoSeparateChip(), probeThContainsSortIconWithX()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
