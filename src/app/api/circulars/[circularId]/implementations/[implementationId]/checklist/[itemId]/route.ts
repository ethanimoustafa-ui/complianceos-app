// /api/circulars/[circularId]/implementations/[implementationId]/checklist/[itemId]
// — patch / delete a single checklist item.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = {
  params: Promise<{ circularId: string; implementationId: string; itemId: string }>
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId, itemId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)
    const patch = await parseJson(req, UpdateArticleChecklistItemSchema)

    const { data: prev, error: prevErr } = await supabase
      .from('article_checklist_items')
      .select(ARTICLE_CHECKLIST_COLUMNS)
      .eq('id', itemId)
      .eq('article_id', implementationId)
      .maybeSingle()
    if (prevErr) throw prevErr
    if (!prev) throw NotFound(`Checklist item ${itemId} not found`)

    const update: Record<string, unknown> = {}
    if (patch.title !== undefined) update.text = patch.title
    if (patch.completed !== undefined) update.completed = patch.completed
    if (patch.sort_order !== undefined) update.sort_order = patch.sort_order

    const { data, error } = await supabase
      .from('article_checklist_items')
      .update(update)
      .eq('id', itemId)
      .eq('article_id', implementationId)
      .select(ARTICLE_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Checklist item ${itemId} not found`)

    const actorName = profile.name ?? profile.email ?? user.id
    const previous = prev as { text: string; completed: boolean }
    const next = data as { text: string; completed: boolean }
    let timelineTitle: string | null = null
    if (patch.completed !== undefined && previous.completed !== next.completed) {
      timelineTitle = `Checklist item ${next.completed ? 'completed' : 'unchecked'}: ${next.text}`
    } else if (patch.title !== undefined && previous.text !== next.text) {
      timelineTitle = `Checklist item renamed: ${previous.text} → ${next.text}`
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
      timelineTitle
        ? insertArticleTimeline(supabase, implementationId, timelineTitle, actorName, 'completed')
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId, itemId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)

    const { data: prev } = await supabase
      .from('article_checklist_items')
      .select('text')
      .eq('id', itemId)
      .eq('article_id', implementationId)
      .maybeSingle<{ text: string }>()

    const { error } = await supabase
      .from('article_checklist_items')
      .delete()
      .eq('id', itemId)
      .eq('article_id', implementationId)
    if (error) throw error

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
        `Checklist item deleted: ${prev?.text ?? itemId}`,
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
