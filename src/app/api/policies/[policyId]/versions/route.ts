// /api/policies/[policyId]/versions — list (paginated newest-first) +
// publish a new version. Wave-18: GAP-15 pagination + no-store.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parsePagination, rangeFor } from '@/lib/api/pagination'
import { assertUuid, parseJson } from '@/lib/api/validate'
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

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase } = await requireUser()
    await assertPolicyExists(supabase, policyId)
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams)

    const [from, to] = rangeFor(page, pageSize)
    const { data, error, count } = await supabase
      .from('policy_versions')
      .select(POLICY_VERSION_COLUMNS, { count: 'exact' })
      .eq('policy_id', policyId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (error) throw error

    return ok(paginate(data ?? [], page, pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, PublishPolicyVersionSchema)

    // Wave-19.4 / Item-3 — dual-store. The Publish endpoint accepts a single
    // free-text `changes` blob (no i18n key); persist it into both columns so
    // the reader's locale-conditioned pick still has a value either way. UI
    // callers wanting bilingual copy go through the PATCH flow which composes
    // `renderBilingual('regulatoryUpdates.timeline.policyVersionUpdated', …)`.
    const { data, error } = await supabase
      .from('policy_versions')
      .insert({
        policy_id: policyId,
        version: input.version,
        date: input.date,
        author: input.author,
        text_en: input.changes,
        text_ar: input.changes,
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
