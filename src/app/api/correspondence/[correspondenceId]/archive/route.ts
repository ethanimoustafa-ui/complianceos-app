// POST /api/correspondence/[correspondenceId]/archive — toggle archived=true.
//
// W22: assertUuid (SEC-5 §2.13).

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CORRESPONDENCE_LIST_COLUMNS,
  assertCorrespondenceExists,
} from '@/lib/api/services/correspondence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ correspondenceId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { correspondenceId } = await params
    // SEC-5 §2.13 — reject non-UUID before any DB access.
    assertUuid(correspondenceId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCorrespondenceExists(supabase, correspondenceId)

    const { data, error } = await supabase
      .from('correspondence')
      .update({ archived: true })
      .eq('id', correspondenceId)
      .is('deleted_at', null)
      .select(CORRESPONDENCE_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'correspondence.archive',
      entity_type: 'correspondence',
      entity_id: correspondenceId,
      supabase,
    })

    revalidateAll([cacheTags.correspondence(), cacheTags.correspondence(correspondenceId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
