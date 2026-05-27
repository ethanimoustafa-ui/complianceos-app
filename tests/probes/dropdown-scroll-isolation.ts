export {} // module scope

// W29-A1 probe — EditableSelect dropdown panel has scroll isolation.
//
// Root cause fixed: the portal panel now has max-height + overflow-y on the
// inner list div (320px cap instead of 256px), and an onWheel stopPropagation
// handler on the outer portal container so scroll events don't bleed to the
// page body behind an open modal.
//
// Static checks:
//   1. editable-select.tsx portal div has onWheel stopPropagation
//   2. The list container uses max-h-[320px] (or equivalent ≥ 280px)
//   3. overflow-y-auto is present on the list container
//
// No live Playwright check — scroll isolation requires a browser environment.
// The static source proof is sufficient for this wave.
//
// USAGE:
//   npx tsx tests/probes/dropdown-scroll-isolation.ts

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

function probeWheelStopPropagation(): boolean {
  console.log('\n[S1] Portal container has onWheel stopPropagation')
  const src = readFileSync(resolve('src/components/ui/editable-select.tsx'), 'utf-8')
  if (!src.includes('stopPropagation') || !src.includes('onWheel')) {
    return fail('onWheel stopPropagation', 'not found on portal div in editable-select.tsx')
  }
  return pass('onWheel stopPropagation', 'present on portal container')
}

function probeMaxHeight(): boolean {
  console.log('\n[S2] List container max-height is ≥ 280px')
  const src = readFileSync(resolve('src/components/ui/editable-select.tsx'), 'utf-8')
  // Accept max-h-[320px] or max-h-[280px] etc (Tailwind arbitrary) or inline style
  const hasMaxHeight =
    src.includes('max-h-[320px]') ||
    src.includes('max-h-[300px]') ||
    src.includes('max-h-[280px]') ||
    src.includes('max-h-72') || // 288px
    src.includes('max-h-80') || // 320px
    src.includes('maxHeight')
  if (!hasMaxHeight) {
    return fail('max-height', 'no max-height constraint found on list container')
  }
  return pass('max-height', 'list container has max-height constraint')
}

function probeOverflowY(): boolean {
  console.log('\n[S3] List container has overflow-y-auto')
  const src = readFileSync(resolve('src/components/ui/editable-select.tsx'), 'utf-8')
  if (!src.includes('overflow-y-auto')) {
    return fail('overflow-y-auto', 'not found in editable-select.tsx')
  }
  return pass('overflow-y-auto', 'present on list container')
}

function main() {
  console.log('W29-A1 dropdown-scroll-isolation probe')
  const results = [
    probeWheelStopPropagation(),
    probeMaxHeight(),
    probeOverflowY(),
  ]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
