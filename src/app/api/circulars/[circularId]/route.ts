// /api/circulars/[circularId] — detail / patch / soft-delete.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCircularSchema } from '@/lib/api/schemas/circulars'
import {
  CIRCULAR_DETAIL_COLUMNS,
  IMPLEMENTATION_COLUMNS,
  TIMELINE_COLUMNS,
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase } = await requireUser()

    const { data: row, error } = await supabase
      .from('circulars')
      .select(CIRCULAR_DETAIL_COLUMNS)
      .eq('id', circularId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!row) throw NotFound(`Circular ${circularId} not found`)

    const [workflow, impls, timeline] = await Promise.all([
      supabase
        .from('circular_workflow_steps')
        .select(WORKFLOW_STEP_COLUMNS)
        .eq('circular_id', circularId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('circular_articles')
        .select(IMPLEMENTATION_COLUMNS)
        .eq('circular_id', circularId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('circular_timeline')
        .select(TIMELINE_COLUMNS)
        .eq('circular_id', circularId)
        .order('date', { ascending: false }),
    ])

    return ok(
      {
        ...row,
        workflow_steps: workflow.data ?? [],
        implementations: impls.data ?? [],
        timeline: timeline.data ?? [],
      },
      {
        cache: {
          sMaxAge: 60,
          staleWhileRevalidate: 300,
          tags: [cacheTags.circulars(circularId)],
        },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const patch = await parseJson(req, UpdateCircularSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('circulars')
      .update(update)
      .eq('id', circularId)
      .is('deleted_at', null)
      .select(CIRCULAR_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.update',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        'Circular updated',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertCircularExists(supabase, circularId)

    // Write the audit row BEFORE the delete so it survives the FK cascade.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'circular.delete',
      entity_type: 'circular',
      entity_id: circularId,
      supabase,
    })

    const { error } = await supabase
      .from('circulars')
      .delete()
      .eq('id', circularId)
    if (error) throw error

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    revalidate(cacheTags.compliance())
    return ok({ id: circularId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
