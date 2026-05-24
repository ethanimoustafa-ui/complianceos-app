// /api/settings/enum-values/[id] — per-row PATCH / DELETE.
//
// Wave-19.7.
//   - `domain` / `key` are IMMUTABLE — would corrupt rows that reference the
//     stored value (e.g. `policies.approval_tier`).
//   - On `is_default=true` rows, only `sort_order` may be edited (the seeded
//     baseline labels stay stable; admins can re-order them).
//   - DELETE refuses `is_default=true` rows + refuses any row whose key is
//     currently referenced (FK-style protection via a count query).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { Conflict, handle, NotFound, PreconditionFailed, ValidationFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { writeAudit } from '@/lib/api/audit'
import { UpdateEnumValueSchema } from '@/lib/api/schemas/enum-values'
import {
  ENUM_VALUE_COLUMNS,
  countEnumValueReferents,
  type EnumValueRow,
} from '@/lib/api/services/enum-values'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    assertUuid(id)
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, UpdateEnumValueSchema)
    const ifMatch = readIfMatch(req)

    const { data: before, error: bErr } = await supabase
      .from('enum_value_definitions')
      .select(ENUM_VALUE_COLUMNS)
      .eq('id', id)
      .maybeSingle<EnumValueRow>()
    if (bErr) throw bErr
    if (!before) throw NotFound(`Enum value ${id} not found`)
    assertNotStale(ifMatch, before.updated_at)

    // Seeded baseline rows cannot have their labels edited — only sort_order.
    if (
      before.is_default &&
      (input.name_en !== undefined || input.name_ar !== undefined)
    ) {
      throw ValidationFailed(
        [{ path: ['is_default'], message: 'cannot_edit_default' }],
        'cannot_edit_default',
      )
    }

    const update: Record<string, unknown> = {}
    if (input.name_en !== undefined) update.name_en = input.name_en
    if (input.name_ar !== undefined) update.name_ar = input.name_ar
    if (input.sort_order !== undefined) update.sort_order = input.sort_order
    if (Object.keys(update).length === 0) return ok(before)

    // W17.2 — atomic-on-client-token: scope the UPDATE itself to the token
    // when the client supplied one. The loser of a concurrent race matches 0
    // rows and surfaces as 412 below.
    let query = supabase.from('enum_value_definitions').update(update).eq('id', id)
    if (ifMatch != null) query = query.eq('updated_at', before.updated_at)
    const { data, error } = await query.select(ENUM_VALUE_COLUMNS).maybeSingle<EnumValueRow>()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'enum_value.update',
      entity_type: 'enum_value_definition',
      entity_id: id,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    assertUuid(id)
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const ifMatch = readIfMatch(req)

    const { data: before, error: bErr } = await supabase
      .from('enum_value_definitions')
      .select(ENUM_VALUE_COLUMNS)
      .eq('id', id)
      .maybeSingle<EnumValueRow>()
    if (bErr) throw bErr
    if (!before) throw NotFound(`Enum value ${id} not found`)
    assertNotStale(ifMatch, before.updated_at)

    if (before.is_default) {
      throw Conflict('cannot_delete_default')
    }

    // FK-style in-use protection: count referents in the consuming table for
    // this domain. Unknown domains (no referent counter wired) skip the check.
    const refs = await countEnumValueReferents(supabase, before.domain, before.key)
    if (refs !== null && refs > 0) {
      throw Conflict('in_use')
    }

    const { error } = await supabase
      .from('enum_value_definitions')
      .delete()
      .eq('id', id)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'enum_value.delete',
      entity_type: 'enum_value_definition',
      entity_id: id,
      metadata: { domain: before.domain, key: before.key },
      supabase,
    })

    return ok({ id, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
