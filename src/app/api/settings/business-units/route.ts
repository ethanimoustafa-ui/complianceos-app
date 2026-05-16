// /api/settings/business-units — list / create.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateBusinessUnitSchema } from '@/lib/api/schemas/settings'
import { BUSINESS_UNIT_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('business_units')
      .select(BUSINESS_UNIT_COLUMNS)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [cacheTags.businessUnits()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateBusinessUnitSchema)

    const { data, error } = await supabase
      .from('business_units')
      .insert(input)
      .select(BUSINESS_UNIT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'business_unit.create',
      entity_type: 'business_unit',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })

    revalidate(cacheTags.businessUnits())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
