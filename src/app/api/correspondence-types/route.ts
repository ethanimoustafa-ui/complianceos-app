// /api/correspondence-types — system lookup CRUD for `correspondence_types`.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateCorrespondenceTypeSchema } from '@/lib/api/schemas/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, key, name_en, name_ar, is_default, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('correspondence_types')
      .select(COLS)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [cacheTags.correspondenceTypes()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateCorrespondenceTypeSchema)

    const { data, error } = await supabase
      .from('correspondence_types')
      .insert(input)
      .select(COLS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence_type.create',
      entity_type: 'correspondence_type',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })

    revalidate(cacheTags.correspondenceTypes())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
