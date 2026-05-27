export {} // module scope

// W29-O6 probe — Delete observation fires directly without a confirm modal.
//
// The spec: clicking Delete in the row actions menu fires the DELETE immediately
// (no confirmation dialog), removes the row after server responds (D1), and
// shows a success toast.
//
// USAGE:
//   npx tsx tests/probes/observation-delete-no-confirm.ts

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

function probeNoDeleteDialog(): boolean {
  console.log('\n[1] DeleteConfirmationDialog not rendered in observations page')
  const src = readFileSync(PAGE, 'utf-8')

  if (src.includes('DeleteConfirmationDialog')) {
    return fail('no dialog', 'DeleteConfirmationDialog is still in the observations page — dialog should be removed')
  }
  if (src.includes('isDeleteDialogOpen')) {
    return fail('no dialog state', 'isDeleteDialogOpen state still present — dialog should be removed')
  }
  return pass('no dialog', 'DeleteConfirmationDialog removed from observations page')
}

function probeDeleteFiresDirectly(): boolean {
  console.log('\n[2] handleDeleteClick calls deleteObservation directly')
  const src = readFileSync(PAGE, 'utf-8')

  // handleDeleteClick must await deleteObservation
  if (!src.includes('await deleteObservation')) {
    return fail('direct delete', 'handleDeleteClick does not directly await deleteObservation')
  }
  // Must not open a dialog
  if (src.includes('setIsDeleteDialogOpen(true)')) {
    return fail('no dialog open', 'handleDeleteClick still opens the delete dialog')
  }
  return pass('direct delete', 'handleDeleteClick fires deleteObservation directly')
}

function probeToastOnDelete(): boolean {
  console.log('\n[3] Success toast shown after delete')
  const src = readFileSync(PAGE, 'utf-8')

  if (!src.includes('pushToast')) {
    return fail('toast', 'pushToast not called after delete — user gets no feedback')
  }
  return pass('toast', 'pushToast called after successful delete')
}

function main() {
  console.log('W29-O6 observation-delete-no-confirm probe')
  const results = [probeNoDeleteDialog(), probeDeleteFiresDirectly(), probeToastOnDelete()]
  const passed = results.filter(Boolean).length
  console.log(`\nResult: ${passed}/${results.length} probes passed`)
  if (passed !== results.length) process.exitCode = 1
}

main()
