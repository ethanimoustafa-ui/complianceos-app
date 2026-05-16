// /api/settings/policy-categories/[id] — patch / delete.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { ApiError, Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicyCategorySchema } from '@/lib/api/schemas/settings'
import {
  POLICY_CATEGORY_COLUMNS,
  assertPolicyCategoryExists,
  countPolicyCategoryReferences,
} from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    await assertPolicyCategoryExists(supabase, id)
    const patch = await parseJson(req, UpdatePolicyCategorySchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('policy_categories')
      .update(update)
      .eq('id', id)
      .select(POLICY_CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy_category.update',
      entity_type: 'policy_category',
      entity_id: id,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.policyCategories(), cacheTags.policyCategories(id)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const row = await assertPolicyCategoryExists(supabase, id)
    if (row.is_default) {
      throw Conflict('System-default policy categories cannot be deleted')
    }
    const refs = await countPolicyCategoryReferences(supabase, id)
    if (refs.total > 0) {
      throw new ApiError(
        'conflict',
        409,
        'Policy category is in use and cannot be deleted',
        refs.byTable,
      )
    }

    const { error } = await supabase.from('policy_categories').delete().eq('id', id)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy_category.delete',
      entity_type: 'policy_category',
      entity_id: id,
      supabase,
    })

    revalidateAll([cacheTags.policyCategories(), cacheTags.policyCategories(id)])
    return ok({ id, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
