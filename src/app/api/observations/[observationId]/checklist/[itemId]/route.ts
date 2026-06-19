// Wave-20 — /api/observations/[observationId]/checklist/[itemId] — PATCH/DELETE.
//
// Atomic-update-conditional-on-If-Match (W17.2): UPDATE/DELETE scoped to
// `updated_at = ifMatch`; 0 rows → 412.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed, Forbidden } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateChecklistItemSchema } from '@/lib/api/schemas/observations'
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

type Params = { params: Promise<{ observationId: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, itemId } = await params
    assertUuid(itemId)
    // RBAC: `observation:checklist` (migration 118) OR `observation:edit` + membership.
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    const hasChecklistPerm = ctx.permissions.includes('observation:checklist')
    if (!hasChecklistPerm && !ctx.permissions.includes('observation:edit')) {
      throw Forbidden('Missing permission: observation:checklist or observation:edit')
    }
    const observationId = await assertObservationExists(supabase, observationIdParam)
    // W39: only people added to the observation can act on it (org_admin oversees).
    if (!hasChecklistPerm) {
      await assertObservationMembership(supabase, observationId, user.id, profile.role)
    }
    const ifMatch = readIfMatch(req)
    const patch = await parseJson(req, UpdateChecklistItemSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v
    if (Object.keys(update).length === 0) {
      const { data: row } = await supabase
        .from('observation_checklist')
        .select(OBSERVATION_CHECKLIST_COLUMNS)
        .eq('id', itemId)
        .eq('observation_id', observationId)
        .maybeSingle()
      if (!row) throw NotFound(`Checklist item ${itemId} not found`)
      return ok(row)
    }

    // Pre-check token for the clean 412 (the atomic UPDATE still owns the
    // race; this is for nicer error envelopes).
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('observation_checklist')
        .select('updated_at')
        .eq('id', itemId)
        .eq('observation_id', observationId)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    let q = supabase
      .from('observation_checklist')
      .update(update)
      .eq('id', itemId)
      .eq('observation_id', observationId)
    if (ifMatch != null) q = q.eq('updated_at', ifMatch)
    const { data, error } = await q.select(OBSERVATION_CHECKLIST_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound(`Checklist item ${itemId} not found`)
    }

    const actor = observationActorName(profile, user.id)
    const row = data as { text: string }
    const timelineKey =
      update.completed === true
        ? 'regulatoryUpdates.timeline.checklistItemCompleted'
        : update.completed === false
          ? 'regulatoryUpdates.timeline.checklistItemUnchecked'
          : 'regulatoryUpdates.timeline.checklistItemRenamed'
    const timelineParams: Record<string, string> =
      update.completed === undefined
        ? { from: row.text ?? '', to: (update.text as string | undefined) ?? row.text ?? '' }
        : { title: row.text ?? '' }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.checklist.update',
        entity_type: 'observation_checklist',
        entity_id: itemId,
        metadata: { observation_id: observationId, fields: Object.keys(update) },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type:
          update.completed === true
            ? 'checklist.completed'
            : update.completed === false
              ? 'checklist.uncompleted'
              : 'checklist.updated',
        user_id: user.id,
        user_name: actor,
        target_id: itemId,
        ...renderBilingual(timelineKey, timelineParams),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, itemId } = await params
    assertUuid(itemId)
    // RBAC: `observation:checklist` (migration 118) OR `observation:edit` + membership.
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    const hasChecklistPerm = ctx.permissions.includes('observation:checklist')
    if (!hasChecklistPerm && !ctx.permissions.includes('observation:edit')) {
      throw Forbidden('Missing permission: observation:checklist or observation:edit')
    }
    const observationId = await assertObservationExists(supabase, observationIdParam)
    // W39: only people added to the observation can act on it (org_admin oversees).
    if (!hasChecklistPerm) {
      await assertObservationMembership(supabase, observationId, user.id, profile.role)
    }
    const ifMatch = readIfMatch(req)

    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('observation_checklist')
        .select('updated_at')
        .eq('id', itemId)
        .eq('observation_id', observationId)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    let q = supabase
      .from('observation_checklist')
      .delete()
      .eq('id', itemId)
      .eq('observation_id', observationId)
    if (ifMatch != null) q = q.eq('updated_at', ifMatch)
    const { data: deleted, error } = await q.select('id, text').maybeSingle<{ id: string; text: string }>()
    if (error) throw error
    if (!deleted && ifMatch != null) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.checklist.delete',
        entity_type: 'observation_checklist',
        entity_id: itemId,
        metadata: { observation_id: observationId },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'checklist.removed',
        user_id: user.id,
        user_name: actor,
        target_id: itemId,
        ...renderBilingual('regulatoryUpdates.timeline.checklistItemDeleted', {
          title: deleted?.text ?? '',
        }),
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok({ id: itemId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
