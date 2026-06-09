// /api/observations/[observationId]/remediation — list / create remediation plan.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateRemediationPlanSchema } from '@/lib/api/schemas/observations'
import {
  REMEDIATION_PLAN_COLUMNS,
  assertObservationExists,
  insertObservationTimeline,
  observationActorName,
} from '@/lib/api/services/observations'
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase } = await requireUser()
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { data, error } = await supabase
      .from('remediation_plans')
      .select(REMEDIATION_PLAN_COLUMNS)
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false })
    if (error) throw error

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, CreateRemediationPlanSchema)

    // Unified draft→submit flow. A 'draft' plan is still being built by the
    // assignee and carries no submitted_* stamps; a 'submitted' plan is sent to
    // the leader/manager/admin for review. Default 'submitted' for back-compat.
    const status = input.status ?? 'submitted'
    const isDraft = status === 'draft'

    // W37: one plan per observation. The UI only POSTs when no plan exists yet
    // (existing plans are edited/submitted/revised via PATCH); this guard makes
    // that invariant authoritative so a concurrent double-create can't spawn a
    // second plan and misattribute remediation documents.
    const { data: existingPlan } = await supabase
      .from('remediation_plans')
      .select('id')
      .eq('observation_id', observationId)
      .limit(1)
      .maybeSingle<{ id: string }>()
    if (existingPlan) {
      throw Conflict('A remediation plan already exists for this observation.')
    }

    const { data, error } = await supabase
      .from('remediation_plans')
      .insert({
        observation_id: observationId,
        title: input.title,
        description: input.description,
        due_date: input.due_date,
        status,
        submitted_at: isDraft ? null : new Date().toISOString(),
        submitted_by: isDraft ? null : user.id,
      })
      .select(REMEDIATION_PLAN_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: isDraft ? 'observation.remediation.draft' : 'observation.remediation.submit',
        entity_type: 'remediation_plan',
        entity_id: created.id,
        metadata: { observation_id: observationId, status },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: isDraft ? 'remediation.drafted' : 'remediation.submitted',
        user_id: user.id,
        user_name: actor,
        target_id: created.id,
        ...renderBilingual(
          isDraft
            ? 'regulatoryUpdates.timeline.observationRemediationDrafted'
            : 'regulatoryUpdates.timeline.observationRemediationSubmitted',
          { title: input.title },
        ),
      }),
    ])

    // W37: submitting a plan moves an OPEN observation into 'in_progress' (work
    // under review) — persisted so the table status survives a refresh. Scoped
    // to status='open' so it never downgrades a further-along observation.
    if (!isDraft) {
      await supabase
        .from('observations')
        .update({ status: 'in_progress' })
        .eq('id', observationId)
        .eq('status', 'open')
    }

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
