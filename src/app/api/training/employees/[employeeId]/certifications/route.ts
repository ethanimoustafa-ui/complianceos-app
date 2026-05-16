// /api/training/employees/[employeeId]/certifications — list + create.
//
// Certifications are backed by `employee_course_progress` rows with
// status='completed' and a non-null score. POST upserts that row.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateCertificationSchema } from '@/lib/api/schemas/training'
import {
  ENROLLMENT_COLUMNS,
  assertCourseExists,
  assertEmployeeExists,
  recomputeCourseCounts,
  recomputeEmployeeProgress,
} from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ employeeId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { employeeId } = await params
    const { supabase } = await requireUser()
    await assertEmployeeExists(supabase, employeeId)
    const { data, error } = await supabase
      .from('employee_course_progress')
      .select(ENROLLMENT_COLUMNS)
      .eq('employee_id', employeeId)
      .eq('status', 'completed')
      .not('completed_date', 'is', null)
      .order('completed_date', { ascending: false })
    if (error) throw error
    return ok(data ?? [], {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.training(employeeId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { employeeId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertEmployeeExists(supabase, employeeId)
    const input = await parseJson(req, CreateCertificationSchema)
    await assertCourseExists(supabase, input.course_id)

    const { data, error } = await supabase
      .from('employee_course_progress')
      .upsert(
        {
          employee_id: employeeId,
          course_id: input.course_id,
          status: 'completed',
          progress: 100,
          score: input.score,
          completed_date: input.completed_date,
        },
        { onConflict: 'employee_id,course_id' },
      )
      .select(ENROLLMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    await recomputeCourseCounts(supabase, input.course_id)
    await recomputeEmployeeProgress(supabase, employeeId)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_certification.create',
      entity_type: 'training_certification',
      entity_id: (data as { id: string }).id,
      metadata: { employee_id: employeeId, course_id: input.course_id, score: input.score },
      supabase,
    })

    revalidateAll([
      cacheTags.training(),
      cacheTags.training(employeeId),
      cacheTags.training(input.course_id),
      cacheTags.compliance(),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
