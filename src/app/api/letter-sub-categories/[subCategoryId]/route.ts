// /api/letter-sub-categories/[subCategoryId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateLetterSubCategorySchema } from '@/lib/api/schemas/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, framework_id, key, name_en, name_ar, is_default, created_at, updated_at'

type Params = { params: Promise<{ subCategoryId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { subCategoryId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdateLetterSubCategorySchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('framework_sub_categories')
      .update(update)
      .eq('id', subCategoryId)
      .select(COLS)
      .single()
    if (error || !data) throw error ?? NotFound(`Sub-category ${subCategoryId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter_sub_category.update',
      entity_type: 'framework_sub_category',
      entity_id: subCategoryId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(cacheTags.letterSubCategories())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { subCategoryId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')

    const { error } = await supabase
      .from('framework_sub_categories')
      .delete()
      .eq('id', subCategoryId)
      .eq('is_default', false)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter_sub_category.delete',
      entity_type: 'framework_sub_category',
      entity_id: subCategoryId,
      supabase,
    })

    revalidate(cacheTags.letterSubCategories())
    return ok({ id: subCategoryId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
