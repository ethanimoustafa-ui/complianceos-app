// /api/training/employees — collection.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateTrainingEmployeeSchema,
  ListTrainingEmployeesQuerySchema,
} from '@/lib/api/schemas/training'
import { TRAINING_EMPLOYEE_LIST_COLUMNS } from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListTrainingEmployeesQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    // department_id → resolve to department key/name lookup. `training_employees.department`
    // is a TEXT label, not a FK; for the deep-link we filter via the same string when the
    // department key matches. If not resolvable, fall back to ilike.
    let departmentLabel: string | null = null
    if (q.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('key, name_en')
        .eq('id', q.department_id)
        .maybeSingle<{ key: string; name_en: string }>()
      if (dept) departmentLabel = dept.name_en
    }

    let query = supabase
      .from('training_employees')
      .select(TRAINING_EMPLOYEE_LIST_COLUMNS, { count: 'exact' })
    if (q.department) query = query.eq('department', q.department)
    if (departmentLabel) query = query.eq('department', departmentLabel)
    if (q.employeeId) query = query.eq('id', q.employeeId)
    if (q.q) query = query.ilike('name', `%${q.q}%`)
    // status filter approximated against overall_progress
    if (q.status === 'completed') query = query.eq('overall_progress', 100)
    if (q.status === 'in_progress') query = query.gt('overall_progress', 0).lt('overall_progress', 100)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('name', { ascending: true })
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
    const { supabase, user, profile } = await requirePerm('edit')
    const input = await parseJson(req, CreateTrainingEmployeeSchema)

    const { data, error } = await supabase
      .from('training_employees')
      .insert({
        name: input.name,
        email: input.email,
        department: input.department ?? null,
        is_saudi: input.is_saudi,
        user_id: input.user_id ?? null,
      })
      .select(TRAINING_EMPLOYEE_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_employee.create',
      entity_type: 'training_employee',
      entity_id: created.id,
      metadata: { name: input.name, email: input.email },
      supabase,
    })
    revalidate(cacheTags.training())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
