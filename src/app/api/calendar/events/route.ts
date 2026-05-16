// /api/calendar/events — collection.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateCalendarEventSchema,
  ListCalendarEventsQuerySchema,
} from '@/lib/api/schemas/calendar'
import { CALENDAR_EVENT_LIST_COLUMNS } from '@/lib/api/services/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListCalendarEventsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('calendar_events')
      .select(CALENDAR_EVENT_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
    if (q.start_date) query = query.gte('date', q.start_date)
    if (q.end_date) query = query.lte('date', q.end_date)
    if (q.source_type) query = query.eq('related_entity_type', q.source_type)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.show_completed === false) query = query.eq('completed', false)
    // department_id filter — no department FK on calendar_events; deferred. See deviations.

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('date', { ascending: true })
      .range(from, to)
    if (error) throw error
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.calendar()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('create')
    const input = await parseJson(req, CreateCalendarEventSchema)

    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        title: input.title,
        type: input.type,
        date: input.date,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        attendees: input.attendees,
        related_entity_id: input.related_entity_id ?? null,
        related_entity_type: input.related_entity_type ?? null,
        reminders: input.reminders,
        description: input.description ?? null,
        location: input.location ?? null,
        agency: input.agency ?? null,
        severity: input.severity ?? null,
        framework_ids: input.framework_ids,
      })
      .select(CALENDAR_EVENT_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'calendar_event.create',
      entity_type: 'calendar_event',
      entity_id: created.id,
      metadata: { title: input.title, type: input.type, date: input.date },
      supabase,
    })
    revalidate(cacheTags.calendar())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
