// /api/audit-categories/[categoryId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAuditCategorySchema } from '@/lib/api/schemas/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY_COLUMNS = 'id, key, name_en, name_ar, is_default, created_at, updated_at'

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdateAuditCategorySchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('audit_categories')
      .update(update)
      .eq('id', categoryId)
      .select(CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Audit category ${categoryId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit_category.update',
      entity_type: 'audit_category',
      entity_id: categoryId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(cacheTags.auditCategories())
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
      .from('audit_categories')
      .delete()
      .eq('id', categoryId)
      .eq('is_default', false)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit_category.delete',
      entity_type: 'audit_category',
      entity_id: categoryId,
      supabase,
    })

    revalidate(cacheTags.auditCategories())
    return ok({ id: categoryId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
