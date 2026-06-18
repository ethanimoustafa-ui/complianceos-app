// /api/training/courses — collection.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateTrainingCourseSchema,
  ListTrainingCoursesQuerySchema,
} from '@/lib/api/schemas/training'
import { TRAINING_COURSE_LIST_COLUMNS } from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListTrainingCoursesQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('training_courses')
      .select(TRAINING_COURSE_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
    if (q.category) query = query.eq('category', q.category)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.q) query = query.ilike('name', `%${q.q}%`)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('due_date', { ascending: true, nullsFirst: false })
      .range(from, to)
    if (error) throw error
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.training()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireAnyPerm(['training:create', 'create'])
    const input = await parseJson(req, CreateTrainingCourseSchema)

    const { data, error } = await supabase
      .from('training_courses')
      .insert({
        name: input.name,
        category: input.category,
        description: input.description ?? null,
        due_date: input.due_date ?? null,
        framework_ids: input.framework_ids,
      })
      .select(TRAINING_COURSE_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_course.create',
      entity_type: 'training_course',
      entity_id: created.id,
      metadata: { name: input.name, category: input.category },
      supabase,
    })

    revalidateAll([cacheTags.training(), cacheTags.compliance()])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
