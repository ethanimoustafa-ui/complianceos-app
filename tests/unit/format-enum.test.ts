// W17-3: every Rules-page enum render must route through the shared
// formatter. This test pins (a) the value-to-key mapping by feeding a fake
// `t()` that returns the key verbatim, and (b) verifies fallback behaviour
// for unknown values, null and undefined.
//
// It also asserts the EN + AR dictionaries actually contain each key, so the
// chip never renders an unresolved key in either language.

import { describe, it, expect } from 'vitest'
import {
  formatStatus,
  formatPriority,
  formatApplicability,
  formatComplianceStatus,
  formatRiskLevel,
  formatActionType,
  formatDepartment,
  type DepartmentLike,
} from '@/lib/format/enum'
import enDict from '@/i18n/dictionaries/en.json'
import arDict from '@/i18n/dictionaries/ar.json'

// `t` fake: returns the dotted key, so we can assert the mapping directly.
const tEcho = ((k: string) => k) as Parameters<typeof formatStatus>[0]

// Walk a dotted path through the JSON dictionary.
function resolve(dict: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, seg) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[seg]
    }
    return undefined
  }, dict)
}

describe('formatStatus', () => {
  it('maps every known value to the documented i18n key', () => {
    expect(formatStatus(tEcho, 'pending')).toBe('regulatoryUpdates.statusPending')
    expect(formatStatus(tEcho, 'in-progress')).toBe('regulatoryUpdates.statusInProgress')
    expect(formatStatus(tEcho, 'completed')).toBe('regulatoryUpdates.statusCompleted')
    expect(formatStatus(tEcho, 'overdue')).toBe('regulatoryUpdates.statusOverdue')
  })
  it('falls back to the raw value for unknown enums', () => {
    expect(formatStatus(tEcho, 'archived')).toBe('archived')
  })
  it('returns empty string for null/undefined', () => {
    expect(formatStatus(tEcho, null)).toBe('')
    expect(formatStatus(tEcho, undefined)).toBe('')
  })
})

describe('formatPriority', () => {
  it('maps every known value', () => {
    expect(formatPriority(tEcho, 'critical')).toBe('regulatoryUpdates.critical')
    expect(formatPriority(tEcho, 'high')).toBe('regulatoryUpdates.high')
    expect(formatPriority(tEcho, 'medium')).toBe('regulatoryUpdates.medium')
    expect(formatPriority(tEcho, 'low')).toBe('regulatoryUpdates.low')
  })
})

describe('formatApplicability', () => {
  it('maps every known value', () => {
    expect(formatApplicability(tEcho, 'applicable')).toBe('regulatoryUpdates.applicable')
    expect(formatApplicability(tEcho, 'not-applicable')).toBe('regulatoryUpdates.notApplicable')
    expect(formatApplicability(tEcho, 'pending')).toBe('regulatoryUpdates.applicabilityPending')
  })
})

describe('formatComplianceStatus', () => {
  it('maps every known value', () => {
    expect(formatComplianceStatus(tEcho, 'compliant')).toBe('regulatoryUpdates.complianceCompliant')
    expect(formatComplianceStatus(tEcho, 'in-progress')).toBe('regulatoryUpdates.complianceInProgress')
    expect(formatComplianceStatus(tEcho, 'non-compliant')).toBe('regulatoryUpdates.complianceNonCompliant')
    expect(formatComplianceStatus(tEcho, 'not-started')).toBe('regulatoryUpdates.complianceNotStarted')
  })
})

describe('formatRiskLevel', () => {
  it('maps every known value', () => {
    expect(formatRiskLevel(tEcho, 'critical')).toBe('regulatoryUpdates.critical')
    expect(formatRiskLevel(tEcho, 'high')).toBe('regulatoryUpdates.high')
    expect(formatRiskLevel(tEcho, 'medium')).toBe('regulatoryUpdates.medium')
    expect(formatRiskLevel(tEcho, 'low')).toBe('regulatoryUpdates.low')
  })
})

describe('formatActionType', () => {
  it('maps every known value', () => {
    const all: [string, string][] = [
      ['approve', 'regulatoryUpdates.actionTypeApprove'],
      ['notify-bo', 'regulatoryUpdates.actionTypeNotifyBo'],
      ['notify-authority', 'regulatoryUpdates.actionTypeNotifyAuthority'],
      ['advance', 'regulatoryUpdates.actionTypeAdvance'],
      ['submit', 'regulatoryUpdates.actionTypeSubmit'],
      ['acknowledge', 'regulatoryUpdates.actionTypeAcknowledge'],
      ['start', 'regulatoryUpdates.actionTypeStart'],
      ['complete', 'regulatoryUpdates.actionTypeComplete'],
      ['review', 'regulatoryUpdates.actionTypeReview'],
    ]
    for (const [v, k] of all) expect(formatActionType(tEcho, v)).toBe(k)
  })
})

describe('formatDepartment', () => {
  const depts: DepartmentLike[] = [
    { id: 'd-1', name: 'Compliance', nameAr: 'الامتثال' },
    { id: 'd-2', name: 'Risk', nameAr: 'المخاطر' },
  ]
  it('resolves by id (EN)', () => {
    expect(formatDepartment(tEcho, 'd-1', depts, 'en')).toBe('Compliance')
  })
  it('resolves by name (AR)', () => {
    expect(formatDepartment(tEcho, 'Risk', depts, 'ar')).toBe('المخاطر')
  })
  it('returns raw value when not found', () => {
    expect(formatDepartment(tEcho, 'unknown', depts, 'en')).toBe('unknown')
  })
})

describe('dictionary coverage — EN + AR both define every formatter key', () => {
  const keys = [
    // status
    'regulatoryUpdates.statusPending',
    'regulatoryUpdates.statusInProgress',
    'regulatoryUpdates.statusCompleted',
    'regulatoryUpdates.statusOverdue',
    // priority + risk
    'regulatoryUpdates.critical',
    'regulatoryUpdates.high',
    'regulatoryUpdates.medium',
    'regulatoryUpdates.low',
    // applicability
    'regulatoryUpdates.applicable',
    'regulatoryUpdates.notApplicable',
    'regulatoryUpdates.applicabilityPending',
    // compliance
    'regulatoryUpdates.complianceCompliant',
    'regulatoryUpdates.complianceInProgress',
    'regulatoryUpdates.complianceNonCompliant',
    'regulatoryUpdates.complianceNotStarted',
    // action types
    'regulatoryUpdates.actionTypeApprove',
    'regulatoryUpdates.actionTypeNotifyBo',
    'regulatoryUpdates.actionTypeNotifyAuthority',
    'regulatoryUpdates.actionTypeAdvance',
    'regulatoryUpdates.actionTypeSubmit',
    'regulatoryUpdates.actionTypeAcknowledge',
    'regulatoryUpdates.actionTypeStart',
    'regulatoryUpdates.actionTypeComplete',
    'regulatoryUpdates.actionTypeReview',
  ]
  for (const k of keys) {
    it(`EN defines ${k}`, () => {
      const v = resolve(enDict as Record<string, unknown>, k)
      expect(typeof v).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
    })
    it(`AR defines ${k}`, () => {
      const v = resolve(arDict as Record<string, unknown>, k)
      expect(typeof v).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
    })
  }
})
