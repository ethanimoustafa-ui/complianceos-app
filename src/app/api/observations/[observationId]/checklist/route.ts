// /api/observations/[observationId]/checklist — list / add checklist items.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateChecklistItemSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_CHECKLIST_COLUMNS,
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase } = await requireUser()
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { data, error } = await supabase
      .from('observation_checklist')
      .select(OBSERVATION_CHECKLIST_COLUMNS)
      .eq('observation_id', observationId)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.observations(observationId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, CreateChecklistItemSchema)

    const { data, error } = await supabase
      .from('observation_checklist')
      .insert({
        observation_id: observationId,
        text: input.text,
        sort_order: input.sort_order ?? 0,
      })
      .select(OBSERVATION_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.checklist.create',
        entity_type: 'observation_checklist',
        entity_id: created.id,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'checklist.added',
        description: `Checklist item added: ${input.text}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: created.id,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
