// /api/policies/[policyId]/workflow/steps — list + add a step.
// Phase-less step list (Policies have a flat workflow, unlike Circulars'
// phase-grouped model). sort_order is server-authoritative (GAP-12).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicyWorkflowStepSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_WORKFLOW_STEP_COLUMNS,
  assertPolicyExists,
  maxPolicyWorkflowStepSortOrder,
  recomputePolicyStatus,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId: policyIdParam } = await params
    const { supabase } = await requireUser()
    // W26-C: accepts UUID or ref_code → canonical UUID.
    const policyId = await assertPolicyExists(supabase, policyIdParam)

    const { data, error } = await supabase
      .from('policy_workflow_steps')
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .eq('policy_id', policyId)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId: policyIdParam } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    // W26-C: accepts UUID or ref_code → canonical UUID.
    const uuid = await assertPolicyExists(supabase, policyIdParam)
    const input = await parseJson(req, CreatePolicyWorkflowStepSchema)
    const actor = profile.name ?? profile.email ?? user.id

    // GAP-12: ALWAYS compute sort_order server-side. Client value ignored.
    const sortOrder = (await maxPolicyWorkflowStepSortOrder(supabase, uuid)) + 1

    const { data, error } = await supabase
      .from('policy_workflow_steps')
      .insert({
        policy_id: uuid,
        step: input.step,
        status: 'pending',
        description: input.description ?? null,
        action_type: input.action_type ?? null,
        step_state: input.step_state ?? null,
        sort_order: sortOrder,
      })
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.workflow_step.create',
        entity_type: 'policy_workflow_step',
        entity_id: created.id,
        metadata: { policy_id: uuid, step: input.step },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'step_added',
        text_en: `Workflow step "${input.step}" added`,
        text_ar: `تمت إضافة الخطوة "${input.step}"`,
        user_name: actor,
      }),
      recomputePolicyStatus(supabase, uuid),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
