// /api/correspondence/[correspondenceId] — detail / patch / soft-delete.
//
// W22 PORTING-TEMPLATE §2 countermeasures applied:
//   - GET: assertUuid (SEC-5 §2.13), cache:'no-store' (§2.2), ETag from
//          updated_at (§2.12).
//   - PATCH: assertUuid + readIfMatch → before-snapshot → assertNotStale →
//            conditional UPDATE on updated_at (W17.2 atomic pattern) → 412 on
//            0 rows. Returns fresh ETag.
//   - DELETE: assertUuid + optional If-Match guard.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCorrespondenceSchema } from '@/lib/api/schemas/correspondence'
import {
  CORRESPONDENCE_ATTACHMENT_COLUMNS,
  CORRESPONDENCE_DETAIL_COLUMNS,
  assertCorrespondenceExists,
} from '@/lib/api/services/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ correspondenceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    // SEC-5 §2.13 — reject non-UUID segment with 400 before any DB access.
    assertUuid(correspondenceId)
    const { supabase } = await requireUser()

    const { data: row, error } = await supabase
      .from('correspondence')
      .select(CORRESPONDENCE_DETAIL_COLUMNS)
      .eq('id', correspondenceId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!row) throw NotFound(`Correspondence ${correspondenceId} not found`)

    const [attachments, thread] = await Promise.all([
      supabase
        .from('correspondence_attachments')
        .select(CORRESPONDENCE_ATTACHMENT_COLUMNS)
        .eq('correspondence_id', correspondenceId)
        .order('uploaded_at', { ascending: false }),
      // Thread peers — by `thread_id` text column. Returns siblings (excluding
      // self) ordered chronologically. Null thread_id → empty array.
      (async () => {
        const tid = (row as { thread_id: string | null }).thread_id
        if (!tid) return { data: [] }
        return supabase
          .from('correspondence')
          .select('id, reference, subject, status, date, from_party, to_parties')
          .eq('thread_id', tid)
          .neq('id', correspondenceId)
          .is('deleted_at', null)
          .order('date', { ascending: true })
      })(),
    ])

    // §2.12 — weak ETag so the client can echo `If-Match` on the next PATCH.
    const r = row as Record<string, unknown>
    const etag =
      typeof r.updated_at === 'string' && r.updated_at
        ? { ETag: `W/"${r.updated_at}"` }
        : undefined

    return ok(
      {
        ...row,
        attachments: attachments.data ?? [],
        thread: thread.data ?? [],
      },
      // §2.2 — cache:'no-store' on entity reads.
      { cache: 'no-store', headers: etag },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    // SEC-5 §2.13 — reject non-UUID before DB access.
    assertUuid(correspondenceId)
    // Granular `feed:edit` (migration 118) OR the legacy generic `edit` key.
    const { supabase, user, profile } = await requireAnyPerm(['feed:edit', 'edit'])

    // §2.12 — read the client's If-Match token (weak ETag = W/"<updated_at>").
    const ifMatch = readIfMatch(req)

    // SEC-8 / W42: validate the body at the boundary BEFORE any DB I/O — an
    // unknown key must 400 regardless of whether the row exists.
    const patch = await parseJson(req, UpdateCorrespondenceSchema)

    // Snapshot the row so we can (a) assertNotStale, (b) pass updated_at to
    // the atomic conditional UPDATE, (c) generate a per-field diff in the audit.
    const { data: before, error: fetchErr } = await supabase
      .from('correspondence')
      .select(CORRESPONDENCE_DETAIL_COLUMNS)
      .eq('id', correspondenceId)
      .is('deleted_at', null)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!before) throw NotFound(`Correspondence ${correspondenceId} not found`)

    const b = before as Record<string, unknown>
    // §2.12 — 412 if client's token doesn't match current updated_at.
    assertNotStale(ifMatch, b.updated_at as string | null | undefined)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    // W17.2 atomic pattern: scope the UPDATE to WHERE updated_at = <token> when
    // If-Match was supplied. Postgres returns 0 rows if another writer won the
    // race → surface as 412. This closes the TOCTOU gap between the read-then-
    // assertNotStale and the actual write.
    let query = supabase
      .from('correspondence')
      .update(update)
      .eq('id', correspondenceId)
      .is('deleted_at', null)
    if (ifMatch) {
      query = query.eq('updated_at', ifMatch)
    }
    // Use maybeSingle() so that 0 rows (If-Match stale after concurrent write)
    // returns null data rather than a PGRST116 error that would surface as 500.
    const { data, error } = await query.select(CORRESPONDENCE_DETAIL_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      // 0 rows — either the If-Match stale token was the cause (concurrent write
      // won the race) or the row was deleted between our snapshot and the UPDATE.
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.update',
      entity_type: 'correspondence',
      entity_id: correspondenceId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    // §2.12 — return fresh ETag for the next PATCH.
    const after = data as Record<string, unknown>
    const etag =
      typeof after.updated_at === 'string' && after.updated_at
        ? { ETag: `W/"${after.updated_at}"` }
        : undefined

    revalidateAll([cacheTags.correspondence(), cacheTags.correspondence(correspondenceId)])
    return ok(data, { headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    // SEC-5 §2.13 — reject non-UUID before DB access.
    assertUuid(correspondenceId)
    // Granular `feed:delete` (migration 118) OR the legacy generic `delete` key.
    const { supabase, user, profile } = await requireAnyPerm(['feed:delete', 'delete'])
    await assertCorrespondenceExists(supabase, correspondenceId)

    // Audit FIRST — append-only trail survives even if the soft-delete write fails.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.delete',
      entity_type: 'correspondence',
      entity_id: correspondenceId,
      supabase,
    })

    // F1: soft-delete — set deleted_at = now() so the row is excluded from
    // all GET/PATCH queries (which filter `.is('deleted_at', null)`) while
    // preserving the row for audit history.
    const { error } = await supabase
      .from('correspondence')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', correspondenceId)
    if (error) throw error

    revalidateAll([cacheTags.correspondence(), cacheTags.correspondence(correspondenceId)])
    return ok({ id: correspondenceId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
