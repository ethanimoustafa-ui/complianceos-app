// /api/policies/[policyId]/evidence — list + register evidence metadata.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicyEvidenceSchema } from '@/lib/api/schemas/policies'
import { safeBasename } from '@/lib/api/sanitize'
import {
  POLICY_EVIDENCE_COLUMNS,
  assertPolicyExists,
  recomputePolicyStatus,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_evidence')
      .select(POLICY_EVIDENCE_COLUMNS)
      .eq('policy_id', uuid)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, CreatePolicyEvidenceSchema)

    const safeName = safeBasename(input.name) // SEC-10

    const { data, error } = await supabase
      .from('policy_evidence')
      .insert({
        policy_id: uuid,
        name: safeName,
        storage_path: input.storage_path,
        review_cycle_id: input.review_cycle_id,
        review_cycle_label: input.review_cycle_label,
        notes: input.notes ?? null,
        uploaded_by: user.id,
      })
      .select(POLICY_EVIDENCE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.evidence.register',
        entity_type: 'policy_evidence',
        entity_id: created.id,
        metadata: { policy_id: uuid, name: safeName, review_cycle_id: input.review_cycle_id },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'evidence_uploaded',
        text_en: `Evidence "${safeName}" uploaded`,
        text_ar: `تم رفع الدليل "${safeName}"`,
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
