// GET /api/dashboard/workload/items?memberId=<uuid> — the actual open work
// items assigned to one member, so the Burnout Detection card's "Reassign"
// drawer can list them and offer a re-assignee.
//
// The companion /api/dashboard/workload route returns only per-member COUNTS
// (from compute_team_workload). To reassign an individual item we need its id +
// title + type, so this endpoint mirrors compute_team_workload's exact
// assignment predicates (migration 107) but SELECTs the rows instead of
// counting them. Scoped to one member, so it's cheap. SECURITY: gated on
// team:view, then queried via the service-role admin client (matching the
// counts route) so a manager sees the whole team regardless of row RLS.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { handle, InvalidUuid } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface WorkloadItem {
  type:
    | 'observation'
    | 'audit'
    | 'policy'
    | 'correspondence'
    | 'advisory'
    | 'sama-letter'
    | 'risk'
    | 'circular'
  id: string
  title: string
}

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requirePerm('team:view')

    const memberId = req.nextUrl.searchParams.get('memberId')?.trim() ?? ''
    if (!UUID_RE.test(memberId)) {
      throw InvalidUuid('A valid memberId query param is required')
    }

    // Without a service-role key the admin aggregator isn't callable; degrade to
    // an empty list (the card then shows "no reassignable items") rather than
    // erroring. Falls back to the user-scoped client below so RLS still applies.
    const db = hasServiceRole() ? getAdminClient() : supabase

    const FALLBACK = '(untitled)'
    const titleOf = (r: Row, ...keys: string[]): string => {
      for (const k of keys) {
        const v = str(r[k])
        if (v) return v
      }
      return FALLBACK
    }

    // Each source is independent; one failing source shouldn't blank the whole
    // drawer. Resolve every query to its rows or [] and merge.
    const safe = async <T = Row>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
      try {
        const { data, error } = await p
        if (error) return []
        return data ?? []
      } catch {
        return []
      }
    }

    const [
      obsLeader,
      obsAssignee,
      audits,
      policies,
      correspondence,
      advisory,
      letters,
      risks,
      circulars,
    ] = await Promise.all([
      safe(db.from('observations').select('id, title').eq('leader_id', memberId).is('deleted_at', null).neq('status', 'closed')),
      safe(
        db
          .from('observation_assignees')
          .select('observation_id, observations!inner(id, title, status, deleted_at)')
          .eq('user_id', memberId),
      ),
      safe(db.from('audits').select('id, title').eq('assignee_id', memberId).is('deleted_at', null).in('status', ['pending', 'in_progress'])),
      safe(db.from('policies').select('id, name').eq('owner_id', memberId).is('deleted_at', null).in('status', ['under-review', 'pending-approval'])),
      safe(db.from('correspondence').select('id, subject, reference').eq('assignee_id', memberId).is('deleted_at', null).not('archived', 'is', true)),
      safe(db.from('advisory_requests').select('id, subject').eq('assigned_to', memberId).is('deleted_at', null).neq('status', 'completed')),
      safe(db.from('letters').select('id, subject, reference').eq('assigned_to', memberId).is('deleted_at', null).neq('status', 'response-received')),
      safe(db.from('risks').select('id, title').eq('owner_id', memberId).is('deleted_at', null).not('status', 'in', '(mitigated,closed)')),
      safe(db.from('circulars').select('id, title').eq('assigned_to', memberId).is('deleted_at', null).not('status', 'in', '(completed,archived)')),
    ])

    const items: WorkloadItem[] = []
    const seenObs = new Set<string>()

    for (const r of obsLeader as Row[]) {
      const id = str(r.id)
      if (!id || seenObs.has(id)) continue
      seenObs.add(id)
      items.push({ type: 'observation', id, title: titleOf(r, 'title') })
    }
    for (const r of obsAssignee as Row[]) {
      // PostgREST returns a to-one embed as either an object or a single-element
      // array depending on the join — normalize like my-work/calendar routes do.
      const embed = (r as Row).observations
      const o = (Array.isArray(embed) ? embed[0] : embed) as Row | null
      if (!o) continue
      if (o.deleted_at != null || str(o.status) === 'closed') continue
      const id = str(o.id)
      if (!id || seenObs.has(id)) continue
      seenObs.add(id)
      items.push({ type: 'observation', id, title: titleOf(o, 'title') })
    }
    for (const r of audits as Row[]) items.push({ type: 'audit', id: str(r.id), title: titleOf(r, 'title') })
    for (const r of policies as Row[]) items.push({ type: 'policy', id: str(r.id), title: titleOf(r, 'name') })
    for (const r of correspondence as Row[]) items.push({ type: 'correspondence', id: str(r.id), title: titleOf(r, 'subject', 'reference') })
    for (const r of advisory as Row[]) items.push({ type: 'advisory', id: str(r.id), title: titleOf(r, 'subject') })
    for (const r of letters as Row[]) items.push({ type: 'sama-letter', id: str(r.id), title: titleOf(r, 'subject', 'reference') })
    for (const r of risks as Row[]) items.push({ type: 'risk', id: str(r.id), title: titleOf(r, 'title') })
    for (const r of circulars as Row[]) items.push({ type: 'circular', id: str(r.id), title: titleOf(r, 'title') })

    return ok({ items: items.filter((i) => i.id) }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
