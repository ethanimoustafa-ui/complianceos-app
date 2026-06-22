// /api/risk-categories/[categoryId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateRiskCategorySchema } from '@/lib/api/schemas/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RISK_CATEGORY_COLUMNS =
  'id, key, name_en, name_ar, color, icon, is_default, created_at, updated_at'

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const patch = await parseJson(req, UpdateRiskCategorySchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('risk_categories')
      .update(update)
      .eq('id', categoryId)
      .select(RISK_CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Risk category ${categoryId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'risk_category.update',
      entity_type: 'risk_category',
      entity_id: categoryId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate('risk-categories:list')
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])

    const { error } = await supabase
      .from('risk_categories')
      .delete()
      .eq('id', categoryId)
      .eq('is_default', false)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'risk_category.delete',
      entity_type: 'risk_category',
      entity_id: categoryId,
      supabase,
    })

    revalidate('risk-categories:list')
    return ok({ id: categoryId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
