// /api/authority-departments/[departmentId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAuthorityDepartmentSchema } from '@/lib/api/schemas/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, authority_id, name_en, name_ar, email, is_seed, created_at, updated_at'

type Params = { params: Promise<{ departmentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { departmentId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const patch = await parseJson(req, UpdateAuthorityDepartmentSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('authority_departments')
      .update(update)
      .eq('id', departmentId)
      .select(COLS)
      .single()
    if (error || !data) throw error ?? NotFound(`Authority department ${departmentId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'authority_department.update',
      entity_type: 'authority_department',
      entity_id: departmentId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(cacheTags.authorityDepartments())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { departmentId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])

    const { error } = await supabase
      .from('authority_departments')
      .delete()
      .eq('id', departmentId)
      .eq('is_seed', false)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'authority_department.delete',
      entity_type: 'authority_department',
      entity_id: departmentId,
      supabase,
    })

    revalidate(cacheTags.authorityDepartments())
    return ok({ id: departmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
