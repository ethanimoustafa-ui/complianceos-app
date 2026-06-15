// GET /api/dashboard/approvals — Managerial "Pending Approvals" list.
//
// Phase B: replaces ManagerialView's client-side cross-store scan (letters
// pending-approval + policies under-review + audits pending) so the view no
// longer hydrates those entity stores. Org-wide (a manager sees the whole
// queue); RLS scopes to the org. Returns raw rows; the view maps entity ->
// route + i18n label (keeps t() client-side).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface ApprovalItem {
  entity: 'letter' | 'policy' | 'audit'
  id: string
  title: string
  status: string
  dueDate: string | null
}

export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await requireUser()

    const [lettersRes, policiesRes, auditsRes] = await Promise.all([
      supabase.from('letters').select('id, subject, status, response_deadline')
        .eq('status', 'pending-approval').is('deleted_at', null),
      supabase.from('policies').select('id, name, status, next_review_date')
        .eq('status', 'under-review').is('deleted_at', null).is('archived_at', null),
      supabase.from('audits').select('id, title, status, due_date')
        .eq('status', 'pending').is('deleted_at', null),
    ])

    const letters = (lettersRes.data ?? []) as Array<{ id: string; subject: string; status: string; response_deadline: string | null }>
    const policies = (policiesRes.data ?? []) as Array<{ id: string; name: string; status: string; next_review_date: string | null }>
    const audits = (auditsRes.data ?? []) as Array<{ id: string; title: string; status: string; due_date: string | null }>

    const items: ApprovalItem[] = [
      ...letters.map((l) => ({ entity: 'letter' as const, id: l.id, title: l.subject, status: l.status, dueDate: l.response_deadline })),
      ...policies.map((p) => ({ entity: 'policy' as const, id: p.id, title: p.name, status: p.status, dueDate: p.next_review_date })),
      ...audits.map((a) => ({ entity: 'audit' as const, id: a.id, title: a.title, status: a.status, dueDate: a.due_date })),
    ]

    items.sort((a, b) => {
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })

    return ok({ items, total: items.length }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
