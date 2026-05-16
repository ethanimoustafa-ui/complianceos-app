// /api/training/employees/[employeeId]/enrollments/[enrollmentId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateEnrollmentSchema } from '@/lib/api/schemas/training'
import {
  ENROLLMENT_COLUMNS,
  assertEnrollmentExists,
  recomputeCourseCounts,
  recomputeEmployeeProgress,
} from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ employeeId: string; enrollmentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { employeeId, enrollmentId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertEnrollmentExists(supabase, enrollmentId, employeeId)
    const patch = await parseJson(req, UpdateEnrollmentSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    // Auto-set completed_date if status flips to completed and not provided.
    if (update.status === 'completed' && !update.completed_date) {
      update.completed_date = new Date().toISOString().slice(0, 10)
      update.progress = update.progress ?? 100
    }

    const { data, error } = await supabase
      .from('employee_course_progress')
      .update(update)
      .eq('id', enrollmentId)
      .eq('employee_id', employeeId)
      .select(ENROLLMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    const row = data as { course_id: string }
    await recomputeCourseCounts(supabase, row.course_id)
    await recomputeEmployeeProgress(supabase, employeeId)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_enrollment.update',
      entity_type: 'training_enrollment',
      entity_id: enrollmentId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidateAll([
      cacheTags.training(),
      cacheTags.training(employeeId),
      cacheTags.training(row.course_id),
      cacheTags.compliance(),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { employeeId, enrollmentId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertEnrollmentExists(supabase, enrollmentId, employeeId)

    // Pull course_id before delete for count recompute.
    const { data: row } = await supabase
      .from('employee_course_progress')
      .select('course_id')
      .eq('id', enrollmentId)
      .maybeSingle<{ course_id: string }>()

    const { error } = await supabase
      .from('employee_course_progress')
      .delete()
      .eq('id', enrollmentId)
      .eq('employee_id', employeeId)
    if (error) throw error

    if (row?.course_id) await recomputeCourseCounts(supabase, row.course_id)
    await recomputeEmployeeProgress(supabase, employeeId)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_enrollment.delete',
      entity_type: 'training_enrollment',
      entity_id: enrollmentId,
      supabase,
    })
    revalidateAll([cacheTags.training(), cacheTags.training(employeeId), cacheTags.compliance()])
    return ok({ id: enrollmentId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
