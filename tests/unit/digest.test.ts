// Daily digest tests — the bilingual template (pure) + the per-user grouping/
// gating orchestration (mocked admin + mocked email enqueue, no DB/network).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderDigestEmail } from '@/lib/email/templates/digest'

vi.mock('@/lib/email/enqueue', () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ jobId: 'job-1', deduped: false }),
}))
import { enqueueEmail } from '@/lib/email/enqueue'
import { runDailyDigest } from '@/lib/escalation/digest'

describe('renderDigestEmail', () => {
  it('renders subject count, both sections, escaped titles, greeting', () => {
    const r = renderDigestEmail({
      locale: 'en',
      recipientName: 'Sara',
      overdue: [{ title: 'Submit <b>evidence</b>', daysOut: -4, route: '/x' }],
      upcoming: [{ title: 'Review policy', daysOut: 2, route: '/y' }],
    })
    expect(r.subject).toContain('2 items need attention')
    expect(r.html).toContain('Overdue')
    expect(r.html).toContain('Due soon')
    expect(r.html).toContain('4 days overdue')
    expect(r.html).toContain('due in 2 days')
    expect(r.html).not.toContain('<b>evidence</b>') // escaped
    expect(r.html).toContain('Hi Sara,')
    expect(r.text).toContain('Submit')
  })

  it('singular subject grammar + Arabic RTL/due-today', () => {
    const en = renderDigestEmail({ locale: 'en', overdue: [{ title: 'A', daysOut: -1, route: '/a' }], upcoming: [] })
    expect(en.subject).toContain('1 item needs attention')
    const ar = renderDigestEmail({ locale: 'ar', overdue: [], upcoming: [{ title: 'ب', daysOut: 0, route: '/b' }] })
    expect(ar.html).toContain('dir="rtl"')
    expect(ar.html).toContain('مستحق اليوم')
  })
})

// Mock admin: rpc() → candidates; from('profiles') → profile rows.
function mockAdmin(candidates: unknown[], profs: unknown[]): SupabaseClient {
  return {
    rpc: async () => ({ data: candidates, error: null }),
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        in: () => b,
        is: () => b,
        then: (resolve: (v: unknown) => void) => resolve({ data: profs, error: null }),
      }
      return b
    },
  } as unknown as SupabaseClient
}

describe('runDailyDigest', () => {
  beforeEach(() => vi.mocked(enqueueEmail).mockClear())

  it('enqueues one digest per opted-in user with items; skips opted-out, no-email, and unassigned', async () => {
    const candidates = [
      { source: 'audit', item_id: 'i1', parent_id: 'p1', title: 'T1', deadline: '2026-06-14', assignee_id: 'u1', severity: 'high', ref: null }, // overdue
      { source: 'audit', item_id: 'i2', parent_id: 'p2', title: 'T2', deadline: '2026-06-20', assignee_id: 'u1', severity: 'low', ref: null }, // upcoming
      { source: 'policy', item_id: 'i3', parent_id: 'p3', title: 'T3', deadline: '2026-06-18', assignee_id: 'u2', severity: 'medium', ref: null }, // opted out
      { source: 'policy', item_id: 'i4', parent_id: 'p4', title: 'T4', deadline: '2026-06-18', assignee_id: 'u3', severity: 'medium', ref: null }, // no email
      { source: 'risk', item_id: 'i5', parent_id: 'p5', title: 'T5', deadline: '2026-06-18', assignee_id: null, severity: 'low', ref: null }, // unassigned → nobody
    ]
    const profs = [
      { id: 'u1', email: 'u1@x.test', name: 'One', preferred_language: 'en', email_digest_enabled: true },
      { id: 'u2', email: 'u2@x.test', name: 'Two', preferred_language: 'ar', email_digest_enabled: false },
      { id: 'u3', email: null, name: 'Three', preferred_language: 'en', email_digest_enabled: true },
    ]

    const result = await runDailyDigest(mockAdmin(candidates, profs), new Date('2026-06-17T00:00:00Z'))

    expect(result.recipients).toBe(3) // u1,u2,u3 each had items
    expect(result.sent).toBe(1) // only u1 is eligible
    expect(enqueueEmail).toHaveBeenCalledTimes(1)

    const [, payload] = vi.mocked(enqueueEmail).mock.calls[0]
    expect(payload.to).toBe('u1@x.test')
    expect(payload.idempotencyKey).toBe('digest:u1:2026-06-17')
    expect(String(payload.subject)).toContain('2 items need attention')
  })

  it('sends nothing when no candidate has an assignee', async () => {
    const candidates = [
      { source: 'risk', item_id: 'i', parent_id: 'p', title: 'T', deadline: '2026-06-18', assignee_id: null, severity: 'low', ref: null },
    ]
    const result = await runDailyDigest(mockAdmin(candidates, []), new Date('2026-06-17T00:00:00Z'))
    expect(result).toEqual({ recipients: 0, sent: 0 })
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})
