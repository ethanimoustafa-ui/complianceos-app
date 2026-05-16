// /api/calendar/event-types/[typeId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCalendarEventTypeSchema } from '@/lib/api/schemas/calendar'
import { CALENDAR_EVENT_TYPE_COLUMNS } from '@/lib/api/services/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAG = 'calendar-event-types:list'

type Params = { params: Promise<{ typeId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { typeId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdateCalendarEventTypeSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('calendar_event_types')
      .update(update)
      .eq('id', typeId)
      .select(CALENDAR_EVENT_TYPE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Calendar event type ${typeId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'calendar_event_type.update',
      entity_type: 'calendar_event_type',
      entity_id: typeId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidate(TAG)
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
      .from('calendar_event_types')
      .delete()
      .eq('id', typeId)
      .eq('is_default', false)
    if (error) throw error
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'calendar_event_type.delete',
      entity_type: 'calendar_event_type',
      entity_id: typeId,
      supabase,
    })
    revalidate(TAG)
    return ok({ id: typeId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
