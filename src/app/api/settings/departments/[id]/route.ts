// /api/settings/departments/[id] — patch / soft-delete a department.
//
// System defaults (`is_default = true`) are refused on DELETE. Any department
// with dependent rows (profiles, observations, risks, etc.) returns 409
// with the reference counts in `details`.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { ApiError, Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateDepartmentSchema } from '@/lib/api/schemas/settings'
import {
  DEPARTMENT_COLUMNS,
  assertDepartmentExists,
  countDepartmentReferences,
} from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    await assertDepartmentExists(supabase, id)
    const patch = await parseJson(req, UpdateDepartmentSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('departments')
      .update(update)
      .eq('id', id)
      .is('deleted_at', null)
      .select(DEPARTMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'department.update',
      entity_type: 'department',
      entity_id: id,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.departments(), cacheTags.departments(id)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const row = await assertDepartmentExists(supabase, id)
    if (row.is_default) {
      throw Conflict('System-default departments cannot be deleted')
    }
    const refs = await countDepartmentReferences(supabase, id)
    if (refs.total > 0) {
      throw new ApiError(
        'conflict',
        409,
        'Department is in use and cannot be deleted',
        refs.byTable,
      )
    }

    const { error } = await supabase
      .from('departments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'department.delete',
      entity_type: 'department',
      entity_id: id,
      supabase,
    })

    revalidateAll([cacheTags.departments(), cacheTags.departments(id)])
    return ok({ id, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
