// Wave-19 / Q1 — Unit tests for `refCodeSlug`. The slug is the deterministic
// part of the ref_code algorithm; the sequence half is exercised at the HTTP
// layer by `policy-concurrent-create.ts`.

import { describe, it, expect } from 'vitest'
import { refCodeSlug } from '../../src/lib/api/services/refcode'

describe('refCodeSlug', () => {
  it('takes the first 3 alpha chars of a clean name', () => {
    expect(refCodeSlug('Information Security Policy')).toBe('INF')
    expect(refCodeSlug('Risk Management')).toBe('RIS')
  })

  it('strips non-alpha then takes 3', () => {
    // "5G Network" → strip "5", "" → "GNETWORK" → "GNE"
    expect(refCodeSlug('5G Network')).toBe('GNE')
    // "AB-12 Policy" → strip "-12 ", "" → "ABPOLICY" → "ABP"
    expect(refCodeSlug('AB-12 Policy')).toBe('ABP')
  })

  it('pads with X when fewer than 3 alpha chars exist', () => {
    expect(refCodeSlug('Q1')).toBe('QXX')
    expect(refCodeSlug('AB')).toBe('ABX')
    expect(refCodeSlug('A')).toBe('AXX')
  })

  it('returns XXX for an empty / whitespace / digit-only name', () => {
    expect(refCodeSlug('')).toBe('XXX')
    expect(refCodeSlug('   ')).toBe('XXX')
    expect(refCodeSlug('12345')).toBe('XXX')
    expect(refCodeSlug('!@#$%')).toBe('XXX')
  })

  it('uppercases the result', () => {
    expect(refCodeSlug('information security')).toBe('INF')
    expect(refCodeSlug('aBcDeF')).toBe('ABC')
  })

  it('handles unicode by stripping it (algorithm uses ASCII [A-Za-z])', () => {
    // Arabic name with no Latin chars → XXX
    expect(refCodeSlug('سياسة المعلومات')).toBe('XXX')
    // Mixed: Latin chars survive
    expect(refCodeSlug('سياسة Policy A')).toBe('POL')
  })
})
