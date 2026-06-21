// /api/authority-departments — lookup for SAMA-style "departments within an
// authority" (CMA Markets Supervision, IA Insurance Supervision, ...).

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateAuthorityDepartmentSchema } from '@/lib/api/schemas/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, authority_id, name_en, name_ar, email, is_seed, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const authorityId =
      req.nextUrl.searchParams.get('authorityId') ??
      req.nextUrl.searchParams.get('authority_id') ??
      undefined

    let query = supabase.from('authority_departments').select(COLS)
    if (authorityId) query = query.eq('authority_id', authorityId)
    const { data, error } = await query.order('name_en', { ascending: true })
    if (error) throw error

    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: {
        scope: 'public',
        sMaxAge: 3600,
        staleWhileRevalidate: 7200,
        tags: [cacheTags.authorityDepartments()],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const input = await parseJson(req, CreateAuthorityDepartmentSchema)

    const { data, error } = await supabase
      .from('authority_departments')
      .insert({
        authority_id: input.authority_id,
        name_en: input.name_en,
        name_ar: input.name_ar,
        email: input.email ?? null,
        is_seed: input.is_seed,
      })
      .select(COLS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')
    const created = data as { id: string }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'authority_department.create',
      entity_type: 'authority_department',
      entity_id: created.id,
      metadata: { authority_id: input.authority_id, name_en: input.name_en },
      supabase,
    })

    revalidate(cacheTags.authorityDepartments())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
