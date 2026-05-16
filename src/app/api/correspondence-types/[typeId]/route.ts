// /api/correspondence-types/[typeId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCorrespondenceTypeSchema } from '@/lib/api/schemas/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, key, name_en, name_ar, is_default, created_at, updated_at'

type Params = { params: Promise<{ typeId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { typeId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdateCorrespondenceTypeSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('correspondence_types')
      .update(update)
      .eq('id', typeId)
      .select(COLS)
      .single()
    if (error || !data) throw error ?? NotFound(`Correspondence type ${typeId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence_type.update',
      entity_type: 'correspondence_type',
      entity_id: typeId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(cacheTags.correspondenceTypes())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { typeId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')

    const { error } = await supabase
      .from('correspondence_types')
      .delete()
      .eq('id', typeId)
      .eq('is_default', false)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence_type.delete',
      entity_type: 'correspondence_type',
      entity_id: typeId,
      supabase,
    })

    revalidate(cacheTags.correspondenceTypes())
    return ok({ id: typeId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
