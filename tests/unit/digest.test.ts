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

// CONTRACT CHANGE (role-aware digest): runDailyDigest now drives the recipient
// set from profiles directly (not from the assignee list), so the orchestration
// issues a different set of queries than before:
//   1. from('profiles').select(...).neq('role','admin').is('deleted_at',null)  → recipients
//   2. from('profiles').select('id, name, department_id').in('id', ids)         → assignee dept/name
//   3. from('departments').select(...).in('id', ids)                            → dept display names
// The mock therefore keys responses by table + whether `.neq` was used (only the
// recipients query calls it). `result.recipients` is also now "recipients who had
// items AND passed the opt-in/email gate" (previously: distinct assignees with
// items, ungated). Both changes are intentional — the digest is now role-aware.
interface MockData {
  candidates: unknown[]
  recipients: unknown[] // active non-admin profiles (the recipient set)
  assignees?: unknown[] // {id, name, department_id} per assignee referenced
  departments?: unknown[] // {id, name_en, name_ar}
}
function mockAdmin(d: MockData): SupabaseClient {
  return {
    rpc: async () => ({ data: d.candidates, error: null }),
    from: (table: string) => {
      let usedNeq = false
      const b: Record<string, unknown> = {
        select: () => b,
        neq: () => {
          usedNeq = true
          return b
        },
        in: () => b,
        is: () => b,
        then: (resolve: (v: unknown) => void) => {
          let data: unknown[] = []
          if (table === 'departments') data = d.departments ?? []
          else if (table === 'profiles') data = usedNeq ? d.recipients : d.assignees ?? []
          resolve({ data, error: null })
        },
      }
      return b
    },
  } as unknown as SupabaseClient
}

describe('runDailyDigest — officer/auditor personal digest', () => {
  beforeEach(() => vi.mocked(enqueueEmail).mockClear())

  it('enqueues one personal digest per opted-in officer with items; skips opted-out, no-email, unassigned, and admins', async () => {
    const candidates = [
      { source: 'audit', item_id: 'i1', parent_id: 'p1', title: 'T1', deadline: '2026-06-14', assignee_id: 'u1', severity: 'high', ref: null }, // overdue
      { source: 'audit', item_id: 'i2', parent_id: 'p2', title: 'T2', deadline: '2026-06-20', assignee_id: 'u1', severity: 'low', ref: null }, // upcoming
      { source: 'policy', item_id: 'i3', parent_id: 'p3', title: 'T3', deadline: '2026-06-18', assignee_id: 'u2', severity: 'medium', ref: null }, // opted out
      { source: 'policy', item_id: 'i4', parent_id: 'p4', title: 'T4', deadline: '2026-06-18', assignee_id: 'u3', severity: 'medium', ref: null }, // no email
      { source: 'risk', item_id: 'i5', parent_id: 'p5', title: 'T5', deadline: '2026-06-18', assignee_id: null, severity: 'low', ref: null }, // unassigned → nobody
    ]
    // All officers (no manager), each in their own dept; admin is excluded by the query (not returned here).
    const recipients = [
      { id: 'u1', email: 'u1@x.test', name: 'One', role: 'officer', department_id: 'd1', preferred_language: 'en', email_digest_enabled: true },
      { id: 'u2', email: 'u2@x.test', name: 'Two', role: 'officer', department_id: 'd1', preferred_language: 'ar', email_digest_enabled: false },
      { id: 'u3', email: null, name: 'Three', role: 'auditor', department_id: 'd2', preferred_language: 'en', email_digest_enabled: true },
    ]
    const assignees = [
      { id: 'u1', name: 'One', department_id: 'd1' },
      { id: 'u2', name: 'Two', department_id: 'd1' },
      { id: 'u3', name: 'Three', department_id: 'd2' },
    ]

    const result = await runDailyDigest(mockAdmin({ candidates, recipients, assignees }), new Date('2026-06-17T00:00:00Z'))

    expect(result.sent).toBe(1) // only u1 is eligible (opted in, has email, has items)
    expect(result.recipients).toBe(1) // recipients who had items AND passed the gate
    expect(enqueueEmail).toHaveBeenCalledTimes(1)

    const [, payload] = vi.mocked(enqueueEmail).mock.calls[0]
    expect(payload.to).toBe('u1@x.test')
    expect(payload.idempotencyKey).toBe('digest:u1:2026-06-17')
    expect(String(payload.subject)).toContain('2 items need attention')
    // Personal digest framing — not the department oversight subject, no owner suffix.
    expect(String(payload.subject)).not.toContain('Department')
    expect(String(payload.html)).toContain('deadlines assigned to you')
    expect(String(payload.html)).not.toContain('assigned to One')
  })

  it('sends nothing when no candidate has an assignee', async () => {
    const candidates = [
      { source: 'risk', item_id: 'i', parent_id: 'p', title: 'T', deadline: '2026-06-18', assignee_id: null, severity: 'low', ref: null },
    ]
    const result = await runDailyDigest(mockAdmin({ candidates, recipients: [] }), new Date('2026-06-17T00:00:00Z'))
    expect(result).toEqual({ recipients: 0, sent: 0 })
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})

describe('runDailyDigest — manager department-wide digest', () => {
  beforeEach(() => vi.mocked(enqueueEmail).mockClear())

  // Two departments. Compliance (dC) has officers oA (overdue) + oB (due soon);
  // Risk (dR) has officer oR. Manager mgr oversees the compliance dept; a second
  // manager mgrX has NO department (org-wide fallback).
  const candidates = [
    { source: 'audit', item_id: 'i1', parent_id: 'p1', title: 'Compliance overdue', deadline: '2026-06-14', assignee_id: 'oA', severity: 'high', ref: null }, // overdue, dC
    { source: 'policy', item_id: 'i2', parent_id: 'p2', title: 'Compliance soon', deadline: '2026-06-20', assignee_id: 'oB', severity: 'low', ref: null }, // upcoming, dC
    { source: 'risk', item_id: 'i3', parent_id: 'p3', title: 'Risk item', deadline: '2026-06-14', assignee_id: 'oR', severity: 'high', ref: null }, // overdue, dR
  ]
  const assignees = [
    { id: 'oA', name: 'Officer A', department_id: 'dC' },
    { id: 'oB', name: 'Officer B', department_id: 'dC' },
    { id: 'oR', name: 'Officer R', department_id: 'dR' },
  ]
  const departments = [
    { id: 'dC', name_en: 'Compliance', name_ar: 'الالتزام' },
    { id: 'dR', name_en: 'Risk Management', name_ar: 'إدارة المخاطر' },
  ]

  it('gives a manager every item in their department (not just their own), with owners and dept framing', async () => {
    const recipients = [
      { id: 'mgr', email: 'mgr@x.test', name: 'Mgr', role: 'manager', department_id: 'dC', preferred_language: 'en', email_digest_enabled: true },
    ]
    const result = await runDailyDigest(mockAdmin({ candidates, recipients, assignees, departments }), new Date('2026-06-17T00:00:00Z'))

    expect(result.sent).toBe(1)
    expect(enqueueEmail).toHaveBeenCalledTimes(1)
    const [, payload] = vi.mocked(enqueueEmail).mock.calls[0]
    expect(payload.idempotencyKey).toBe('digest:mgr:2026-06-17')

    const html = String(payload.html)
    const subject = String(payload.subject)
    // Department oversight framing + the dept name in the intro.
    expect(subject).toContain('Department compliance digest')
    expect(subject).toContain('2 items') // only the two compliance items, NOT the risk item
    expect(html).toContain('Compliance department')
    // Both compliance items appear with their owners…
    expect(html).toContain('Compliance overdue')
    expect(html).toContain('assigned to Officer A')
    expect(html).toContain('Compliance soon')
    expect(html).toContain('assigned to Officer B')
    // …and the other department's item does NOT.
    expect(html).not.toContain('Risk item')
    expect(html).not.toContain('Officer R')
  })

  it('falls back to org-wide when the manager has no department', async () => {
    const recipients = [
      { id: 'mgrX', email: 'mgrx@x.test', name: 'MgrX', role: 'manager', department_id: null, preferred_language: 'en', email_digest_enabled: true },
    ]
    const result = await runDailyDigest(mockAdmin({ candidates, recipients, assignees, departments }), new Date('2026-06-17T00:00:00Z'))

    expect(result.sent).toBe(1)
    const [, payload] = vi.mocked(enqueueEmail).mock.calls[0]
    const html = String(payload.html)
    expect(String(payload.subject)).toContain('3 items') // every assigned item, org-wide
    expect(html).toContain('Compliance overdue')
    expect(html).toContain('Risk item') // included now (no dept filter)
    // No specific department name in the intro (generic org-wide oversight line).
    expect(html).toContain('your department')
  })

  it('renders the manager digest in Arabic with the Arabic dept name', async () => {
    const recipients = [
      { id: 'mgr', email: 'mgr@x.test', name: 'مدير', role: 'manager', department_id: 'dC', preferred_language: 'ar', email_digest_enabled: true },
    ]
    await runDailyDigest(mockAdmin({ candidates, recipients, assignees, departments }), new Date('2026-06-17T00:00:00Z'))
    const [, payload] = vi.mocked(enqueueEmail).mock.calls[0]
    const html = String(payload.html)
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('قسم الالتزام') // "<Compliance> department" intro, Arabic dept name
    expect(html).toContain('مسند إلى Officer A') // owner suffix, Arabic
  })
})
