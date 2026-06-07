// /api/settings/departments — list / create departments.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, Conflict } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateDepartmentSchema } from '@/lib/api/schemas/settings'
import { DEPARTMENT_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('departments')
      .select(DEPARTMENT_COLUMNS)
      .is('deleted_at', null)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [cacheTags.departments()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateDepartmentSchema)

    const { data, error } = await supabase
      .from('departments')
      .insert(input)
      .select(DEPARTMENT_COLUMNS)
      .single()
    if (error) {
      // M1: a unique-key violation (re-adding a name whose slug collides with an
      // existing LIVE department) is a client 409, not an unhandled 500.
      if ((error as { code?: string }).code === '23505') {
        throw Conflict('A department with this name already exists')
      }
      throw error
    }
    if (!data) throw NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'department.create',
      entity_type: 'department',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })

    revalidate(cacheTags.departments())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
