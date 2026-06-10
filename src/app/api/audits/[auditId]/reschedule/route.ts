// POST /api/audits/[auditId]/reschedule — W50: roll the audit into its next
// cycle. Archives a frozen snapshot of the finished cycle (audit fields +
// checklist + documents + comments + team + activity), then resets the SAME
// audit row: new due date, status 'pending', progress 0. The checklist
// carries forward (tasks reset to incomplete — they're repetitive per-cycle
// work); documents and comments start fresh (their history lives in the
// snapshot).

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  AUDIT_LIST_COLUMNS,
  AUDIT_DETAIL_COLUMNS,
  assertAuditExists,
  insertAuditTimeline,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RescheduleSchema = z
  .object({
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()

type Params = { params: Promise<{ auditId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    assertUuid(auditId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const input = await parseJson(req, RescheduleSchema)

    // ── 1. read everything the snapshot freezes ──
    const [auditRes, tasksRes, docsRes, commentsRes, teamRes, logsRes] = await Promise.all([
      supabase.from('audits').select(AUDIT_DETAIL_COLUMNS).eq('id', auditId).maybeSingle(),
      supabase.from('audit_tasks').select('*').eq('audit_id', auditId).is('deleted_at', null),
      supabase.from('audit_documents').select('*').eq('audit_id', auditId),
      supabase.from('audit_comments').select('*').eq('audit_id', auditId),
      supabase.from('audit_team_members').select('*').eq('audit_id', auditId),
      supabase
        .from('audit_logs')
        .select('id, timestamp, user_name, action, target_type, target_id, metadata, status')
        .or(`target_id.eq.${auditId},metadata->>audit_id.eq.${auditId}`)
        .order('timestamp', { ascending: false })
        .limit(200),
    ])
    if (auditRes.error) throw auditRes.error
    if (!auditRes.data) throw NotFound(`Audit ${auditId} not found`)
    const auditRow = auditRes.data as Record<string, unknown>

    // ── 2. archive the cycle ──
    const { count } = await supabase
      .from('audit_cycles')
      .select('id', { count: 'exact', head: true })
      .eq('audit_id', auditId)
    const cycleNumber = (count ?? 0) + 1

    const { data: cycle, error: cycleErr } = await supabase
      .from('audit_cycles')
      .insert({
        audit_id: auditId,
        cycle_number: cycleNumber,
        due_date: (auditRow.due_date as string) ?? null,
        status: (auditRow.status as string) ?? null,
        progress: (auditRow.progress as number) ?? 0,
        snapshot: {
          audit: auditRow,
          tasks: tasksRes.data ?? [],
          documents: docsRes.data ?? [],
          comments: commentsRes.data ?? [],
          team: teamRes.data ?? [],
          logs: logsRes.data ?? [],
        },
      })
      .select('id, cycle_number')
      .single()
    if (cycleErr || !cycle) throw cycleErr ?? NotFound('Cycle insert returned no row')

    // ── 3. reset the live audit for the next period ──
    const { data: updated, error: updErr } = await supabase
      .from('audits')
      .update({
        due_date: input.due_date,
        status: 'pending',
        progress: 0,
        completed_at: null,
        // NOT NULL column — false, not null.
        closed_overdue: false,
      })
      .eq('id', auditId)
      .select(AUDIT_LIST_COLUMNS)
      .single()
    if (updErr || !updated) throw updErr ?? NotFound('Audit reset returned no row')

    // ── 4. carry the checklist forward (reset), clear cycle-bound children ──
    const [taskReset, docsDel, commentsDel] = await Promise.all([
      supabase
        .from('audit_tasks')
        .update({ completed: false, completed_at: null, status: 'pending' })
        .eq('audit_id', auditId),
      supabase.from('audit_documents').delete().eq('audit_id', auditId),
      supabase.from('audit_comments').delete().eq('audit_id', auditId),
    ])
    if (taskReset.error) throw taskReset.error
    if (docsDel.error) throw docsDel.error
    if (commentsDel.error) throw commentsDel.error

    const actorName = profile.name ?? profile.email ?? user.id
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.reschedule',
        entity_type: 'audit',
        entity_id: auditId,
        metadata: { cycle_number: cycleNumber, next_due_date: input.due_date },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'rescheduled',
        i18nKey: 'auditDetail.activityRescheduled',
        params: { cycle: String(cycleNumber), date: input.due_date },
        userId: user.id,
        userName: actorName,
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok({ audit: updated, cycle })
  } catch (e) {
    return handle(e)
  }
}
