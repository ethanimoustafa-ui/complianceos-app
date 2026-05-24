// /api/policies/[policyId]/evidence/[evidenceId] — GET / PATCH / DELETE
// with ETag + If-Match (W17.2 atomic pattern).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicyEvidenceSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_EVIDENCE_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string; evidenceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId, evidenceId } = await params
    assertUuid(policyId, evidenceId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_evidence')
      .select(POLICY_EVIDENCE_COLUMNS)
      .eq('id', evidenceId)
      .eq('policy_id', uuid)
      .maybeSingle<Record<string, unknown>>()
    if (error) throw error
    if (!data) throw NotFound(`Evidence ${evidenceId} not found`)
    const updatedAt = data.updated_at
    const etag =
      typeof updatedAt === 'string' ? { ETag: `W/"${updatedAt}"` } : undefined
    return ok(data, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { policyId, evidenceId } = await params
    assertUuid(policyId, evidenceId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const ifMatch = readIfMatch(req)
    const input = await parseJson(req, UpdatePolicyEvidenceSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      const { data: cur, error: curErr } = await supabase
        .from('policy_evidence')
        .select(POLICY_EVIDENCE_COLUMNS)
        .eq('id', evidenceId)
        .eq('policy_id', uuid)
        .single()
      if (curErr) throw curErr
      return ok(cur)
    }

    let query = supabase
      .from('policy_evidence')
      .update(update)
      .eq('id', evidenceId)
      .eq('policy_id', uuid)
    if (ifMatch != null) query = query.eq('updated_at', ifMatch)
    const { data, error } = await query.select(POLICY_EVIDENCE_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    const actor = profile.name ?? profile.email ?? user.id
    await writeAudit({
      actor_id: user.id,
      actor_name: actor,
      action: 'policy.evidence.update',
      entity_type: 'policy_evidence',
      entity_id: evidenceId,
      metadata: { policy_id: uuid, fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { policyId, evidenceId } = await params
    assertUuid(policyId, evidenceId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const ifMatch = readIfMatch(req)

    const { data: prev, error: readErr } = await supabase
      .from('policy_evidence')
      .select('id, name')
      .eq('id', evidenceId)
      .eq('policy_id', uuid)
      .maybeSingle<{ id: string; name: string }>()
    if (readErr) throw readErr
    if (!prev) throw NotFound(`Evidence ${evidenceId} not found`)

    let delQuery = supabase
      .from('policy_evidence')
      .delete()
      .eq('id', evidenceId)
      .eq('policy_id', uuid)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { data: deleted, error } = await delQuery.select('id')
    if (error) throw error
    if (ifMatch != null && (!deleted || deleted.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const actor = profile.name ?? profile.email ?? user.id
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.evidence.delete',
        entity_type: 'policy_evidence',
        entity_id: evidenceId,
        metadata: { policy_id: uuid, name: prev.name },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'evidence_removed',
        text_en: `Evidence "${prev.name}" removed`,
        text_ar: `تمت إزالة الدليل "${prev.name}"`,
        user_name: actor,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(uuid)])
    return ok({ id: evidenceId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
