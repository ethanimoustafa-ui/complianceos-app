// Escalation engine — pure logic tests (rung bucketing, severity normalisation,
// notification type, bilingual copy). The DB-touching scan orchestration is
// verified separately against the live get_escalation_candidates() view.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { daysUntil, rungFor, normalizeSeverity, notifType } from '@/lib/escalation/rungs'
import { renderEscalationNotification } from '@/lib/escalation/messages'
import { runEscalationScan } from '@/lib/escalation/scan'

const TODAY = new Date('2026-06-17T09:30:00Z')

describe('daysUntil', () => {
  it('counts whole days, date-only, ignoring time of day', () => {
    expect(daysUntil('2026-06-24', TODAY)).toBe(7)
    expect(daysUntil('2026-06-18', TODAY)).toBe(1)
    expect(daysUntil('2026-06-17', TODAY)).toBe(0)
    expect(daysUntil('2026-06-14', TODAY)).toBe(-3)
  })
  it('accepts a full timestamp (slices to the date)', () => {
    expect(daysUntil('2026-06-20T23:00:00Z', TODAY)).toBe(3)
  })
})

describe('rungFor', () => {
  it('buckets the pre-due windows', () => {
    expect(rungFor(8)).toBeNull()
    expect(rungFor(7)).toBe('due7')
    expect(rungFor(4)).toBe('due7')
    expect(rungFor(3)).toBe('due3')
    expect(rungFor(2)).toBe('due3')
    expect(rungFor(1)).toBe('due1')
    expect(rungFor(0)).toBe('due1')
  })
  it('is silent between due and 3-days-overdue, then escalates once', () => {
    expect(rungFor(-1)).toBeNull()
    expect(rungFor(-2)).toBeNull()
    expect(rungFor(-3)).toBe('overdue')
    expect(rungFor(-30)).toBe('overdue')
  })
})

describe('normalizeSeverity', () => {
  it('passes through the canonical levels (case-insensitive)', () => {
    expect(normalizeSeverity('critical')).toBe('critical')
    expect(normalizeSeverity('HIGH')).toBe('high')
  })
  it('maps synonyms and defaults the unknown to medium', () => {
    expect(normalizeSeverity('urgent')).toBe('critical')
    expect(normalizeSeverity('major')).toBe('high')
    expect(normalizeSeverity('minor')).toBe('low')
    expect(normalizeSeverity(null)).toBe('medium')
    expect(normalizeSeverity('weird')).toBe('medium')
  })
})

describe('notifType', () => {
  it('overdue → error, due1 → warning, early depends on severity', () => {
    expect(notifType('overdue', 'low')).toBe('error')
    expect(notifType('due1', 'low')).toBe('warning')
    expect(notifType('due7', 'critical')).toBe('warning')
    expect(notifType('due7', 'medium')).toBe('info')
    expect(notifType('due3', 'high')).toBe('warning')
  })
})

describe('renderEscalationNotification', () => {
  it('renders an English overdue escalation that names the manager', () => {
    const r = renderEscalationNotification('en', 'policy', 'overdue', { name: 'AML Policy', daysOut: -3 })
    expect(r.title).toBe('Overdue item escalated')
    expect(r.message).toContain('Policy step')
    expect(r.message).toContain('AML Policy')
    expect(r.message).toContain('3 days overdue')
    expect(r.message).toContain('escalated to the manager')
  })
  it('handles singular/plural and due-today', () => {
    expect(renderEscalationNotification('en', 'audit', 'due1', { name: 'X', daysOut: 1 }).message).toContain('due in 1 day.')
    expect(renderEscalationNotification('en', 'audit', 'due7', { name: 'X', daysOut: 7 }).message).toContain('due in 7 days.')
    expect(renderEscalationNotification('en', 'audit', 'due1', { name: 'X', daysOut: 0 }).message).toContain('due today')
  })
  it('renders Arabic copy', () => {
    const r = renderEscalationNotification('ar', 'observation', 'overdue', { name: 'بند', daysOut: -5 })
    expect(r.title).toBe('تصعيد بند متأخر')
    expect(r.message).toContain('بند ملاحظة')
    expect(r.message).toContain('المدير')
  })
})

// Minimal chainable Supabase mock: rpc() returns candidates; from('profiles')
// resolves managers or languages by the selected columns; from('notifications')
// resolves the already-sent dedupe keys, and .insert() captures new rows.
interface MockOpts {
  candidates: unknown[]
  managers: { id: string }[]
  profiles: { id: string; preferred_language: string | null }[]
  existing?: Array<{ user_id: string; dedupe_key: string }>
  onInsert: (rows: Array<Record<string, unknown>>) => void
}
function mockAdmin(opts: MockOpts): SupabaseClient {
  const admin = {
    rpc: async () => ({ data: opts.candidates, error: null }),
    from: (table: string) => {
      let cols = ''
      const builder: Record<string, unknown> = {
        select: (c: string) => {
          cols = c
          return builder
        },
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        insert: (rows: Array<Record<string, unknown>>) => {
          opts.onInsert(rows)
          return { error: null }
        },
        then: (resolve: (v: unknown) => void) => {
          let data: unknown[] = []
          if (table === 'profiles') {
            data = cols.includes('preferred_language') ? opts.profiles : opts.managers
          } else if (table === 'notifications') {
            data = opts.existing ?? []
          }
          resolve({ data, error: null })
        },
      }
      return builder
    },
  }
  return admin as unknown as SupabaseClient
}

describe('runEscalationScan (orchestration)', () => {
  it('builds assignee reminders + manager escalations, deduped per rung, per language', async () => {
    const candidates = [
      // due tomorrow (T-1) → officer only
      { source: 'audit', item_id: 'i1', parent_id: 'p1', title: 'Task A', deadline: '2026-06-18', assignee_id: 'u-officer', severity: 'high', ref: null },
      // 3 days overdue → officer + manager
      { source: 'observation', item_id: 'i2', parent_id: 'p2', title: 'Obs B', deadline: '2026-06-14', assignee_id: 'u-officer', severity: 'critical', ref: 'OBS-1' },
    ]
    let inserted: Array<Record<string, unknown>> = []
    const admin = mockAdmin({
      candidates,
      managers: [{ id: 'u-mgr' }],
      profiles: [
        { id: 'u-officer', preferred_language: 'en' },
        { id: 'u-mgr', preferred_language: 'ar' },
      ],
      onInsert: (rows) => {
        inserted = rows
      },
    })

    const result = await runEscalationScan(admin, new Date('2026-06-17T00:00:00Z'))

    expect(result.candidates).toBe(2)
    // due1 → officer (1) ; overdue → officer + manager (2) = 3 rows
    expect(inserted).toHaveLength(3)

    const keys = inserted.map((r) => r.dedupe_key)
    expect(keys).toContain('esc:audit:i1:due1')
    expect(keys.filter((k) => k === 'esc:observation:i2:overdue')).toHaveLength(2)

    const mgr = inserted.filter((r) => r.user_id === 'u-mgr')
    expect(mgr).toHaveLength(1) // manager only gets the overdue escalation
    expect(mgr[0].dedupe_key).toBe('esc:observation:i2:overdue')
    expect(mgr[0].type).toBe('error') // overdue → error
    expect(String(mgr[0].message)).toContain('المدير') // rendered in the manager's Arabic
    expect(String(mgr[0].route)).toContain('OBS-1') // observation routes by reference
  })
})
