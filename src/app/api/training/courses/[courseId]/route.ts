// /api/training/courses/[courseId] — GET / PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateTrainingCourseSchema } from '@/lib/api/schemas/training'
import {
  TRAINING_COURSE_DETAIL_COLUMNS,
  assertCourseExists,
} from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ courseId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { courseId } = await params
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('training_courses')
      .select(TRAINING_COURSE_DETAIL_COLUMNS)
      .eq('id', courseId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Training course ${courseId} not found`)
    return ok(data, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.training(courseId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { courseId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCourseExists(supabase, courseId)
    const patch = await parseJson(req, UpdateTrainingCourseSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('training_courses')
      .update(update)
      .eq('id', courseId)
      .is('deleted_at', null)
      .select(TRAINING_COURSE_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_course.update',
      entity_type: 'training_course',
      entity_id: courseId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidateAll([cacheTags.training(), cacheTags.training(courseId), cacheTags.compliance()])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { courseId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertCourseExists(supabase, courseId)
    const { error } = await supabase
      .from('training_courses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', courseId)
      .is('deleted_at', null)
    if (error) throw error
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_course.delete',
      entity_type: 'training_course',
      entity_id: courseId,
      supabase,
    })
    revalidateAll([cacheTags.training(), cacheTags.training(courseId), cacheTags.compliance()])
    return ok({ id: courseId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
