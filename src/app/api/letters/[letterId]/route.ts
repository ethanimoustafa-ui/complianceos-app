// /api/letters/[letterId] — detail / patch / soft-delete.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateLetterSchema } from '@/lib/api/schemas/letters'
import {
  LETTER_DETAIL_COLUMNS,
  assertLetterExists,
  getApprovalSteps,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase } = await requireUser()

    const { data: letter, error } = await supabase
      .from('letters')
      .select(LETTER_DETAIL_COLUMNS)
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!letter) throw NotFound(`Letter ${letterId} not found`)

    const [steps, attachments, timeline, observations] = await Promise.all([
      getApprovalSteps(supabase, letterId),
      supabase
        .from('letter_attachments')
        .select('id, letter_id, name, storage_path, type, size, uploaded_at, uploaded_by')
        .eq('letter_id', letterId)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('letter_timeline')
        .select('id, letter_id, title, date, user_name, status')
        .eq('letter_id', letterId)
        .order('date', { ascending: false }),
      supabase
        .from('letter_observations')
        .select('observation_id')
        .eq('letter_id', letterId),
    ])

    return ok(
      {
        ...letter,
        approval_steps: steps,
        attachments: attachments.data ?? [],
        timeline: timeline.data ?? [],
        observations: ((observations.data ?? []) as { observation_id: string }[]).map(
          (r) => r.observation_id,
        ),
      },
      {
        cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.letters(letterId)] },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)
    const patch = await parseJson(req, UpdateLetterSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'template_id') continue
      if (v !== undefined) update[k] = v
    }
    if (Object.keys(update).length === 0) {
      // No-op patch; just return current row.
      const { data } = await supabase
        .from('letters')
        .select(LETTER_DETAIL_COLUMNS)
        .eq('id', letterId)
        .maybeSingle()
      return ok(data)
    }

    const { data, error } = await supabase
      .from('letters')
      .update(update)
      .eq('id', letterId)
      .is('deleted_at', null)
      .select(LETTER_DETAIL_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    // NOTE: We intentionally do NOT write to letter_timeline on every
    // PATCH. The letter editor auto-saves drafts on each keystroke, which
    // previously generated a timeline event per field change. Timeline writes
    // are now restricted to discrete workflow milestones: submit-for-approval,
    // approve-step, reject-step, send, mark-response-received, archive,
    // unarchive. (Fix-3 wave.)
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter.update',
      entity_type: 'letter',
      entity_id: letterId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase, user, profile } = await requirePerm('delete')
    await assertLetterExists(supabase, letterId)

    const { error } = await supabase
      .from('letters')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', letterId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter.delete',
      entity_type: 'letter',
      entity_id: letterId,
      supabase,
    })

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok({ id: letterId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
