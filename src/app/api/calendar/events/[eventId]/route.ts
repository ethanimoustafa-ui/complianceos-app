// /api/calendar/events/[eventId] — GET / PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCalendarEventSchema } from '@/lib/api/schemas/calendar'
import {
  CALENDAR_EVENT_DETAIL_COLUMNS,
  assertCalendarEventExists,
} from '@/lib/api/services/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ eventId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('calendar_events')
      .select(CALENDAR_EVENT_DETAIL_COLUMNS)
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Calendar event ${eventId} not found`)
    return ok(data, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.calendar(eventId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCalendarEventExists(supabase, eventId)
    const patch = await parseJson(req, UpdateCalendarEventSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    // Auto-stamp completed_at when flipping completed=true.
    if (update.completed === true) {
      update.completed_at = new Date().toISOString()
    } else if (update.completed === false) {
      update.completed_at = null
    }

    const { data, error } = await supabase
      .from('calendar_events')
      .update(update)
      .eq('id', eventId)
      .is('deleted_at', null)
      .select(CALENDAR_EVENT_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'calendar_event.update',
      entity_type: 'calendar_event',
      entity_id: eventId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })
    revalidateAll([cacheTags.calendar(), cacheTags.calendar(eventId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { eventId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertCalendarEventExists(supabase, eventId)
    const { error } = await supabase
      .from('calendar_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', eventId)
      .is('deleted_at', null)
    if (error) throw error
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'calendar_event.delete',
      entity_type: 'calendar_event',
      entity_id: eventId,
      supabase,
    })
    revalidateAll([cacheTags.calendar(), cacheTags.calendar(eventId)])
    return ok({ id: eventId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
