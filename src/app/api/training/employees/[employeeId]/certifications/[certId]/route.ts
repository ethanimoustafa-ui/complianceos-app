// /api/training/employees/[employeeId]/certifications/[certId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCertificationSchema } from '@/lib/api/schemas/training'
import {
  ENROLLMENT_COLUMNS,
  assertEnrollmentExists,
  recomputeCourseCounts,
  recomputeEmployeeProgress,
} from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ employeeId: string; certId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { employeeId, certId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertEnrollmentExists(supabase, certId, employeeId)
    const patch = await parseJson(req, UpdateCertificationSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('employee_course_progress')
      .update(update)
      .eq('id', certId)
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
      action: 'training_certification.update',
      entity_type: 'training_certification',
      entity_id: certId,
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
    const { employeeId, certId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertEnrollmentExists(supabase, certId, employeeId)

    // Pull course_id before clearing.
    const { data: row } = await supabase
      .from('employee_course_progress')
      .select('course_id')
      .eq('id', certId)
      .maybeSingle<{ course_id: string }>()

    // Clear the certification fields but keep the enrollment row.
    const { error } = await supabase
      .from('employee_course_progress')
      .update({
        status: 'in_progress',
        score: null,
        completed_date: null,
        progress: 50,
      })
      .eq('id', certId)
      .eq('employee_id', employeeId)
    if (error) throw error

    if (row?.course_id) await recomputeCourseCounts(supabase, row.course_id)
    await recomputeEmployeeProgress(supabase, employeeId)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_certification.delete',
      entity_type: 'training_certification',
      entity_id: certId,
      supabase,
    })
    revalidateAll([cacheTags.training(), cacheTags.training(employeeId), cacheTags.compliance()])
    return ok({ id: certId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
