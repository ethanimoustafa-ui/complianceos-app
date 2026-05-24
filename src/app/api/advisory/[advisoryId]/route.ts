// /api/advisory/[advisoryId] — detail / patch / soft-delete / note-append.
//
// W23 PORTING-TEMPLATE §2 countermeasures applied:
//   GET:    assertUuid (SEC-5), cache:'no-store' (§2.2), ETag header (§2.12).
//           Embeds advisory_notes, advisory_timeline, advisory_versions.
//   PATCH:  assertUuid, readIfMatch, assertNotStale, W17.2 atomic conditional
//           UPDATE scoped to client-supplied token (NOT server-just-read value).
//           .maybeSingle() on post-UPDATE select (W22 sub-pattern — avoids .single()
//           throwing 0 rows when stale-token UPDATE matches nothing).
//           Per-field diff → dual-store advisory_timeline + advisory_versions.
//   POST:   Co-located note-append handler — assertUuid, dual-store timeline.
//   DELETE: assertUuid, optional If-Match guard on soft-delete.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAdvisorySchema, CreateAdvisoryNoteSchema } from '@/lib/api/schemas/advisory'
import {
  ADVISORY_DETAIL_COLUMNS,
  ADVISORY_FIELD_LABEL_KEYS,
  assertAdvisoryExists,
  insertAdvisoryTimeline,
  insertAdvisoryVersion,
  advisoryFieldsUpdatedBody,
  type AdvisoryFieldChange,
} from '@/lib/api/services/advisory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ advisoryId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    // SEC-5 §2.13 — reject non-UUID segment with 400 before any DB access.
    assertUuid(advisoryId)
    const { supabase } = await requireUser()

    const { data: row, error } = await supabase
      .from('advisory_requests')
      .select(ADVISORY_DETAIL_COLUMNS)
      .eq('id', advisoryId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!row) throw NotFound(`Advisory ${advisoryId} not found`)

    // Fetch children in parallel — best-effort on timeline/versions in case
    // migration 066 hasn't run yet (42P01 guard).
    const [notesResult, timelineResult, versionsResult] = await Promise.all([
      supabase
        .from('advisory_notes')
        .select('id, request_id, author, content, created_at')
        .eq('request_id', advisoryId)
        .order('created_at', { ascending: false }),
      supabase
        .from('advisory_timeline')
        .select('id, advisory_id, text_en, text_ar, user_name, status, created_at')
        .eq('advisory_id', advisoryId)
        .order('created_at', { ascending: false })
        .then((r) => {
          if (r.error && (r.error as { code?: string }).code === '42P01') return { data: [] }
          return r
        }),
      supabase
        .from('advisory_versions')
        .select('id, advisory_id, date, author, text_en, text_ar, field_changes, created_at')
        .eq('advisory_id', advisoryId)
        .order('created_at', { ascending: false })
        .then((r) => {
          if (r.error && (r.error as { code?: string }).code === '42P01') return { data: [] }
          return r
        }),
    ])

    // §2.12 — weak ETag so the client can echo `If-Match` on the next PATCH.
    const r = row as Record<string, unknown>
    const etag =
      typeof r.updated_at === 'string'
        ? { ETag: `W/"${r.updated_at}"` }
        : undefined

    return ok(
      {
        ...row,
        notes: notesResult.data ?? [],
        timeline: timelineResult.data ?? [],
        versions: versionsResult.data ?? [],
      },
      // PORTING-TEMPLATE §2.2 — cache:'no-store' on entity reads.
      { cache: 'no-store', headers: etag },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    // SEC-5 §2.13
    assertUuid(advisoryId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertAdvisoryExists(supabase, advisoryId)

    // §2.12 — optimistic-concurrency token.
    const ifMatch = readIfMatch(req)

    const patch = await parseJson(req, UpdateAdvisorySchema)
    const update: Record<string, unknown> = {}
    // GAP-3: null must pass through so a cleared optional field NULLs its column.
    // Only `undefined` (absent key) is skipped.
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      update[k] = v
    }

    if (Object.keys(update).length === 0) {
      const { data } = await supabase
        .from('advisory_requests')
        .select(ADVISORY_DETAIL_COLUMNS)
        .eq('id', advisoryId)
        .maybeSingle()
      return ok(data)
    }

    // Snapshot the full row BEFORE the update for field-level diff.
    const { data: before } = await supabase
      .from('advisory_requests')
      .select(ADVISORY_DETAIL_COLUMNS)
      .eq('id', advisoryId)
      .is('deleted_at', null)
      .maybeSingle<Record<string, unknown>>()

    // §2.12 — pre-check the If-Match token against the row's current updated_at.
    assertNotStale(ifMatch, before?.updated_at as string | undefined)

    // W17.2 ATOMIC PATTERN — the read-then-check above is NOT atomic. Close
    // the race by making the UPDATE itself conditional on the CLIENT TOKEN.
    let query = supabase
      .from('advisory_requests')
      .update(update)
      .eq('id', advisoryId)
      .is('deleted_at', null)
    if (ifMatch != null) {
      // CRITICAL: scope to the CLIENT-supplied token (NOT `before.updated_at`).
      // Using the server-just-read value re-opens the race (W17.2 lesson).
      query = query.eq('updated_at', ifMatch)
    }
    // W22 sub-pattern: .maybeSingle() avoids .single() throwing on 0 rows from
    // stale-token UPDATE, which would mask the 412 path with a Supabase error.
    const { data, error } = await query
      .select(ADVISORY_DETAIL_COLUMNS)
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

    // §2.6 — per-field diff. Shared between timeline and version writers.
    const after = data as Record<string, unknown>
    const sameValue = (a: unknown, b: unknown): boolean =>
      (a ?? null) === (b ?? null)
    const displayValue = (v: unknown): string => {
      if (v == null) return ''
      if (Array.isArray(v)) return v.join(', ')
      return String(v)
    }
    const changedKeys = Object.keys(update).filter(
      (k) => !sameValue(before?.[k], after[k]),
    )

    const fieldChanges: AdvisoryFieldChange[] = changedKeys.map((k) => ({
      field: ADVISORY_FIELD_LABEL_KEYS[k] ?? k,
      from: displayValue(before?.[k]),
      to: displayValue(after[k]),
    }))

    const actor = profile.name ?? profile.email ?? user.id

    // W23 P6 — ONE dual-store body powers both writers (mirrors letter pattern).
    const fieldsUpdatedBody = advisoryFieldsUpdatedBody(changedKeys)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'advisory.update',
        entity_type: 'advisory_request',
        entity_id: advisoryId,
        metadata: { fields: changedKeys },
        supabase,
      }),
      // Timeline: only write when something actually changed.
      fieldsUpdatedBody
        ? insertAdvisoryTimeline(
            supabase,
            advisoryId,
            'advisory.fieldsUpdated',
            {
              fields: {
                en: changedKeys.map((k) => ADVISORY_FIELD_LABEL_KEYS[k] ?? k).join(', '),
                ar: changedKeys.map((k) => ADVISORY_FIELD_LABEL_KEYS[k] ?? k).join('، '),
              },
            },
            actor,
          )
        : Promise.resolve(),
    ])

    // Version-history writer (best-effort, no-ops until migration 066 applies).
    if (fieldsUpdatedBody && fieldChanges.length > 0) {
      await insertAdvisoryVersion(supabase, advisoryId, fieldsUpdatedBody, actor, fieldChanges)
    }

    revalidateAll([cacheTags.advisory(), cacheTags.advisory(advisoryId)])

    // Return the updated row with a fresh ETag for the next PATCH.
    const etag =
      typeof after.updated_at === 'string'
        ? { ETag: `W/"${after.updated_at}"` }
        : undefined
    return ok(data, { headers: etag })
  } catch (e) {
    return handle(e)
  }
}

/**
 * POST /api/advisory/[advisoryId]
 *
 * Append a note to the advisory_notes table. Co-located on the detail route.
 * W23: dual-store timeline row written for each note addition.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    // SEC-5 §2.13
    assertUuid(advisoryId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertAdvisoryExists(supabase, advisoryId)
    const input = await parseJson(req, CreateAdvisoryNoteSchema)

    const { data, error } = await supabase
      .from('advisory_notes')
      .insert({
        request_id: advisoryId,
        author: input.author,
        content: input.content,
      })
      .select('id, request_id, author, content, created_at')
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const actor = profile.name ?? profile.email ?? user.id
    const note = data as { id: string }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'advisory.note.add',
        entity_type: 'advisory_note',
        entity_id: note.id,
        metadata: { advisory_id: advisoryId },
        supabase,
      }),
      // W23 P6 — dual-store timeline row for note-add event.
      insertAdvisoryTimeline(
        supabase,
        advisoryId,
        'advisory.noteAdded2',
        { author: input.author },
        actor,
        'note',
      ),
    ])

    revalidateAll([cacheTags.advisory(), cacheTags.advisory(advisoryId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    // SEC-5 §2.13
    assertUuid(advisoryId)
    const { supabase, user, profile } = await requirePerm('delete')
    await assertAdvisoryExists(supabase, advisoryId)

    // §2.12 — optional optimistic-concurrency guard on DELETE.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('advisory_requests')
        .select('updated_at')
        .eq('id', advisoryId)
        .is('deleted_at', null)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    // Audit FIRST so the trail survives.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'advisory.delete',
      entity_type: 'advisory_request',
      entity_id: advisoryId,
      supabase,
    })

    // Soft-delete (advisory_requests has a deleted_at column).
    let delQuery = supabase
      .from('advisory_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', advisoryId)
      .is('deleted_at', null)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { error } = await delQuery
    if (error) throw error

    revalidateAll([cacheTags.advisory(), cacheTags.advisory(advisoryId)])
    return ok({ id: advisoryId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
