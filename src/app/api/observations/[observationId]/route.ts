// Wave-20 — /api/observations/[observationId] — item GET/PATCH/DELETE.
//
// PORTING-TEMPLATE §2 countermeasures applied:
//   - GET: assertUuid, cache:'no-store', ETag from updated_at (§2.12, §2.13)
//   - PATCH: readIfMatch → before-snapshot → assertNotStale → conditional
//            UPDATE scoped to `updated_at` (the W17.2 atomic pattern), 412 on
//            0 rows; per-field diff → dual-store activity log + (future)
//            observation_versions row reusing ONE fieldsUpdatedBody.
//   - DELETE: assertUuid + optional If-Match guard.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateObservationSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_DETAIL_COLUMNS,
  OBSERVATION_FIELD_LABEL_KEYS,
  assertObservationExists,
  getObservationDetail,
  insertObservationTimeline,
  insertObservationVersion,
  observationActorName,
  observationFieldsUpdatedBody,
  recomputeObservationDerivedState,
  type ObservationFieldChange,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    // SEC-5 / §2.13. The store sometimes passes `OBS-2026-0001`; the assertUuid
    // is strict so we only invoke it when the segment looks like a UUID — bare
    // references continue to resolve via assertObservationExists.
    const looksUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationIdParam)
    if (looksUuid) assertUuid(observationIdParam)
    const { supabase } = await requireUser()
    const detail = await getObservationDetail(supabase, observationIdParam)

    // §2.12 — weak ETag so the client can echo `If-Match` on the next PATCH.
    const etag =
      typeof detail.updated_at === 'string'
        ? { ETag: `W/"${detail.updated_at}"` }
        : undefined

    return ok(detail, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)

    // §2.12 — optimistic-concurrency token.
    const ifMatch = readIfMatch(req)

    // P2 / HANI-3 — raw-body key-presence gate for destructive array column.
    // A PATCH that omits `framework_ids` MUST NOT overwrite it.
    let rawBody: Record<string, unknown> = {}
    try {
      const cloned = req.clone()
      const parsed = await cloned.json()
      if (parsed && typeof parsed === 'object') rawBody = parsed as Record<string, unknown>
    } catch {
      // fall through — parseJson below surfaces the parse error.
    }

    const patch = await parseJson(req, UpdateObservationSchema)
    const update: Record<string, unknown> = {}
    const guardedArrayKeys = new Set(['framework_ids'])
    // GAP-3: `null` must pass through here so a cleared optional field NULLs
    // its column. Only `undefined` (absent key) is skipped.
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      if (guardedArrayKeys.has(k) && !(k in rawBody)) continue
      update[k] = v
    }

    if (Object.keys(update).length === 0) {
      const detail = await getObservationDetail(supabase, observationId)
      return ok(detail)
    }

    // Snapshot the full row BEFORE the update so we can diff field-by-field.
    const { data: before } = await supabase
      .from('observations')
      .select(OBSERVATION_DETAIL_COLUMNS)
      .eq('id', observationId)
      .is('deleted_at', null)
      .maybeSingle<Record<string, unknown>>()

    // §2.12 — pre-check the If-Match token against the row's current updated_at.
    assertNotStale(ifMatch, before?.updated_at as string | undefined)

    // W17.2 ATOMIC PATTERN — the read-then-check above is NOT atomic. Close
    // the race by making the UPDATE itself conditional on the CLIENT TOKEN.
    let query = supabase
      .from('observations')
      .update(update)
      .eq('id', observationId)
      .is('deleted_at', null)
    if (ifMatch != null) {
      // CRITICAL: scope to the CLIENT-supplied token (NOT `before.updated_at`).
      // The W17.2 lesson — using the server-just-read value re-opens the race.
      query = query.eq('updated_at', ifMatch)
    }
    const { data, error } = await query
      .select(OBSERVATION_DETAIL_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    // §2.6 — per-field diff. Reused for the activity-log row AND the
    // (future) observation_versions row so both surfaces stay in lockstep.
    const after = data as Record<string, unknown>
    const sameValue = (a: unknown, b: unknown): boolean => {
      if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((v, i) => v === b[i])
      return (a ?? null) === (b ?? null)
    }
    const displayValue = (v: unknown): string => {
      if (v == null) return ''
      if (Array.isArray(v)) return v.join(', ')
      return String(v)
    }
    const changedKeys = Object.keys(update).filter(
      (k) => !sameValue(before?.[k], after[k]),
    )

    const fieldChanges: ObservationFieldChange[] = changedKeys.map((k) => ({
      field: OBSERVATION_FIELD_LABEL_KEYS[k] ?? k,
      from: displayValue(before?.[k]),
      to: displayValue(after[k]),
    }))

    const actor = observationActorName(profile, user.id)
    // Wave-19.5 — ONE dual-store body powers both writers. No duplicate
    // composition. The function returns null when nothing changed.
    const fieldsUpdatedBody = observationFieldsUpdatedBody(changedKeys)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.update',
        entity_type: 'observation',
        entity_id: observationId,
        metadata: { fields: changedKeys },
        supabase,
      }),
      fieldsUpdatedBody
        ? insertObservationTimeline({
            supabase,
            observation_id: observationId,
            action_type: 'edited',
            user_id: user.id,
            user_name: actor,
            text_en: fieldsUpdatedBody.text_en,
            text_ar: fieldsUpdatedBody.text_ar,
            metadata: { fields: changedKeys },
          })
        : Promise.resolve(),
    ])

    // Option-B writer — best-effort, silently no-ops until the
    // `observation_versions` table is created (see Wave-20 doc).
    if (fieldsUpdatedBody) {
      await insertObservationVersion(
        supabase,
        observationId,
        fieldsUpdatedBody,
        actor,
        fieldChanges,
      )
    }

    // §2.7 — server-authoritative recompute on every mutation.
    await recomputeObservationDerivedState(supabase, observationId)

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    if (update.status !== undefined || update.progress !== undefined) {
      revalidate(cacheTags.compliance())
    }

    // Return the canonical row with the refreshed `updated_at` + `is_overdue`.
    // The PATCH echoes the parent row only (children unchanged) — for the
    // full nested detail the client calls GET; the W17.2 contract still
    // requires a fresh ETag so the next PATCH can succeed.
    const etag =
      typeof (after.updated_at as string) === 'string'
        ? { ETag: `W/"${after.updated_at as string}"` }
        : undefined
    return ok(after, { headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:delete')
    const observationId = await assertObservationExists(supabase, observationIdParam)

    // §2.12 — optional optimistic-concurrency guard on DELETE.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('observations')
        .select('updated_at')
        .eq('id', observationId)
        .is('deleted_at', null)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    // Hard-delete — migration 043 confirmed all child tables have ON DELETE CASCADE
    // (observation_documents, observation_updates, observation_timeline, etc.)
    const deleteQ = supabase
      .from('observations')
      .delete()
      .eq('id', observationId)
    const { error } = ifMatch != null
      ? await deleteQ.eq('updated_at', ifMatch)
      : await deleteQ
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: observationActorName(profile, user.id),
      action: 'observation.delete',
      entity_type: 'observation',
      entity_id: observationId,
      supabase,
    })

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    revalidate(cacheTags.compliance())
    return ok({ id: observationId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
