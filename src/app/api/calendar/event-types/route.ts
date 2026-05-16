// /api/calendar/event-types — system lookup.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateCalendarEventTypeSchema } from '@/lib/api/schemas/calendar'
import { CALENDAR_EVENT_TYPE_COLUMNS } from '@/lib/api/services/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAG = 'calendar-event-types:list'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('calendar_event_types')
      .select(CALENDAR_EVENT_TYPE_COLUMNS)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [TAG] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateCalendarEventTypeSchema)
    const { data, error } = await supabase
      .from('calendar_event_types')
      .insert(input)
      .select(CALENDAR_EVENT_TYPE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')
    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'calendar_event_type.create',
      entity_type: 'calendar_event_type',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })
    revalidate(TAG)
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
