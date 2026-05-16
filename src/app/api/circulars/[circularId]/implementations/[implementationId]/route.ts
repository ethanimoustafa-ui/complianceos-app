// /api/circulars/[circularId]/implementations/[implementationId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateImplementationSchema } from '@/lib/api/schemas/circulars'
import {
  IMPLEMENTATION_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string; implementationId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const patch = await parseJson(req, UpdateImplementationSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('circular_articles')
      .update(update)
      .eq('id', implementationId)
      .eq('circular_id', circularId)
      .select(IMPLEMENTATION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Implementation ${implementationId} not found`)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.implementation.update',
        entity_type: 'circular_article',
        entity_id: implementationId,
        metadata: { circular_id: circularId, fields: Object.keys(update) },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        `Implementation ${implementationId} updated`,
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

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
    const { circularId, implementationId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)

    const { error } = await supabase
      .from('circular_articles')
      .delete()
      .eq('id', implementationId)
      .eq('circular_id', circularId)
    if (error) throw error

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.implementation.delete',
        entity_type: 'circular_article',
        entity_id: implementationId,
        metadata: { circular_id: circularId },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        `Implementation ${implementationId} deleted`,
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok({ id: implementationId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
