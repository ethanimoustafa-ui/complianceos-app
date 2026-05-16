// /api/training/courses/[courseId]/assign — bulk-assign a course to many employees.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AssignCourseSchema } from '@/lib/api/schemas/training'
import {
  assertCourseExists,
  recomputeCourseCounts,
  recomputeEmployeeProgress,
} from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ courseId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { courseId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCourseExists(supabase, courseId)
    const input = await parseJson(req, AssignCourseSchema)

    const rows = input.employee_ids.map((employee_id) => ({
      employee_id,
      course_id: courseId,
      status: 'not_started',
      progress: 0,
      due_date: input.due_date ?? null,
    }))

    const { data, error } = await supabase
      .from('employee_course_progress')
      .upsert(rows, { onConflict: 'employee_id,course_id', ignoreDuplicates: false })
      .select('id, employee_id, course_id, status, due_date')
    if (error) throw error

    await recomputeCourseCounts(supabase, courseId)
    for (const eid of input.employee_ids) {
      await recomputeEmployeeProgress(supabase, eid)
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_course.assign',
      entity_type: 'training_course',
      entity_id: courseId,
      metadata: { employee_count: input.employee_ids.length },
      supabase,
    })

    revalidateAll([cacheTags.training(), cacheTags.training(courseId), cacheTags.compliance()])
    return ok({ assigned: data ?? [] }, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
