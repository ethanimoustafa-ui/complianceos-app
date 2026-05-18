// /api/circulars/[circularId]/implementations/[implementationId]/checklist
// — list + create checklist items for an article.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateArticleChecklistItemSchema } from '@/lib/api/schemas/circulars'
import {
  ARTICLE_CHECKLIST_COLUMNS,
  assertArticleExists,
  assertCircularExists,
  insertArticleTimeline,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string; implementationId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)
    const { data, error } = await supabase
      .from('article_checklist_items')
      .select(ARTICLE_CHECKLIST_COLUMNS)
      .eq('article_id', implementationId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.circulars(circularId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    await assertArticleExists(supabase, circularId, implementationId)
    const input = await parseJson(req, CreateArticleChecklistItemSchema)

    const { data, error } = await supabase
      .from('article_checklist_items')
      .insert({
        article_id: implementationId,
        text: input.title,
        completed: input.completed,
        sort_order: input.sort_order,
      })
      .select(ARTICLE_CHECKLIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actorName = profile.name ?? profile.email ?? user.id
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'circular.article.checklist.create',
        entity_type: 'article_checklist_item',
        entity_id: created.id,
        metadata: { circular_id: circularId, article_id: implementationId, title: input.title },
        supabase,
      }),
      insertArticleTimeline(
        supabase,
        implementationId,
        `Checklist item added: ${input.title}`,
        actorName,
        'completed',
      ),
    ])

    await recomputeCircularProgress(supabase, circularId)

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
