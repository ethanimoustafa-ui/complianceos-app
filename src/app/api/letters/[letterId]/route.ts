// /api/letters/[letterId] — detail / patch / soft-delete.
//
// Wave-21 PORTING-TEMPLATE §2 countermeasures applied:
//   - GET: assertUuid, cache:'no-store', ETag from updated_at (§2.12, §2.13)
//   - PATCH: readIfMatch → before-snapshot → assertNotStale → conditional
//            UPDATE scoped to `updated_at` (W17.2 atomic pattern) → 412 on
//            0 rows; per-field diff → dual-store letter_timeline + letter_versions.
//   - DELETE: assertUuid + optional If-Match guard.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateLetterSchema } from '@/lib/api/schemas/letters'
import {
  LETTER_DETAIL_COLUMNS,
  LETTER_FIELD_LABEL_KEYS,
  assertLetterExists,
  getApprovalSteps,
  insertLetterTimeline,
  insertLetterVersion,
  letterFieldsUpdatedBody,
  type LetterFieldChange,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    // SEC-5 §2.13 — reject non-UUID segment with 400 before any DB access.
    assertUuid(letterId)
    const { supabase } = await requireUser()

    const { data: letter, error } = await supabase
      .from('letters')
      .select(LETTER_DETAIL_COLUMNS)
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!letter) throw NotFound(`Letter ${letterId} not found`)

    const [steps, attachments, timeline, observations, versions] = await Promise.all([
      getApprovalSteps(supabase, letterId),
      supabase
        .from('letter_attachments')
        .select('id, letter_id, name, storage_path, type, size, uploaded_at, uploaded_by')
        .eq('letter_id', letterId)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('letter_timeline')
        .select('id, letter_id, title, text_en, text_ar, date, user_name, status')
        .eq('letter_id', letterId)
        .order('date', { ascending: false }),
      supabase
        .from('letter_observations')
        .select('observation_id')
        .eq('letter_id', letterId),
      // Best-effort: letter_versions may not exist until migration 065 is applied.
      supabase
        .from('letter_versions')
        .select('id, letter_id, date, author, text_en, text_ar, field_changes, created_at')
        .eq('letter_id', letterId)
        .order('created_at', { ascending: false })
        .then((r) => {
          if (r.error && (r.error as { code?: string }).code === '42P01') return { data: [] }
          return r
        }),
    ])

    // §2.12 — weak ETag so the client can echo `If-Match` on the next PATCH.
    const row = letter as Record<string, unknown>
    const etag =
      typeof row.updated_at === 'string'
        ? { ETag: `W/"${row.updated_at}"` }
        : undefined

    return ok(
      {
        ...letter,
        approval_steps: steps,
        attachments: attachments.data ?? [],
        timeline: timeline.data ?? [],
        versions: versions.data ?? [],
        observations: ((observations.data ?? []) as { observation_id: string }[]).map(
          (r) => r.observation_id,
        ),
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
    const { letterId } = await params
    // SEC-5 §2.13
    assertUuid(letterId)
    const { supabase, user, profile } = await requireAnyPerm(['letter:edit', 'edit'])
    await assertLetterExists(supabase, letterId)

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
      // fall through — parseJson below surfaces the parse error
    }

    const patch = await parseJson(req, UpdateLetterSchema)
    const update: Record<string, unknown> = {}
    const guardedArrayKeys = new Set(['framework_ids'])
    // GAP-3: null must pass through so a cleared optional field NULLs its column.
    // Only `undefined` (absent key) is skipped.
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'template_id') continue
      if (v === undefined) continue
      if (guardedArrayKeys.has(k) && !(k in rawBody)) continue
      update[k] = v
    }

    if (Object.keys(update).length === 0) {
      const { data } = await supabase
        .from('letters')
        .select(LETTER_DETAIL_COLUMNS)
        .eq('id', letterId)
        .maybeSingle()
      return ok(data)
    }

    // Snapshot the full row BEFORE the update for field-level diff.
    const { data: before } = await supabase
      .from('letters')
      .select(LETTER_DETAIL_COLUMNS)
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<Record<string, unknown>>()

    // §2.12 — pre-check the If-Match token against the row's current updated_at.
    assertNotStale(ifMatch, before?.updated_at as string | undefined)

    // W17.2 ATOMIC PATTERN — the read-then-check above is NOT atomic. Close
    // the race by making the UPDATE itself conditional on the CLIENT TOKEN.
    let query = supabase
      .from('letters')
      .update(update)
      .eq('id', letterId)
      .is('deleted_at', null)
    if (ifMatch != null) {
      // CRITICAL: scope to the CLIENT-supplied token (NOT `before.updated_at`).
      // Using the server-just-read value re-opens the race (W17.2 lesson).
      query = query.eq('updated_at', ifMatch)
    }
    const { data, error } = await query
      .select(LETTER_DETAIL_COLUMNS)
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

    // §2.6 — per-field diff. Shared between activity-log and version writers.
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

    const fieldChanges: LetterFieldChange[] = changedKeys.map((k) => ({
      field: LETTER_FIELD_LABEL_KEYS[k] ?? k,
      from: displayValue(before?.[k]),
      to: displayValue(after[k]),
    }))

    const actor = profile.name ?? profile.email ?? user.id

    // Wave-21 P6 — ONE dual-store body powers both writers (mirrors observation pattern).
    const fieldsUpdatedBody = letterFieldsUpdatedBody(changedKeys)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.update',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { fields: changedKeys },
        supabase,
      }),
      // NOTE: We do NOT write to letter_timeline on every PATCH (the letter
      // editor auto-saves drafts on each keystroke — Fix-3 wave decision).
      // Timeline writes are restricted to discrete workflow milestones.
      // We DO write to letter_versions for the per-field history surface.
    ])

    // Version-history writer (best-effort, no-ops until migration 065 applies).
    if (fieldsUpdatedBody && fieldChanges.length > 0) {
      await insertLetterVersion(supabase, letterId, fieldsUpdatedBody, actor, fieldChanges)
    }

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])

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

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    // SEC-5 §2.13
    assertUuid(letterId)
    const { supabase, user, profile } = await requireAnyPerm(['letter:delete', 'delete'])
    await assertLetterExists(supabase, letterId)

    // §2.12 — optional optimistic-concurrency guard on DELETE.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('letters')
        .select('updated_at')
        .eq('id', letterId)
        .is('deleted_at', null)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    // Audit FIRST so the append-only trail survives even if the cascade
    // delete is interrupted. `audit_logs.entity_id` is polymorphic (not a FK)
    // so the record won't be cascade-deleted along with the row.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter.delete',
      entity_type: 'letter',
      entity_id: letterId,
      supabase,
    })

    // Hard-delete — FK cascade (migration 046) clears letter_attachments,
    // letter_approval_steps, letter_observations, letter_timeline.
    let delQuery = supabase.from('letters').delete().eq('id', letterId)
    if (ifMatch != null) delQuery = delQuery.eq('updated_at', ifMatch)
    const { error } = await delQuery
    if (error) throw error

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok({ id: letterId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
