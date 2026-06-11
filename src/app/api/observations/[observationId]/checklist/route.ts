// Wave-20 — /api/observations/[observationId]/checklist — list / add items.

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
  assertObservationMembership,
  insertObservationTimeline,
  observationActorName,
} from '@/lib/api/services/observations'
import { renderBilingual } from '@/lib/i18n/server'

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

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    // W39: only people added to the observation can act on it (org_admin oversees).
    await assertObservationMembership(supabase, observationId, user.id, profile.role)
    const input = await parseJson(req, CreateChecklistItemSchema)

    // GAP-12 — server-authoritative MAX+1 sort_order. The client may still
    // send a value; it's overridden.
    const { data: top } = await supabase
      .from('observation_checklist')
      .select('sort_order')
      .eq('observation_id', observationId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>()
    const nextOrder = (top?.sort_order ?? -1) + 1

    const { data, error } = await supabase
      .from('observation_checklist')
      .insert({
        observation_id: observationId,
        text: input.text,
        sort_order: nextOrder,
        deadline: input.deadline ?? null,
      })
      .select(OBSERVATION_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.checklist.create',
        entity_type: 'observation_checklist',
        entity_id: created.id,
        metadata: { observation_id: observationId },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'checklist.added',
        user_id: user.id,
        user_name: actor,
        target_id: created.id,
        ...renderBilingual('regulatoryUpdates.timeline.checklistItemAdded', { title: input.text }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
