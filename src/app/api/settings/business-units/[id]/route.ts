// /api/settings/business-units/[id] — patch / delete (hard delete; no soft).
//
// `business_units` has no `deleted_at` column (see migration 003); delete is
// physical. System defaults refuse deletion and rows in use return 409.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { ApiError, Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateBusinessUnitSchema } from '@/lib/api/schemas/settings'
import {
  BUSINESS_UNIT_COLUMNS,
  assertBusinessUnitExists,
  countBusinessUnitReferences,
} from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    await assertBusinessUnitExists(supabase, id)
    const patch = await parseJson(req, UpdateBusinessUnitSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('business_units')
      .update(update)
      .eq('id', id)
      .select(BUSINESS_UNIT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'business_unit.update',
      entity_type: 'business_unit',
      entity_id: id,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.businessUnits(), cacheTags.businessUnits(id)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const row = await assertBusinessUnitExists(supabase, id)
    if (row.is_default) {
      throw Conflict('System-default business units cannot be deleted')
    }
    const refs = await countBusinessUnitReferences(supabase, id)
    if (refs.total > 0) {
      throw new ApiError(
        'conflict',
        409,
        'Business unit is in use and cannot be deleted',
        refs.byTable,
      )
    }

    const { error } = await supabase.from('business_units').delete().eq('id', id)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'business_unit.delete',
      entity_type: 'business_unit',
      entity_id: id,
      supabase,
    })

    revalidateAll([cacheTags.businessUnits(), cacheTags.businessUnits(id)])
    return ok({ id, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
