// /api/policies/[policyId] — item GET/PATCH/DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicySchema } from '@/lib/api/schemas/policies'
import {
  POLICY_LIST_COLUMNS,
  assertPolicyExists,
  getPolicyDetail,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase } = await requireUser()
    const detail = await getPolicyDetail(supabase, policyId)
    return ok(detail, {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.policies(policyId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertPolicyExists(supabase, policyId)
    const patch = await parseJson(req, UpdatePolicySchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      const detail = await getPolicyDetail(supabase, policyId)
      return ok(detail)
    }

    const { data, error } = await supabase
      .from('policies')
      .update(update)
      .eq('id', policyId)
      .is('deleted_at', null)
      .select(POLICY_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'policy.update',
        entity_type: 'policy',
        entity_id: policyId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: policyId,
        type: 'updated',
        text_en: `Updated fields: ${Object.keys(update).join(', ')}`,
        text_ar: `تم تحديث الحقول: ${Object.keys(update).join(', ')}`,
        user_name: profile.name ?? profile.email ?? user.id,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    if (update.status !== undefined) revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertPolicyExists(supabase, policyId)

    const { error } = await supabase
      .from('policies')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', policyId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy.delete',
      entity_type: 'policy',
      entity_id: policyId,
      supabase,
    })

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    revalidate(cacheTags.compliance())
    return ok({ id: policyId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
