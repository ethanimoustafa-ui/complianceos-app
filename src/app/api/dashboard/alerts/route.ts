// GET /api/dashboard/alerts — server-derived deadline alerts for the entities
// the dashboard no longer hydrates client-side (audits, observations, letters,
// risks). Phase B: the sidebar notification engine reads these from here so the
// bell stays complete even though the dashboard stopped fetching those stores.
// (circulars/policies/training alerts still derive from their stores, which the
// dashboard keeps hydrated.)
//
// Scalable: queries ONLY the rows matching an alert condition (indexed status /
// date filters), not whole tables. Returns structured facts; the client formats
// the i18n message (so locale stays client-side, one place).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export type AlertSource = 'audit' | 'observation' | 'sama-letter' | 'risk'
export interface DerivedAlert {
  sourceType: AlertSource
  entityId: string
  reason: 'overdue' | 'due-7d' | 'due-30d' | 'remediation-overdue'
  name: string
  ref?: string
  dueDate?: string | null
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

    return ok({ alerts }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
