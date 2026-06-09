// PATCH /api/observations/[observationId]/remediation/[planId]/toggle/[itemId]
//
// Toggles an observation_checklist item that belongs to a remediation plan.
// The current schema does not have a per-plan checklist table — the
// observation-level checklist is reused. This handler toggles the item and
// records the action against the plan in the timeline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
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

type Params = {
  params: Promise<{ observationId: string; planId: string; itemId: string }>
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    const { observationId, planId, itemId } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    await assertObservationExists(supabase, observationId)
    // W39: only people added to the observation can act on it (org_admin oversees).
    await assertObservationMembership(supabase, observationId, user.id, profile.role)

    const { data: current, error: readErr } = await supabase
      .from('observation_checklist')
      .select('id, completed')
      .eq('id', itemId)
      .eq('observation_id', observationId)
      .maybeSingle<{ id: string; completed: boolean }>()
    if (readErr) throw readErr
    if (!current) throw NotFound(`Checklist item ${itemId} not found`)

    const { data, error } = await supabase
      .from('observation_checklist')
      .update({ completed: !current.completed })
      .eq('id', itemId)
      .eq('observation_id', observationId)
      .select(OBSERVATION_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    const actor = observationActorName(profile, user.id)
    const timelineKey = !current.completed
      ? 'regulatoryUpdates.timeline.checklistItemCompleted'
      : 'regulatoryUpdates.timeline.checklistItemUnchecked'
    // The checklist item text isn't selected here; use the item id as title
    // fallback. A future improvement could join the text column.
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.remediation.toggle',
        entity_type: 'observation_checklist',
        entity_id: itemId,
        metadata: {
          observation_id: observationId,
          plan_id: planId,
          completed: !current.completed,
        },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: !current.completed
          ? 'remediation.item.completed'
          : 'remediation.item.uncompleted',
        user_id: user.id,
        user_name: actor,
        target_id: itemId,
        metadata: { plan_id: planId },
        ...renderBilingual(timelineKey, { title: itemId }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
