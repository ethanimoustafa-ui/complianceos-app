// /api/circulars/[circularId]/implementations/[implementationId]/checklist/[itemId]
// — get / patch / delete a single checklist item.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateArticleChecklistItemSchema } from '@/lib/api/schemas/circulars'
import {
  ARTICLE_CHECKLIST_COLUMNS,
  assertArticleExists,
  assertCircularExists,
  insertArticleTimeline,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'
// Wave-19.1 / Q8 — server-side bilingual renderer for dual-store timeline rows.
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = {
  params: Promise<{ circularId: string; implementationId: string; itemId: string }>
}

// W17.2: single-resource GET — exposes `ETag: W/"<updated_at>"` for the
// client's next `If-Match`-guarded PATCH/DELETE.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId, itemId } = await params
    assertUuid(circularId, implementationId, itemId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)

    const { data, error } = await supabase
      .from('article_checklist_items')
      .select(ARTICLE_CHECKLIST_COLUMNS)
      .eq('id', itemId)
      .eq('article_id', implementationId)
      .maybeSingle<Record<string, unknown>>()
    if (error) throw error
    if (!data) throw NotFound(`Checklist item ${itemId} not found`)

    const updatedAt = data.updated_at
    const etag =
      typeof updatedAt === 'string' ? { ETag: `W/"${updatedAt}"` } : undefined
    return ok(data, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId, itemId } = await params
    assertUuid(circularId, implementationId, itemId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)
    // W17-1 / SEC-1: optimistic-concurrency token. UPDATE scoped to the live
    // `updated_at` so concurrent PATCHes carrying the same fresh token race
    // atomically — one wins, the other matches 0 rows and returns 412.
    const ifMatch = readIfMatch(req)
    const patch = await parseJson(req, UpdateArticleChecklistItemSchema)

    const { data: prev, error: prevErr } = await supabase
      .from('article_checklist_items')
      .select(ARTICLE_CHECKLIST_COLUMNS)
      .eq('id', itemId)
      .eq('article_id', implementationId)
      .maybeSingle<Record<string, unknown>>()
    if (prevErr) throw prevErr
    if (!prev) throw NotFound(`Checklist item ${itemId} not found`)

    const update: Record<string, unknown> = {}
    if (patch.title !== undefined) update.text = patch.title
    if (patch.completed !== undefined) update.completed = patch.completed
    if (patch.sort_order !== undefined) update.sort_order = patch.sort_order

    let query = supabase
      .from('article_checklist_items')
      .update(update)
      .eq('id', itemId)
      .eq('article_id', implementationId)
    if (ifMatch != null) {
      // W17.2: scope on the CLIENT's claimed token (not the just-read server
      // value) so a stale `If-Match` matches 0 rows and trips 412 below.
      query = query.eq('updated_at', ifMatch)
    }
    const { data, error } = await query.select(ARTICLE_CHECKLIST_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound(`Checklist item ${itemId} not found`)
    }

    const actorName = profile.name ?? profile.email ?? user.id
    const previous = prev as { text: string; completed: boolean }
    const next = data as { text: string; completed: boolean }
    let timelineBody: { text_en: string; text_ar: string } | null = null
    if (patch.completed !== undefined && previous.completed !== next.completed) {
      timelineBody = renderBilingual(
        next.completed
          ? 'regulatoryUpdates.timeline.checklistItemCompleted'
          : 'regulatoryUpdates.timeline.checklistItemUnchecked',
        { title: next.text },
      )
    } else if (patch.title !== undefined && previous.text !== next.text) {
      timelineBody = renderBilingual(
        'regulatoryUpdates.timeline.checklistItemRenamed',
        { from: previous.text, to: next.text },
      )
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'circular.article.checklist.update',
        entity_type: 'article_checklist_item',
        entity_id: itemId,
        metadata: {
          circular_id: circularId,
          article_id: implementationId,
          fields: Object.keys(update),
        },
        supabase,
      }),
      timelineBody
        ? insertArticleTimeline(supabase, implementationId, timelineBody, actorName, 'completed')
        : Promise.resolve(),
    ])

    await recomputeCircularProgress(supabase, circularId)

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId, itemId } = await params
    assertUuid(circularId, implementationId, itemId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)
    // W17-1 / SEC-1: optimistic-concurrency token. DELETE scoped to live
    // `updated_at` when `If-Match` is sent so a concurrent writer trips 412.
    const ifMatch = readIfMatch(req)

    const { data: prev } = await supabase
      .from('article_checklist_items')
      .select('text, updated_at')
      .eq('id', itemId)
      .eq('article_id', implementationId)
      .maybeSingle<{ text: string; updated_at: string }>()

    let delQuery = supabase
      .from('article_checklist_items')
      .delete()
      .eq('id', itemId)
      .eq('article_id', implementationId)
    if (ifMatch != null) {
      // W17.2: scope on the CLIENT's claimed token (see PATCH above).
      delQuery = delQuery.eq('updated_at', ifMatch)
    }
    const { data: deletedRows, error } = await delQuery.select('id')
    if (error) throw error
    if (ifMatch != null && (!deletedRows || deletedRows.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    const actorName = profile.name ?? profile.email ?? user.id
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'circular.article.checklist.delete',
        entity_type: 'article_checklist_item',
        entity_id: itemId,
        metadata: { circular_id: circularId, article_id: implementationId },
        supabase,
      }),
      insertArticleTimeline(
        supabase,
        implementationId,
        renderBilingual('regulatoryUpdates.timeline.checklistItemDeleted', {
          title: prev?.text ?? itemId,
        }),
        actorName,
        'completed',
      ),
    ])

    await recomputeCircularProgress(supabase, circularId)

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok({ id: itemId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
