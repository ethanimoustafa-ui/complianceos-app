// /api/policies/[policyId]/workflow/steps/[stepId] — single workflow step
// GET + PATCH + DELETE.
//
// Wave-18 — hardened per PORTING-TEMPLATE §2:
//   - GET returns ETag from updated_at; cache:'no-store'
//   - PATCH + DELETE use If-Match against updated_at (W17.2 atomic pattern)
//   - assertUuid on every dynamic segment (SEC-5)

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicyWorkflowStepSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_WORKFLOW_STEP_COLUMNS,
  assertPolicyExists,
  assertPolicyWorkflowStepExists,
  recomputePolicyStatus,
  writePolicyActivity,
} from '@/lib/api/services/policies'
// W26-C: policyId may be UUID or ref_code; stepId is always UUID (no reference column on steps).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string; stepId: string }> }

// W17.2 — single-resource GET exposes ETag for the client's next PATCH.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId, stepId } = await params
    // stepId is always a UUID; policyId may be UUID or ref_code (W26-C).
    assertUuid(stepId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const row = await assertPolicyWorkflowStepExists(supabase, uuid, stepId)
    const etag = { ETag: `W/"${row.updated_at}"` }
    return ok(row, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { policyId, stepId } = await params
    // stepId is always a UUID; policyId may be UUID or ref_code (W26-C).
    assertUuid(stepId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const prev = await assertPolicyWorkflowStepExists(supabase, uuid, stepId)
    const ifMatch = readIfMatch(req)
    const input = await parseJson(req, UpdatePolicyWorkflowStepSchema)
    const actor = profile.name ?? profile.email ?? user.id

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) return ok(prev)

    // W17.2: scope on the CLIENT's claimed token.
    let query = supabase
      .from('policy_workflow_steps')
      .update(update)
      .eq('id', stepId)
      .eq('policy_id', uuid)
    if (ifMatch != null) query = query.eq('updated_at', ifMatch)
    const { data, error } = await query
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    const isRename = input.step !== undefined && input.step !== prev.step
    // ISSUE-1: a reorder PATCHes sort_order (+status) on every step, and a state
    // transition PATCHes step_state. Neither is a user-meaningful "step updated"
    // edit, so skip the activity-log entry for those to avoid timeline spam.
    const isSilentChange = Object.keys(update).every(
      (k) => k === 'sort_order' || k === 'status' || k === 'step_state',
    )

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: isRename
          ? 'policy.workflow_step.rename'
          : 'policy.workflow_step.update',
        entity_type: 'policy_workflow_step',
        entity_id: stepId,
        metadata: {
          policy_id: uuid,
          previous_step: prev.step,
          fields: Object.keys(update),
        },
        supabase,
      }),
      ...(isSilentChange ? [] : [writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: isRename ? 'step_renamed' : 'workflow_step_updated',
        text_en: isRename
          ? `Workflow step renamed from "${prev.step}" to "${input.step}"`
          : `Workflow step "${prev.step}" updated`,
        text_ar: isRename
          ? `تمت إعادة تسمية الخطوة من "${prev.step}" إلى "${input.step}"`
          : `تم تحديث الخطوة "${prev.step}"`,
        user_name: actor,
      })]),
      recomputePolicyStatus(supabase, uuid),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { policyId, stepId } = await params
    // stepId is always a UUID; policyId may be UUID or ref_code (W26-C).
    assertUuid(stepId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const prev = await assertPolicyWorkflowStepExists(supabase, uuid, stepId)
    const ifMatch = readIfMatch(req)
    const actor = profile.name ?? profile.email ?? user.id

    let delQuery = supabase
      .from('policy_workflow_steps')
      .delete()
      .eq('id', stepId)
      .eq('policy_id', uuid)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { data: deleted, error: delErr } = await delQuery.select('id')
    if (delErr) throw delErr
    if (ifMatch != null && (!deleted || deleted.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    // If the removed step was 'current', promote the next pending step.
    if (prev.status === 'current') {
      const { data: next, error: nextErr } = await supabase
        .from('policy_workflow_steps')
        .select('id')
        .eq('policy_id', uuid)
        .eq('status', 'pending')
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle<{ id: string }>()
      if (nextErr) throw nextErr
      if (next) {
        const { error: upErr } = await supabase
          .from('policy_workflow_steps')
          .update({ status: 'current' })
          .eq('id', next.id)
        if (upErr) throw upErr
      }
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.workflow_step.delete',
        entity_type: 'policy_workflow_step',
        entity_id: stepId,
        metadata: { policy_id: uuid, step: prev.step },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'workflow_step_removed',
        text_en: `Workflow step "${prev.step}" removed`,
        text_ar: `تمت إزالة الخطوة "${prev.step}"`,
        user_name: actor,
      }),
      recomputePolicyStatus(supabase, uuid),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok({ id: stepId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
