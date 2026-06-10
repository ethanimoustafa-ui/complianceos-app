// /api/audit-task-categories/[categoryId] — rename / delete a user-added
// per-authority task category.

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { writeAudit } from '@/lib/api/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, authority, key, label_en, label_ar, created_at, updated_at'

const UpdateSchema = z
  .object({
    label_en: z.string().min(1).max(200).optional(),
    label_ar: z.string().min(1).max(200).optional(),
  })
  .strict()

type Params = { params: Promise<{ categoryId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    assertUuid(categoryId)
    const { supabase, user, profile } = await requirePerm('edit')
    const patch = await parseJson(req, UpdateSchema)

    const { data, error } = await supabase
      .from('audit_task_categories')
      .update(patch)
      .eq('id', categoryId)
      .select(COLS)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Task category ${categoryId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit.task_category.update',
      entity_type: 'audit_task_category',
      entity_id: categoryId,
      metadata: { fields: Object.keys(patch) },
      supabase,
    })

    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { categoryId } = await params
    assertUuid(categoryId)
    const { supabase, user, profile } = await requirePerm('edit')

    const { error } = await supabase.from('audit_task_categories').delete().eq('id', categoryId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit.task_category.delete',
      entity_type: 'audit_task_category',
      entity_id: categoryId,
      supabase,
    })

    return ok({ id: categoryId })
  } catch (e) {
    return handle(e)
  }
}
