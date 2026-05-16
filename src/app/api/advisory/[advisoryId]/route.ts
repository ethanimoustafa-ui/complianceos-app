// /api/advisory/[advisoryId] — detail / patch / soft-delete.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAdvisorySchema } from '@/lib/api/schemas/advisory'
import {
  ADVISORY_DETAIL_COLUMNS,
  assertAdvisoryExists,
} from '@/lib/api/services/advisory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ advisoryId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    const { supabase } = await requireUser()

    const { data: row, error } = await supabase
      .from('advisory_requests')
      .select(ADVISORY_DETAIL_COLUMNS)
      .eq('id', advisoryId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!row) throw NotFound(`Advisory ${advisoryId} not found`)

    const { data: notes } = await supabase
      .from('advisory_notes')
      .select('id, request_id, author, content, created_at')
      .eq('request_id', advisoryId)
      .order('created_at', { ascending: false })

    return ok(
      { ...row, notes: notes ?? [] },
      {
        cache: {
          sMaxAge: 60,
          staleWhileRevalidate: 300,
          tags: [cacheTags.advisory(advisoryId)],
        },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertAdvisoryExists(supabase, advisoryId)
    const patch = await parseJson(req, UpdateAdvisorySchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('advisory_requests')
      .update(update)
      .eq('id', advisoryId)
      .is('deleted_at', null)
      .select(ADVISORY_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'advisory.update',
      entity_type: 'advisory_request',
      entity_id: advisoryId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.advisory(), cacheTags.advisory(advisoryId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { advisoryId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertAdvisoryExists(supabase, advisoryId)

    const { error } = await supabase
      .from('advisory_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', advisoryId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'advisory.delete',
      entity_type: 'advisory_request',
      entity_id: advisoryId,
      supabase,
    })

    revalidateAll([cacheTags.advisory(), cacheTags.advisory(advisoryId)])
    return ok({ id: advisoryId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
