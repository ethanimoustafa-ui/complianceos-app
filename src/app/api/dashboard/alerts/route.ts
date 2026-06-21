// GET /api/dashboard/alerts — server-derived deadline alerts for ALL entities the
// dashboard no longer hydrates client-side: audits, observations, letters, risks,
// policies, circulars, and training enrollments. The sidebar notification engine
// renders the bell purely from this feed, so it works on every route without any
// page fetching those full lists.
//
// Scalable: queries ONLY the rows matching an alert condition (indexed status /
// date filters), not whole tables. Returns structured facts; the client formats
// the i18n message (so locale stays client-side, one place).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export type AlertSource =
  | 'audit' | 'observation' | 'sama-letter' | 'risk' | 'policy' | 'circular' | 'training'
export interface DerivedAlert {
  sourceType: AlertSource
  entityId: string
  reason: 'overdue' | 'due-7d' | 'due-30d' | 'remediation-overdue' | 'requires-review' | 'expired'
  name: string
  ref?: string
  dueDate?: string | null
  /** Training only: the employee id for the deep-link route. `entityId` is the
   *  composite employee-course key (kept unique so per-course alerts don't
   *  collide on dedupe). */
  routeId?: string
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const now = new Date()
    const nowISO = now.toISOString()
    const in7ISO = new Date(now.getTime() + 7 * 86400000).toISOString()
    const in30ISO = new Date(now.getTime() + 30 * 86400000).toISOString()

    const [
      auditsOverdue, auditsDue, obsOverdue, obsDue, obsRemediation,
      lettersOverdue, lettersDue, risksOverdue, risksDue,
      polOverdue, polReview, polExpired, polDue,
      circOverdue, circDue,
      trainOverdue, trainDue,
    ] = await Promise.all([
      supabase.from('audits').select('id, title').is('deleted_at', null).eq('status', 'overdue'),
      supabase.from('audits').select('id, title, due_date').is('deleted_at', null)
        .not('status', 'in', '("completed","overdue")').gt('due_date', nowISO).lte('due_date', in7ISO),
      supabase.from('observations').select('id, reference, title').is('deleted_at', null)
        .in('status', ['open', 'in_progress']).lt('due_date', nowISO),
      supabase.from('observations').select('id, reference, title, due_date').is('deleted_at', null)
        .in('status', ['open', 'in_progress']).gt('due_date', nowISO).lte('due_date', in7ISO),
      supabase.from('observations').select('id, reference, title').is('deleted_at', null)
        .neq('status', 'closed').not('remediation_submission_due', 'is', null).lt('remediation_submission_due', nowISO),
      supabase.from('letters').select('id, reference, subject').is('deleted_at', null).eq('status', 'overdue'),
      supabase.from('letters').select('id, reference, subject, response_deadline').is('deleted_at', null)
        .eq('status', 'sent').gt('response_deadline', nowISO).lte('response_deadline', in7ISO),
      supabase.from('risks').select('id, title').is('deleted_at', null).neq('status', 'resolved').lt('next_review_date', nowISO),
      supabase.from('risks').select('id, title, next_review_date').is('deleted_at', null)
        .neq('status', 'resolved').gt('next_review_date', nowISO).lte('next_review_date', in30ISO),
      // Policies (active = not deleted, not archived). Mirrors the prior in-store
      // derivation: overdue / requires-review / expired / approved-due-in-30d.
      supabase.from('policies').select('id, name').is('deleted_at', null).is('archived_at', null).eq('status', 'overdue'),
      supabase.from('policies').select('id, name').is('deleted_at', null).is('archived_at', null).eq('status', 'requires-review'),
      supabase.from('policies').select('id, name').is('deleted_at', null).is('archived_at', null).eq('status', 'expired'),
      supabase.from('policies').select('id, name, next_review_date').is('deleted_at', null).is('archived_at', null)
        .eq('status', 'approved').gt('next_review_date', nowISO).lte('next_review_date', in30ISO),
      // Circulars: overdue (status) + due-in-7d (not overdue/completed).
      supabase.from('circulars').select('id, reference, title').is('deleted_at', null).eq('status', 'overdue'),
      supabase.from('circulars').select('id, reference, title, due_date').is('deleted_at', null)
        .not('status', 'in', '("completed","overdue")').gt('due_date', nowISO).lte('due_date', in7ISO),
      // Training enrollments: overdue / due-in-7d, with employee + course names
      // for the message. Capped well above the 50-alert client display limit.
      supabase.from('employee_course_progress')
        .select('id, employee_id, due_date, training_employees(name), training_courses(name)')
        .neq('status', 'completed').not('due_date', 'is', null).lt('due_date', nowISO).limit(100),
      supabase.from('employee_course_progress')
        .select('id, employee_id, due_date, training_employees(name), training_courses(name)')
        .neq('status', 'completed').gt('due_date', nowISO).lte('due_date', in7ISO).limit(100),
    ])

    const alerts: DerivedAlert[] = []
    type Row = Record<string, unknown>
    const rows = (r: { data: unknown }) => (r.data ?? []) as Row[]
    const obsId = (o: Row) => (o.reference as string) ?? (o.id as string)

    for (const a of rows(auditsOverdue)) alerts.push({ sourceType: 'audit', entityId: a.id as string, reason: 'overdue', name: a.title as string })
    for (const a of rows(auditsDue)) alerts.push({ sourceType: 'audit', entityId: a.id as string, reason: 'due-7d', name: a.title as string, dueDate: a.due_date as string })
    for (const o of rows(obsOverdue)) alerts.push({ sourceType: 'observation', entityId: obsId(o), reason: 'overdue', name: o.title as string })
    for (const o of rows(obsDue)) alerts.push({ sourceType: 'observation', entityId: obsId(o), reason: 'due-7d', name: o.title as string, dueDate: o.due_date as string })
    for (const o of rows(obsRemediation)) alerts.push({ sourceType: 'observation', entityId: obsId(o), reason: 'remediation-overdue', name: o.title as string })
    for (const l of rows(lettersOverdue)) alerts.push({ sourceType: 'sama-letter', entityId: l.id as string, reason: 'overdue', name: l.subject as string, ref: l.reference as string })
    for (const l of rows(lettersDue)) alerts.push({ sourceType: 'sama-letter', entityId: l.id as string, reason: 'due-7d', name: l.subject as string, ref: l.reference as string, dueDate: l.response_deadline as string })
    for (const r of rows(risksOverdue)) alerts.push({ sourceType: 'risk', entityId: r.id as string, reason: 'overdue', name: r.title as string })
    for (const r of rows(risksDue)) alerts.push({ sourceType: 'risk', entityId: r.id as string, reason: 'due-30d', name: r.title as string, dueDate: r.next_review_date as string })

    for (const p of rows(polOverdue)) alerts.push({ sourceType: 'policy', entityId: p.id as string, reason: 'overdue', name: p.name as string })
    for (const p of rows(polReview)) alerts.push({ sourceType: 'policy', entityId: p.id as string, reason: 'requires-review', name: p.name as string })
    for (const p of rows(polExpired)) alerts.push({ sourceType: 'policy', entityId: p.id as string, reason: 'expired', name: p.name as string })
    for (const p of rows(polDue)) alerts.push({ sourceType: 'policy', entityId: p.id as string, reason: 'due-30d', name: p.name as string, dueDate: p.next_review_date as string })

    for (const c of rows(circOverdue)) alerts.push({ sourceType: 'circular', entityId: c.id as string, reason: 'overdue', name: c.title as string, ref: c.reference as string })
    for (const c of rows(circDue)) alerts.push({ sourceType: 'circular', entityId: c.id as string, reason: 'due-7d', name: c.title as string, ref: c.reference as string, dueDate: c.due_date as string })

    // Training: entityId is the composite employee-course key (unique per
    // enrollment); routeId carries the employee id for the deep-link.
    const empName = (e: Row) => ((e.training_employees as { name?: string } | null)?.name) ?? ''
    const courseName = (e: Row) => ((e.training_courses as { name?: string } | null)?.name) ?? ''
    for (const e of rows(trainOverdue)) alerts.push({ sourceType: 'training', entityId: `${e.employee_id}-${e.id}`, routeId: e.employee_id as string, reason: 'overdue', name: courseName(e), ref: empName(e) })
    for (const e of rows(trainDue)) alerts.push({ sourceType: 'training', entityId: `${e.employee_id}-${e.id}`, routeId: e.employee_id as string, reason: 'due-7d', name: courseName(e), ref: empName(e), dueDate: e.due_date as string })

    return ok({ alerts }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
