// /api/policies/[policyId]/versions — list / publish new version.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { PublishPolicyVersionSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_VERSION_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase } = await requireUser()
    await assertPolicyExists(supabase, policyId)

    const { data, error } = await supabase
      .from('policy_versions')
      .select(POLICY_VERSION_COLUMNS)
      .eq('policy_id', policyId)
      .order('date', { ascending: false })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.policies(policyId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, PublishPolicyVersionSchema)

    const { data, error } = await supabase
      .from('policy_versions')
      .insert({
        policy_id: policyId,
        version: input.version,
        date: input.date,
        author: input.author,
        changes: input.changes,
      })
      .select(POLICY_VERSION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    // Bump current version on the policy row.
    const bumpRes = await supabase
      .from('policies')
      .update({ version: input.version })
      .eq('id', policyId)
      .is('deleted_at', null)
    if (bumpRes.error) throw bumpRes.error

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'policy.version.publish',
        entity_type: 'policy_version',
        entity_id: created.id,
        metadata: { policy_id: policyId, version: input.version },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: policyId,
        type: 'version_published',
        text_en: `Version ${input.version} published`,
        text_ar: `تم نشر الإصدار ${input.version}`,
        user_name: profile.name ?? profile.email ?? user.id,
        note: input.changes,
      }),
    ])

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
