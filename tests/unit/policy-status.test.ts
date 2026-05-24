// Wave-18 — pure-function unit tests for the Policy hardening helpers.
// `isPolicyExpired` powers the read-time `is_expired` flag on the list GET
// (PORTING-TEMPLATE §3 — time-dependent state goes stale on idle entities,
// so we eval at read time).
// `formatPolicyStatus` / `formatPolicyApprovalTier` etc. pin the value→key
// mapping for every render site (FORENSIC §5).

import { describe, it, expect } from 'vitest'
import { isPolicyExpired } from '@/lib/api/services/policies'
import {
  formatPolicyStatus,
  formatPolicyApprovalTier,
  formatPolicyCategory,
  formatPolicyWorkflowStepStatus,
} from '@/lib/format/enum'

const tIdentity = ((k: string) => k) as Parameters<typeof formatPolicyStatus>[0]

describe('isPolicyExpired', () => {
  const yesterday = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const tomorrow = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  it('returns false when next_review_date is absent', () => {
    expect(isPolicyExpired({ next_review_date: null })).toBe(false)
    expect(isPolicyExpired({})).toBe(false)
  })

  // Wave-19.1 / Q2 — an `approved` policy past its review date SHOULD
  // surface as expired (that's the StatCard's whole purpose). The helper
  // no longer carves out `approved`.
  it('returns true when next_review_date is in the past — including approved policies', () => {
    expect(
      isPolicyExpired({ next_review_date: yesterday, status: 'approved' }),
    ).toBe(true)
    expect(
      isPolicyExpired({ next_review_date: yesterday, status: 'draft' }),
    ).toBe(true)
    expect(
      isPolicyExpired({ next_review_date: yesterday, status: 'under-review' }),
    ).toBe(true)
  })

  it('returns false when next_review_date is in the future', () => {
    expect(
      isPolicyExpired({ next_review_date: tomorrow, status: 'draft' }),
    ).toBe(false)
  })
})

describe('formatPolicy* enum helpers', () => {
  it('maps every known policy status to its dictionary key', () => {
    expect(formatPolicyStatus(tIdentity, 'draft')).toBe('policies.statusDraft')
    expect(formatPolicyStatus(tIdentity, 'under-review')).toBe(
      'policies.statusUnderReview',
    )
    expect(formatPolicyStatus(tIdentity, 'approved')).toBe(
      'policies.statusApproved',
    )
    expect(formatPolicyStatus(tIdentity, 'expired')).toBe(
      'policies.statusExpired',
    )
    expect(formatPolicyStatus(tIdentity, 'overdue')).toBe(
      'policies.statusOverdue',
    )
    expect(formatPolicyStatus(tIdentity, 'requires-review')).toBe(
      'policies.statusRequiresReview',
    )
  })

  it('falls back to the raw value for unknown enum members', () => {
    expect(formatPolicyStatus(tIdentity, 'mystery-status')).toBe(
      'mystery-status',
    )
    expect(formatPolicyApprovalTier(tIdentity, 'custom-tier')).toBe(
      'custom-tier',
    )
    expect(formatPolicyCategory(tIdentity, 'custom-category')).toBe(
      'custom-category',
    )
  })

  it('emits empty string for null / undefined', () => {
    expect(formatPolicyStatus(tIdentity, null)).toBe('')
    expect(formatPolicyStatus(tIdentity, undefined)).toBe('')
  })

  it('maps default approval tiers', () => {
    expect(formatPolicyApprovalTier(tIdentity, 'board')).toBe(
      'policies.tierBoard',
    )
    expect(formatPolicyApprovalTier(tIdentity, 'management')).toBe(
      'policies.tierManagement',
    )
    expect(formatPolicyApprovalTier(tIdentity, 'sharia')).toBe(
      'policies.tierSharia',
    )
    expect(formatPolicyApprovalTier(tIdentity, 'agm')).toBe('policies.tierAgm')
  })

  it('maps workflow step statuses', () => {
    expect(formatPolicyWorkflowStepStatus(tIdentity, 'completed')).toBe(
      'policies.workflowCompleted',
    )
    expect(formatPolicyWorkflowStepStatus(tIdentity, 'current')).toBe(
      'policies.workflowCurrent',
    )
    expect(formatPolicyWorkflowStepStatus(tIdentity, 'pending')).toBe(
      'policies.workflowPending',
    )
  })
})
