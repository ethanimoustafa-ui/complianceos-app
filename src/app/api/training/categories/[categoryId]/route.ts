// /api/training/categories/[categoryId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateTrainingCategorySchema } from '@/lib/api/schemas/training'
import { TRAINING_CATEGORY_COLUMNS } from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAG = 'training-categories:list'

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdateTrainingCategorySchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('training_categories')
      .update(update)
      .eq('id', categoryId)
      .select(TRAINING_CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Training category ${categoryId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_category.update',
      entity_type: 'training_category',
      entity_id: categoryId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidate(TAG)
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const { error } = await supabase
      .from('training_categories')
      .delete()
      .eq('id', categoryId)
      .eq('is_default', false)
    if (error) throw error
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_category.delete',
      entity_type: 'training_category',
      entity_id: categoryId,
      supabase,
    })
    revalidate(TAG)
    return ok({ id: categoryId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
