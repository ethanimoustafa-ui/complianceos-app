// /api/training/employees/[employeeId] — GET / PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateTrainingEmployeeSchema } from '@/lib/api/schemas/training'
import {
  TRAINING_EMPLOYEE_LIST_COLUMNS,
  assertEmployeeExists,
  getEmployeeDetail,
} from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ employeeId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { employeeId } = await params
    const { supabase } = await requireUser()
    const detail = await getEmployeeDetail(supabase, employeeId)
    return ok(detail, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.training(employeeId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { employeeId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertEmployeeExists(supabase, employeeId)
    const patch = await parseJson(req, UpdateTrainingEmployeeSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('training_employees')
      .update(update)
      .eq('id', employeeId)
      .select(TRAINING_EMPLOYEE_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_employee.update',
      entity_type: 'training_employee',
      entity_id: employeeId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidateAll([cacheTags.training(), cacheTags.training(employeeId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { employeeId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertEmployeeExists(supabase, employeeId)
    const { error } = await supabase.from('training_employees').delete().eq('id', employeeId)
    if (error) throw error
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_employee.delete',
      entity_type: 'training_employee',
      entity_id: employeeId,
      supabase,
    })
    revalidateAll([cacheTags.training(), cacheTags.training(employeeId)])
    return ok({ id: employeeId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
