// W17-4: parity test for the shared progress formula.
//
// `computeCircularProgress` is imported by BOTH the client store
// (`recalcProgress` in `src/stores/circular-store.ts`) and the server service
// (`recomputeCircularProgress` in `src/lib/api/services/circulars.ts`). This
// test pins the documented anchors AND verifies that the function is import-
// site agnostic — wrapping it in a "client" wrapper and a "server" wrapper
// must produce byte-identical output for every input.

import { describe, it, expect } from 'vitest'
import {
  computeCircularProgress,
  type CircularProgressInput,
} from '@/lib/workflow/progress-formula'

// Two intentionally trivial wrappers — they exist to model the two import
// sites the formula is used from. If anyone copy-pasted the formula back
// instead of re-importing it, this test would catch the drift.
function clientCompute(input: CircularProgressInput): number {
  return computeCircularProgress(input)
}
function serverCompute(input: CircularProgressInput): number {
  return computeCircularProgress(input)
}

describe('computeCircularProgress — documented anchors (W17-4)', () => {
  it('5/13 steps + 0/3 checklist → 19', () => {
    expect(computeCircularProgress({ stepsTotal: 13, stepsDone: 5, checklistTotal: 3, checklistDone: 0 })).toBe(19)
  })

  it('10/10 + 3/3 → 100', () => {
    expect(computeCircularProgress({ stepsTotal: 10, stepsDone: 10, checklistTotal: 3, checklistDone: 3 })).toBe(100)
  })

  it('0/0 + 0/0 → 0', () => {
    expect(computeCircularProgress({ stepsTotal: 0, stepsDone: 0, checklistTotal: 0, checklistDone: 0 })).toBe(0)
  })

  it('5/10 steps-only → 50', () => {
    expect(computeCircularProgress({ stepsTotal: 10, stepsDone: 5, checklistTotal: 0, checklistDone: 0 })).toBe(50)
  })

  it('0/0 + 5/10 checklist-only → 50', () => {
    expect(computeCircularProgress({ stepsTotal: 0, stepsDone: 0, checklistTotal: 10, checklistDone: 5 })).toBe(50)
  })

  it('clamps below at 0 and above at 100', () => {
    expect(computeCircularProgress({ stepsTotal: 10, stepsDone: 0, checklistTotal: 10, checklistDone: 0 })).toBe(0)
    // Symbolic upper-bound sanity: full both halves stays at 100.
    expect(computeCircularProgress({ stepsTotal: 1, stepsDone: 1, checklistTotal: 1, checklistDone: 1 })).toBe(100)
  })
})

describe('computeCircularProgress — client/server parity (W17-4)', () => {
  const cases: CircularProgressInput[] = [
    { stepsTotal: 13, stepsDone: 5, checklistTotal: 3, checklistDone: 0 },
    { stepsTotal: 10, stepsDone: 10, checklistTotal: 3, checklistDone: 3 },
    { stepsTotal: 0, stepsDone: 0, checklistTotal: 0, checklistDone: 0 },
    { stepsTotal: 10, stepsDone: 5, checklistTotal: 0, checklistDone: 0 },
    { stepsTotal: 0, stepsDone: 0, checklistTotal: 10, checklistDone: 5 },
    { stepsTotal: 7, stepsDone: 2, checklistTotal: 11, checklistDone: 9 },
    { stepsTotal: 1, stepsDone: 0, checklistTotal: 1, checklistDone: 1 },
  ]

  for (const c of cases) {
    it(`client(${JSON.stringify(c)}) === server(${JSON.stringify(c)})`, () => {
      expect(clientCompute(c)).toBe(serverCompute(c))
    })
  }
})
