// GET /api/dashboard/my-work — the Officer view's personal task lists, scoped
// to the JWT user (no client-supplied id). Phase B: replaces OfficerView's
// client-side filtering of the observations/audits/policies/letters stores.
// The view still derives taskQueue / overdue / upcoming / status labels from
// these lists (pure reshaping + i18n), so this returns the raw scoped rows.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export interface MyWorkObservation { id: string; title: string; dueDate: string; status: string }
export interface MyWorkAudit { id: string; title: string; dueDate: string; status: string }
export interface MyWorkPolicy { id: string; name: string; nextReviewDate: string; status: string }
export interface MyWorkActionItem { entity: 'letter' | 'policy'; id: string; name: string; detail: string }
export interface MyWorkResponse {
  observations: MyWorkObservation[]
  audits: MyWorkAudit[]
  policies: MyWorkPolicy[]
  actionItems: MyWorkActionItem[]
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Embedded<T> = T | T[]
function one<T>(v: Embedded<T> | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export async function GET(_req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser()
    const me = user.id
    const meName = profile?.name ?? '__no_name__'

    // Observations: leader OR linked assignee, still open.
    const { data: assigneeRows } = await supabase
      .from('observation_assignees').select('observation_id').eq('user_id', me)
    const obsIds = [...new Set(((assigneeRows ?? []) as Array<{ observation_id: string }>).map((r) => r.observation_id))]
    let obsQuery = supabase
      .from('observations')
      .select('id, reference, title, due_date, status')
      .is('deleted_at', null)
      .neq('status', 'closed')
    const orParts = [`leader_id.eq.${me}`]
    if (obsIds.length) orParts.push(`id.in.(${obsIds.join(',')})`)
    obsQuery = obsQuery.or(orParts.join(','))

    const [obsRes, audRes, polRes, letterStepRes, policyStepRes] = await Promise.all([
      obsQuery,
      supabase.from('audits').select('id, title, due_date, status')
        .eq('assignee_id', me).in('status', ['pending', 'in_progress']).is('deleted_at', null),
      supabase.from('policies').select('id, name, next_review_date, status')
        .eq('owner_id', me).in('status', ['under-review', 'pending-approval']).is('deleted_at', null).is('archived_at', null),
      supabase.from('letter_approval_steps')
        .select('step, role, letters!inner(id, subject, status)')
        .eq('assigned_to', me).eq('status', 'pending').eq('letters.status', 'pending-approval'),
      supabase.from('policy_workflow_steps')
        .select('step, policies!inner(id, name, deleted_at)')
        .eq('user_name', meName).eq('status', 'current'),
    ])

    const observations: MyWorkObservation[] = ((obsRes.data ?? []) as Array<{ id: string; reference: string | null; title: string; due_date: string | null; status: string }>)
      .map((o) => ({ id: o.reference ?? o.id, title: o.title, dueDate: o.due_date ?? '', status: o.status }))
    const audits: MyWorkAudit[] = ((audRes.data ?? []) as Array<{ id: string; title: string; due_date: string | null; status: string }>)
      .map((a) => ({ id: a.id, title: a.title, dueDate: a.due_date ?? '', status: a.status }))
    const policies: MyWorkPolicy[] = ((polRes.data ?? []) as Array<{ id: string; name: string; next_review_date: string | null; status: string }>)
      .map((p) => ({ id: p.id, name: p.name, nextReviewDate: p.next_review_date ?? '', status: p.status }))

    const actionItems: MyWorkActionItem[] = []
    for (const s of (letterStepRes.data ?? []) as Array<{ step: number; role: string; letters: Embedded<{ id: string; subject: string }> }>) {
      const letter = one(s.letters)
      if (letter) actionItems.push({ entity: 'letter', id: letter.id, name: letter.subject, detail: `Step ${s.step} (${s.role})` })
    }
    for (const s of (policyStepRes.data ?? []) as Array<{ step: string; policies: Embedded<{ id: string; name: string; deleted_at: string | null }> }>) {
      const policy = one(s.policies)
      if (policy && !policy.deleted_at) actionItems.push({ entity: 'policy', id: policy.id, name: policy.name, detail: String(s.step) })
    }

    return ok({ observations, audits, policies, actionItems }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
